import { APIConnectionTimeoutError, RateLimitError } from "openai";
import { AI_EXHAUSTED_MESSAGE, isCreditError, metered, once, requestKey } from "@/lib/ai-guard";
import { AnalysisError, analyzeImage } from "@/lib/analyze";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { cleanImage, dataUrlBytes, ImageError } from "@/lib/image-sanitize";
import { validateImageDataUrl } from "@/lib/image-input";
import { ANALYSIS_MODEL, MissingApiKeyError } from "@/lib/meta";
import { limitAiRequest } from "@/lib/rate-limit";
import type { AnalyzeResponse, ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// An 8 MB image as base64 plus JSON overhead.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const limited = await limitAiRequest("analyze", request);
  if (limited) return jsonResponse<ApiError>({ error: limited.error }, limited.status);
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const image = validateImageDataUrl((body.value as { image?: unknown } | null)?.image);
  if (typeof image !== "string") return jsonResponse<ApiError>(image, 400);

  // What goes to the Meta API is a fresh JPEG with no metadata, whatever the caller sent.
  let forwarded: string;
  try {
    forwarded = `data:image/jpeg;base64,${(await cleanImage(dataUrlBytes(image))).jpeg.toString("base64")}`;
  } catch (error) {
    if (error instanceof ImageError) return jsonResponse<ApiError>({ error: error.message }, 400);
    throw error;
  }

  try {
    // The same photo again, by a double click or a retry after a lost connection, is not paid for twice.
    const { value, cached } = await once(requestKey("analyze", ANALYSIS_MODEL, forwarded), async () => {
      const started = Date.now();
      let usage: { promptTokens?: number; completionTokens?: number } = {};
      const analysis = await metered(
        ANALYSIS_MODEL,
        () => analyzeImage(forwarded, request.signal, (u) => (usage = u)),
        () => usage,
      );
      return { analysis, analysisMs: Date.now() - started };
    });
    return jsonResponse<AnalyzeResponse>({ ...value, model: ANALYSIS_MODEL, ...(cached ? { cached } : {}) });
  } catch (error) {
    if (isCreditError(error)) return jsonResponse<ApiError>({ error: AI_EXHAUSTED_MESSAGE }, 503);
    if (error instanceof MissingApiKeyError) return jsonResponse<ApiError>({ error: error.message }, 500);
    if (error instanceof AnalysisError) return jsonResponse<ApiError>({ error: error.message }, 502);
    if (error instanceof APIConnectionTimeoutError) {
      return jsonResponse<ApiError>({ error: "The analysis took too long. Please try again." }, 504);
    }
    if (error instanceof RateLimitError) {
      return jsonResponse<ApiError>({ error: "The AI service is busy. Please wait a moment and try again." }, 503);
    }
    if (!request.signal.aborted) console.error("[analyze] Meta Model API call failed", error);
    return jsonResponse<ApiError>({ error: "The analysis service failed. Please try again." }, 502);
  }
}
