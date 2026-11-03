import { AI_EXHAUSTED_MESSAGE, aiExhausted, forget, metered, once, requestKey } from "@/lib/ai-guard";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { cleanImage, dataUrlBytes, ImageError } from "@/lib/image-sanitize";
import { validateImageDataUrl } from "@/lib/image-input";
import { MissingApiKeyError, SEGMENTATION_MODEL } from "@/lib/meta";
import { limitAiRequest } from "@/lib/rate-limit";
import { segmentEvidence } from "@/lib/segment";
import {
  MAX_FINDINGS,
  type ApiError,
  type NormalizedBox,
  type SegmentResponse,
  type SegmentTarget,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// An 8 MB image as base64 plus JSON overhead and targets.
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 8000;

export async function POST(request: Request) {
  const limited = await limitAiRequest("segment", request);
  if (limited) return jsonResponse<ApiError>({ error: limited.error }, limited.status);
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;

  const image = validateImageDataUrl(input.image);
  if (typeof image !== "string") return jsonResponse<ApiError>(image, 400);

  const width = Number(input.width);
  const height = Number(input.height);
  if (!isDimension(width) || !isDimension(height)) {
    return jsonResponse<ApiError>({ error: "width and height must be positive integers." }, 400);
  }

  const targets = parseTargets(input.targets);
  if (!targets) return jsonResponse<ApiError>({ error: `Provide 1–${MAX_FINDINGS} valid targets.` }, 400);

  // What goes to the Meta API is a fresh JPEG with no metadata, and the sizes must match the picture.
  let forwarded: string;
  try {
    const clean = await cleanImage(dataUrlBytes(image));
    if (clean.width !== width || clean.height !== height) {
      return jsonResponse<ApiError>({ error: "The photo's size does not match width and height." }, 400);
    }
    forwarded = `data:image/jpeg;base64,${clean.jpeg.toString("base64")}`;
  } catch (error) {
    if (error instanceof ImageError) return jsonResponse<ApiError>({ error: error.message }, 400);
    throw error;
  }

  try {
    const key = requestKey("segment", SEGMENTATION_MODEL, forwarded, JSON.stringify(targets));
    const { value } = await once(key, async () => {
      const started = Date.now();
      const evidence = await metered(SEGMENTATION_MODEL, () => segmentEvidence(forwarded, width, height, targets, request.signal));
      return { evidence, segmentationMs: Date.now() - started };
    });
    // A target that failed may succeed next time, so such a result is not reused.
    if (value.evidence.some((e) => e.status === "unavailable")) forget(key);
    // Every target failing because credits ran out is not "no evidence": say what happened.
    if (aiExhausted() && value.evidence.every((e) => e.status === "unavailable")) return jsonResponse<ApiError>({ error: AI_EXHAUSTED_MESSAGE }, 503);
    return jsonResponse<SegmentResponse>({ ...value, model: SEGMENTATION_MODEL });
  } catch (error) {
    if (error instanceof MissingApiKeyError) return jsonResponse<ApiError>({ error: error.message }, 500);
    console.error("[segment] failed", error);
    return jsonResponse<ApiError>({ error: "The segmentation service failed. Please try again." }, 502);
  }
}

function isDimension(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION;
}

function parseTargets(value: unknown): SegmentTarget[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FINDINGS) return undefined;
  const targets: SegmentTarget[] = [];
  for (const t of value) {
    if (typeof t?.findingId !== "string" || typeof t?.phrase !== "string" || !t.phrase.trim()) {
      return undefined;
    }
    const box = parseBox(t.box);
    if (!box) return undefined;
    targets.push({ findingId: t.findingId, phrase: t.phrase, box });
  }
  return targets;
}

function parseBox(b: unknown): NormalizedBox | undefined {
  if (typeof b !== "object" || b === null) return undefined;
  const { x_min, y_min, x_max, y_max } = b as Record<string, unknown>;
  const values = [x_min, y_min, x_max, y_max];
  if (!values.every((v) => typeof v === "number" && v >= 0 && v <= 1000)) return undefined;
  const box = { x_min, y_min, x_max, y_max } as NormalizedBox;
  return box.x_min < box.x_max && box.y_min < box.y_max ? box : undefined;
}
