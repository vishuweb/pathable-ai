import "server-only";
import { z } from "zod";
import { CATEGORY_INFO } from "./categories";
import { ANALYSIS_MODEL, getMetaClient } from "./meta";
import {
  IMAGE_QUALITIES,
  ISSUE_CATEGORIES,
  LEVELS,
  MAX_FINDINGS,
  type Finding,
  type NormalizedBox,
  type SceneAnalysis,
} from "./types";

const FULL_IMAGE_BOX: NormalizedBox = { x_min: 0, y_min: 0, x_max: 1000, y_max: 1000 };

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
- Report each distinct barrier once, at most ${MAX_FINDINGS} findings, most important first. Prefer fewer, well-supported findings over many speculative ones. If nothing qualifies, return an empty findings list and explain why in no_findings_reason.
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

/** `signal` aborts the upstream call, e.g. when the browser disconnects. */
export async function analyzeImage(imageDataUrl: string, signal?: AbortSignal): Promise<SceneAnalysis> {
  const response = await getMetaClient().chat.completions.create(
    {
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
    },
    { signal },
  );

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

// Strict mode constrains the shape, but the reply is still untrusted input: every field the UI
// depends on is validated, and a bad value falls back to a safe default instead of failing the
// whole analysis. Only a reply with no findings list at all is rejected.
const text = z.string().catch("");

const coordinate = z.coerce
  .number()
  .refine(Number.isFinite)
  .transform((v) => Math.min(1000, Math.max(0, Math.round(v))));

/** A box on the 0-1000 scale, with corners put in order; undefined if it is missing or degenerate. */
const modelBox = z
  .object({ x_min: coordinate, y_min: coordinate, x_max: coordinate, y_max: coordinate })
  .transform((b): NormalizedBox | undefined => {
    const [x1, x2] = [b.x_min, b.x_max].sort((a, c) => a - c);
    const [y1, y2] = [b.y_min, b.y_max].sort((a, c) => a - c);
    return x2 - x1 < 2 || y2 - y1 < 2 ? undefined : { x_min: x1, y_min: y1, x_max: x2, y_max: y2 };
  })
  .catch(undefined);

const modelFinding = z.object({
  category: z.enum(ISSUE_CATEGORIES).catch("other"),
  title: text,
  observed_condition: text,
  why_it_matters: text,
  evidence_phrase: z.string().trim().catch(""),
  evidence_box: modelBox,
  potential_impact: z.enum(LEVELS).catch("medium"),
  confidence: z.enum(LEVELS).catch("low"),
  uncertainty: text,
  suggested_next_step: text,
});

const modelAnalysis = z.object({
  scene_type: text,
  scene_summary: text,
  image_quality: z.enum(IMAGE_QUALITIES).catch("limited"),
  image_quality_notes: text,
  findings: z.array(z.unknown()),
  no_findings_reason: text,
});

export function normalizeAnalysis(raw: unknown): SceneAnalysis {
  const parsed = modelAnalysis.safeParse(raw);
  if (!parsed.success) throw new AnalysisError("The model response did not match the expected structure.");
  const findings = parsed.data.findings
    .flatMap((f) => {
      const finding = modelFinding.safeParse(f);
      return finding.success ? [finding.data] : [];
    })
    .slice(0, MAX_FINDINGS)
    .map(toFinding);
  return {
    scene_type: parsed.data.scene_type,
    scene_summary: parsed.data.scene_summary,
    image_quality: parsed.data.image_quality,
    image_quality_notes: parsed.data.image_quality_notes,
    findings,
    no_findings_reason: findings.length
      ? ""
      : parsed.data.no_findings_reason || "The model did not report any potential barriers.",
  };
}

// A finding without a usable box or phrase is kept (dropping it would hide a possible barrier),
// but marked unlocated so it is not segmented or drawn.
function toFinding(f: z.infer<typeof modelFinding>): Finding {
  const located = f.evidence_box !== undefined && f.evidence_phrase !== "";
  if (!located) console.warn("[analyze] finding has no usable evidence location", { title: f.title });
  return {
    id: crypto.randomUUID(),
    category: f.category,
    title: f.title,
    observed_condition: f.observed_condition,
    why_it_matters: f.why_it_matters,
    evidence_phrase: f.evidence_phrase || CATEGORY_INFO[f.category].label.toLowerCase(),
    evidence_box: f.evidence_box ?? FULL_IMAGE_BOX,
    located,
    potential_impact: f.potential_impact,
    confidence: f.confidence,
    uncertainty: f.uncertainty,
    suggested_next_step: f.suggested_next_step,
  };
}
