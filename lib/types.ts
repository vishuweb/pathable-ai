export const ISSUE_CATEGORIES = [
  "blocked_curb_ramp",
  "obstructed_footpath",
  "damaged_surface",
  "difficult_entrance",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const LEVELS = ["low", "medium", "high"] as const;
export type Level = (typeof LEVELS)[number];

export const IMAGE_QUALITIES = ["good", "limited", "poor"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/** Bounding box on a 0–1000 scale relative to image width/height. */
export interface NormalizedBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

/** One candidate barrier as proposed by the model, before human review. */
export interface Finding {
  id: string;
  category: IssueCategory;
  title: string;
  observed_condition: string;
  why_it_matters: string;
  /** Short noun phrase naming the visible evidence, used as the SAM 3.1 prompt. */
  evidence_phrase: string;
  evidence_box: NormalizedBox;
  potential_impact: Level;
  confidence: Level;
  uncertainty: string;
  suggested_next_step: string;
}

export interface SceneAnalysis {
  scene_type: string;
  scene_summary: string;
  image_quality: ImageQuality;
  image_quality_notes: string;
  findings: Finding[];
  /** Why nothing was reported; empty when there are findings. */
  no_findings_reason: string;
}

export interface AnalyzeResponse {
  analysis: SceneAnalysis;
  model: string;
  analysisMs: number;
}

/** Box in image pixels with half-open right/bottom edges (same convention as SAM parser bounds). */
export interface PixelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One segmented object drawn as evidence. `path` is in mask-raster space; `box` places it on the image. */
export interface EvidenceRegion {
  objectId: string;
  box: PixelBox;
  path: string;
  maskWidth: number;
  maskHeight: number;
  confidence?: number;
}

export type EvidenceStatus = "segmented" | "approximate" | "unavailable";

export interface Evidence {
  findingId: string;
  phrase: string;
  /**
   * segmented: SAM 3.1 found matching objects inside the model's box.
   * approximate: SAM found nothing that matches, so only the model's rough box is shown.
   * unavailable: segmentation failed; only the rough box is shown.
   */
  status: EvidenceStatus;
  regions: EvidenceRegion[];
  /** The analysis model's rough box, in pixels. Always present as a fallback. */
  modelBox: PixelBox;
  note: string;
}

export interface SegmentTarget {
  findingId: string;
  phrase: string;
  box: NormalizedBox;
}

export interface SegmentRequest {
  image: string;
  width: number;
  height: number;
  targets: SegmentTarget[];
}

export interface SegmentResponse {
  evidence: Evidence[];
  model: string;
  segmentationMs: number;
}

export interface ApiError {
  error: string;
}
