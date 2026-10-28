import { validateImageDataUrl } from "@/lib/image-input";
import { MissingApiKeyError, SEGMENTATION_MODEL } from "@/lib/meta";
import { segmentEvidence } from "@/lib/segment";
import type { ApiError, NormalizedBox, SegmentResponse, SegmentTarget } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TARGETS = 10;
const MAX_DIMENSION = 8000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const image = validateImageDataUrl(body?.image);
  if (typeof image !== "string") return json<ApiError>(image, 400);

  const width = Number(body?.width);
  const height = Number(body?.height);
  if (!isDimension(width) || !isDimension(height)) {
    return json<ApiError>({ error: "width and height must be positive integers." }, 400);
  }

  const targets = parseTargets(body?.targets);
  if (!targets) return json<ApiError>({ error: `Provide 1–${MAX_TARGETS} valid targets.` }, 400);

  const started = Date.now();
  try {
    const evidence = await segmentEvidence(image, width, height, targets);
    return json<SegmentResponse>({
      evidence,
      model: SEGMENTATION_MODEL,
      segmentationMs: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) return json<ApiError>({ error: error.message }, 500);
    console.error("[segment] failed", error);
    return json<ApiError>({ error: "The segmentation service failed. Please try again." }, 502);
  }
}

function isDimension(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION;
}

function parseTargets(value: unknown): SegmentTarget[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TARGETS) return undefined;
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
  return { x_min, y_min, x_max, y_max } as NormalizedBox;
}

function json<T>(data: T, status = 200) {
  return Response.json(data, { status });
}
