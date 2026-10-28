import "server-only";
import { CATEGORY_INFO } from "./categories";
import { ANALYSIS_MODEL, getMetaClient } from "./meta";
import {
  IMAGE_QUALITIES,
  ISSUE_CATEGORIES,
  LEVELS,
  type Finding,
  type NormalizedBox,
  type SceneAnalysis,
} from "./types";

const categoryGuide = ISSUE_CATEGORIES.map(
  (c) => `- ${c}: ${CATEGORY_INFO[c].description}`,
).join("\n");

const SYSTEM_PROMPT = `You are an assistant to a pedestrian accessibility auditor. You examine a single photo of a public space and identify POTENTIAL barriers for wheelchair users, people with mobility limitations, older adults, and others who rely on accessible pedestrian infrastructure.

Categories:
${categoryGuide}

Rules:
- Report only conditions that are visibly supported by the photo. Never invent objects or conditions you cannot see.
- These are candidate issues for a human to verify, not conclusions. Do not claim a route is inaccessible just because an object is present; describe how it may affect passage and what a reviewer should check (for example the remaining clear width).
- Never claim compliance or non-compliance with ADA or any other standard; you cannot measure from a photo.
- Report each distinct barrier once. Prefer fewer, well-supported findings over many speculative ones. If nothing qualifies, return an empty findings list and explain why in no_findings_reason.
- evidence_phrase must be a short concrete noun phrase (1-4 words) naming the visible object or region that is the evidence, written for an open-vocabulary segmentation model. Examples: "electric scooter", "parked car", "stairs", "cracked pavement", "construction barrier". Not a sentence, not a command.
- evidence_box is the tight bounding box of that evidence on a 0-1000 scale, where (0,0) is the top-left and (1000,1000) is the bottom-right of the image. Integers only, x_min < x_max and y_min < y_max.
- confidence reflects how clearly the photo shows the condition. potential_impact reflects how much it could affect someone's passage if confirmed.
- uncertainty states what cannot be determined from this photo (angle, occlusion, scale, lighting, whether an object is temporary).
- suggested_next_step is one practical action for a reviewer or maintenance team.
- Write plainly and briefly. title is at most 8 words.`;

const boxSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x_min", "y_min", "x_max", "y_max"],
  properties: {
    x_min: { type: "integer" },
    y_min: { type: "integer" },
    x_max: { type: "integer" },
    y_max: { type: "integer" },
  },
} as const;

const findingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "title",
    "observed_condition",
    "why_it_matters",
    "evidence_phrase",
    "evidence_box",
    "potential_impact",
    "confidence",
    "uncertainty",
    "suggested_next_step",
  ],
  properties: {
    category: { type: "string", enum: ISSUE_CATEGORIES },
    title: { type: "string" },
    observed_condition: { type: "string" },
    why_it_matters: { type: "string" },
    evidence_phrase: { type: "string" },
    evidence_box: boxSchema,
    potential_impact: { type: "string", enum: LEVELS },
    confidence: { type: "string", enum: LEVELS },
    uncertainty: { type: "string" },
    suggested_next_step: { type: "string" },
  },
} as const;

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "scene_type",
    "scene_summary",
    "image_quality",
    "image_quality_notes",
    "findings",
    "no_findings_reason",
  ],
  properties: {
    scene_type: { type: "string" },
    scene_summary: { type: "string" },
    image_quality: { type: "string", enum: IMAGE_QUALITIES },
    image_quality_notes: { type: "string" },
    findings: { type: "array", items: findingSchema },
    no_findings_reason: { type: "string" },
  },
} as const;

export class AnalysisError extends Error {}

export async function analyzeImage(imageDataUrl: string): Promise<SceneAnalysis> {
  const response = await getMetaClient().chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Identify potential accessibility barriers in this photo." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "accessibility_analysis", strict: true, schema: analysisSchema },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new AnalysisError("The model returned an empty response.");

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AnalysisError("The model returned output that is not valid JSON.");
  }
  return normalizeAnalysis(raw);
}

// Strict mode constrains the shape, but we still guard the values the UI depends on.
function normalizeAnalysis(raw: unknown): SceneAnalysis {
  if (!isRecord(raw) || !Array.isArray(raw.findings)) {
    throw new AnalysisError("The model response did not match the expected structure.");
  }
  const findings = raw.findings.filter(isRecord).map(normalizeFinding).filter(isPresent);
  return {
    scene_type: str(raw.scene_type),
    scene_summary: str(raw.scene_summary),
    image_quality: oneOf(raw.image_quality, IMAGE_QUALITIES, "limited"),
    image_quality_notes: str(raw.image_quality_notes),
    findings,
    no_findings_reason: findings.length ? "" : str(raw.no_findings_reason),
  };
}

function normalizeFinding(f: Record<string, unknown>): Finding | undefined {
  const box = normalizeBox(f.evidence_box);
  const evidencePhrase = str(f.evidence_phrase).trim();
  if (!box || !evidencePhrase) return undefined;
  return {
    id: crypto.randomUUID(),
    category: oneOf(f.category, ISSUE_CATEGORIES, "other"),
    title: str(f.title),
    observed_condition: str(f.observed_condition),
    why_it_matters: str(f.why_it_matters),
    evidence_phrase: evidencePhrase,
    evidence_box: box,
    potential_impact: oneOf(f.potential_impact, LEVELS, "medium"),
    confidence: oneOf(f.confidence, LEVELS, "low"),
    uncertainty: str(f.uncertainty),
    suggested_next_step: str(f.suggested_next_step),
  };
}

function normalizeBox(b: unknown): NormalizedBox | undefined {
  if (!isRecord(b)) return undefined;
  const clamp = (v: unknown) => Math.min(1000, Math.max(0, Math.round(Number(v))));
  const [x1, x2] = [clamp(b.x_min), clamp(b.x_max)].sort((a, c) => a - c);
  const [y1, y2] = [clamp(b.y_min), clamp(b.y_max)].sort((a, c) => a - c);
  if ([x1, x2, y1, y2].some(Number.isNaN) || x2 - x1 < 2 || y2 - y1 < 2) return undefined;
  return { x_min: x1, y_min: y1, x_max: x2, y_max: y2 };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPresent<T>(v: T | undefined): v is T {
  return v !== undefined;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
