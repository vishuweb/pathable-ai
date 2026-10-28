import { AnalysisError, analyzeImage } from "@/lib/analyze";
import { validateImageDataUrl } from "@/lib/image-input";
import { ANALYSIS_MODEL, MissingApiKeyError } from "@/lib/meta";
import type { AnalyzeResponse, ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const image = validateImageDataUrl(body?.image);
  if (typeof image !== "string") return json<ApiError>(image, 400);

  const started = Date.now();
  try {
    const analysis = await analyzeImage(image);
    return json<AnalyzeResponse>({
      analysis,
      model: ANALYSIS_MODEL,
      analysisMs: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) return json<ApiError>({ error: error.message }, 500);
    if (error instanceof AnalysisError) return json<ApiError>({ error: error.message }, 502);
    console.error("[analyze] Meta Model API call failed", error);
    return json<ApiError>({ error: "The analysis service failed. Please try again." }, 502);
  }
}

function json<T>(data: T, status = 200) {
  return Response.json(data, { status });
}
