// Browser-side analysis pipeline shared by the single-photo workspace and the batch page:
// prepare the photo, analyze it with Muse Spark, then segment the evidence with SAM 3.1.
import { toPixelBox } from "./geometry";
import { prepareImage, type PreparedImage } from "./prepare-image";
import type { ModelInfo } from "./report";
import type {
  AnalyzeResponse,
  Evidence,
  Finding,
  SceneAnalysis,
  SegmentRequest,
  SegmentResponse,
} from "./types";

export interface PipelineResult {
  image: PreparedImage;
  analysis: SceneAnalysis;
  evidence: Record<string, Evidence>;
  models: ModelInfo;
  timings: { analysisMs: number; segmentationMs?: number };
}

export interface PipelineHooks {
  onPrepared?: (image: PreparedImage) => void;
  onAnalyzed?: (analysis: SceneAnalysis, analysisMs: number) => void;
  onSegmenting?: () => void;
  /** Return true to stop early, e.g. when the user started a newer run. */
  isCancelled?: () => boolean;
}

export class PipelineCancelled extends Error {}

export async function runPipeline(file: Blob, hooks: PipelineHooks = {}): Promise<PipelineResult> {
  const checkpoint = () => {
    if (hooks.isCancelled?.()) throw new PipelineCancelled();
  };

  const image = await prepareImage(file);
  checkpoint();
  hooks.onPrepared?.(image);

  const analyzed = await postJson<AnalyzeResponse>("/api/analyze", { image: image.dataUrl });
  checkpoint();
  hooks.onAnalyzed?.(analyzed.analysis, analyzed.analysisMs);

  const { findings } = analyzed.analysis;
  const located = findings.filter((f) => f.located);
  const evidence = fallbackEvidence(
    findings.filter((f) => !f.located),
    image,
    "unlocated",
    "The AI did not point to a specific area for this finding.",
  );
  const result: PipelineResult = {
    image,
    analysis: analyzed.analysis,
    evidence,
    models: { analysis: analyzed.model },
    timings: { analysisMs: analyzed.analysisMs },
  };
  if (!located.length) return result;

  hooks.onSegmenting?.();
  try {
    const request: SegmentRequest = {
      image: image.dataUrl,
      width: image.width,
      height: image.height,
      targets: located.map((f) => ({ findingId: f.id, phrase: f.evidence_phrase, box: f.evidence_box })),
    };
    const segmented = await postJson<SegmentResponse>("/api/segment", request);
    for (const e of segmented.evidence) evidence[e.findingId] = e;
    result.models.segmentation = segmented.model;
    result.timings.segmentationMs = segmented.segmentationMs;
  } catch (error) {
    // Findings are still useful without masks: fall back to the model's approximate boxes.
    console.warn("[segment] falling back to approximate boxes", error);
    Object.assign(
      evidence,
      fallbackEvidence(located, image, "unavailable", "Segmentation was unavailable, so only the approximate area is shown."),
    );
  }
  checkpoint();
  return result;
}

function fallbackEvidence(
  findings: Finding[],
  image: PreparedImage,
  status: "unlocated" | "unavailable",
  note: string,
): Record<string, Evidence> {
  return Object.fromEntries(
    findings.map((f) => [
      f.id,
      {
        findingId: f.id,
        phrase: f.evidence_phrase,
        status,
        regions: [],
        modelBox: toPixelBox(f.evidence_box, image.width, image.height),
        note,
      } satisfies Evidence,
    ]),
  );
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}
