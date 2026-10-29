import { APIConnectionTimeoutError, RateLimitError } from "openai";
import { AnalysisError, analyzeImage } from "@/lib/analyze";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { validateImageDataUrl } from "@/lib/image-input";
import { ANALYSIS_MODEL, MissingApiKeyError } from "@/lib/meta";
import { RATE_LIMITED, allowRequest } from "@/lib/rate-limit";
import type { AnalyzeResponse, ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// An 8 MB image as base64 plus JSON overhead.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await allowRequest("analyze", request))) return jsonResponse<ApiError>({ error: RATE_LIMITED }, 429);
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const image = validateImageDataUrl((body.value as { image?: unknown } | null)?.image);
  if (typeof image !== "string") return jsonResponse<ApiError>(image, 400);

  const started = Date.now();
  try {
    const analysis = await analyzeImage(image, request.signal);
    return jsonResponse<AnalyzeResponse>({
      analysis,
      model: ANALYSIS_MODEL,
      analysisMs: Date.now() - started,
    });
  } catch (error) {
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
