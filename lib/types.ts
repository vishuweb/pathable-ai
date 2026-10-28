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

export interface ApiError {
  error: string;
}
