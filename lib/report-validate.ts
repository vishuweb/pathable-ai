import "server-only";
import { validateImageDataUrl } from "./image-input";
import { PLACE_AREAS } from "./observations";
import { OSM_TYPES } from "./place";
import { activeRegion, inRegion } from "./region";
import {
  HIGHLIGHT_RATINGS,
  REVIEW_DECISIONS,
  isReviewComplete,
  type AnalysisResult,
  type DraftSubmission,
  type FindingReview,
  type MissedIssue,
  type PhotoSource,
  type ReportSubmission,
  type ReportLocation,
} from "./report";
import {
  EVIDENCE_STATUSES,
  IMAGE_QUALITIES,
  ISSUE_CATEGORIES,
  LEVELS,
  MAX_FINDINGS,
  type Evidence,
  type EvidenceRegion,
  type Finding,
  type NormalizedBox,
  type PixelBox,
  type SceneAnalysis,
} from "./types";

const MAX_MISSED = 20;
const MAX_DIMENSION = 8000;
const SVG_PATH_RE = /^[MLZ0-9 .\-]*$/;

class InvalidReport extends Error {}

/** Validates a report submitted by the browser. Returns the cleaned submission or a user-facing error. */
export function parseReportSubmission(value: unknown): ReportSubmission | { error: string } {
  return guard(() => {
    const body = record(value, "The report");
    const result = parseAnalysisResult(body);
    const draftId = body.draftId == null ? undefined : text(body.draftId, "The draft id", 64, true);
    const image = draftId ? undefined : parseJpeg(body.image);
    if (body.consent !== true) fail("Confirm the sharing statement before saving.");
    const timings = record(body.timings, "timings");
    return {
      ...result,
      image,
      draftId,
      location: body.location == null ? undefined : parseLocation(body.location),
      reviews: parseReviews(body.reviews, result.analysis.findings),
      missedIssues: list(body.missedIssues ?? [], "missed issues", MAX_MISSED).map(parseMissedIssue),
      reviewerNote: optionalText(body.reviewerNote, "The reviewer note", 4000),
      area: optionalOneOf(body.area, PLACE_AREAS, "The affected area"),
      observedOn: parseObservedOn(body.observedOn),
      consent: true,
      timings: { ...result.timings, reviewMs: number(timings.reviewMs, "reviewMs", 0, 7 * 24 * 3_600_000) },
    };
  });
}

/** Validates an analyzed photo submitted by the batch page for the review queue. */
export function parseDraftSubmission(value: unknown): DraftSubmission | { error: string } {
  return guard(() => {
    const body = record(value, "The draft");
    return { ...parseAnalysisResult(body), image: parseJpeg(body.image) };
  });
}

function guard<T>(parse: () => T): T | { error: string } {
  try {
    return parse();
  } catch (error) {
    if (error instanceof InvalidReport) return { error: error.message };
    throw error;
  }
}

function parseJpeg(value: unknown): string {
  const image = validateImageDataUrl(value);
  if (typeof image !== "string") fail(image.error);
  if (!image.startsWith("data:image/jpeg;base64,")) fail("The photo must be a JPEG.");
  return image;
}

function parseAnalysisResult(body: Record<string, unknown>): AnalysisResult {
  const analysis = parseAnalysis(body.analysis);
  const findingIds = new Set(analysis.findings.map((f) => f.id));
  if (findingIds.size !== analysis.findings.length) fail("Finding ids must be unique.");
  const models = record(body.models, "models");
  const timings = record(body.timings, "timings");
  return {
    width: integer(body.width, "width", 1, MAX_DIMENSION),
    height: integer(body.height, "height", 1, MAX_DIMENSION),
    analysis,
    evidence: list(body.evidence, "evidence", MAX_FINDINGS)
      .map(parseEvidence)
      .filter((e) => findingIds.has(e.findingId)),
    models: {
      analysis: text(models.analysis, "The analysis model", 100, true),
      segmentation:
        models.segmentation == null ? undefined : text(models.segmentation, "The segmentation model", 100),
    },
    timings: {
      analysisMs: number(timings.analysisMs, "analysisMs", 0, 3_600_000),
      segmentationMs:
        timings.segmentationMs == null ? undefined : number(timings.segmentationMs, "segmentationMs", 0, 3_600_000),
    },
    source: body.source == null ? undefined : parseSource(body.source),
  };
}

function parseSource(value: unknown): PhotoSource {
  const s = record(value, "The photo source");
  const dataset = text(s.dataset, "The dataset name", 40, true);
  if (!/^[a-z0-9-]+$/.test(dataset)) fail("The dataset name may use only lowercase letters, digits and dashes.");
  return { dataset, file: text(s.file, "The photo file name", 260, true) };
}

function parseAnalysis(value: unknown): SceneAnalysis {
  const a = record(value, "analysis");
  return {
    scene_type: text(a.scene_type, "scene_type", 300),
    scene_summary: text(a.scene_summary, "scene_summary", 2000),
    image_quality: oneOf(a.image_quality, IMAGE_QUALITIES, "image_quality"),
    image_quality_notes: text(a.image_quality_notes, "image_quality_notes", 2000),
    findings: list(a.findings, "findings", MAX_FINDINGS).map(parseFinding),
    no_findings_reason: text(a.no_findings_reason, "no_findings_reason", 2000),
  };
}

function parseFinding(value: unknown): Finding {
  const f = record(value, "A finding");
  return {
    id: text(f.id, "A finding id", 64, true),
    category: oneOf(f.category, ISSUE_CATEGORIES, "A finding category"),
    title: text(f.title, "A finding title", 300),
    observed_condition: text(f.observed_condition, "observed_condition", 2000),
    why_it_matters: text(f.why_it_matters, "why_it_matters", 2000),
    evidence_phrase: text(f.evidence_phrase, "evidence_phrase", 200),
    evidence_box: parseNormalizedBox(f.evidence_box),
    located: f.located !== false,
    potential_impact: oneOf(f.potential_impact, LEVELS, "potential_impact"),
    confidence: oneOf(f.confidence, LEVELS, "confidence"),
    uncertainty: text(f.uncertainty, "uncertainty", 2000),
    suggested_next_step: text(f.suggested_next_step, "suggested_next_step", 2000),
  };
}

function parseNormalizedBox(value: unknown): NormalizedBox {
  const b = record(value, "evidence_box");
  return {
    x_min: number(b.x_min, "evidence_box", 0, 1000),
    y_min: number(b.y_min, "evidence_box", 0, 1000),
    x_max: number(b.x_max, "evidence_box", 0, 1000),
    y_max: number(b.y_max, "evidence_box", 0, 1000),
  };
}

function parseEvidence(value: unknown): Evidence {
  const e = record(value, "Evidence");
  return {
    findingId: text(e.findingId, "An evidence finding id", 64, true),
    phrase: text(e.phrase, "An evidence phrase", 200),
    status: oneOf(e.status, EVIDENCE_STATUSES, "An evidence status"),
    regions: list(e.regions, "evidence regions", 50).map(parseRegion),
    modelBox: parsePixelBox(e.modelBox),
    note: text(e.note, "An evidence note", 500),
  };
}

function parseRegion(value: unknown): EvidenceRegion {
  const r = record(value, "An evidence region");
  if (typeof r.path !== "string" || r.path.length > 1_000_000 || !SVG_PATH_RE.test(r.path)) {
    fail("An evidence outline is not valid.");
  }
  return {
    objectId: text(r.objectId, "An evidence object id", 32, true),
    box: parsePixelBox(r.box),
    path: r.path,
    maskWidth: integer(r.maskWidth, "maskWidth", 1, MAX_DIMENSION),
    maskHeight: integer(r.maskHeight, "maskHeight", 1, MAX_DIMENSION),
    confidence: r.confidence == null ? undefined : number(r.confidence, "confidence", 0, 1),
  };
}

function parsePixelBox(value: unknown): PixelBox {
  const b = record(value, "A box");
  return {
    left: number(b.left, "A box", -MAX_DIMENSION, MAX_DIMENSION),
    top: number(b.top, "A box", -MAX_DIMENSION, MAX_DIMENSION),
    right: number(b.right, "A box", -MAX_DIMENSION, MAX_DIMENSION),
    bottom: number(b.bottom, "A box", -MAX_DIMENSION, MAX_DIMENSION),
  };
}

function parseReviews(value: unknown, findings: Finding[]): Record<string, FindingReview> {
  const input = record(value ?? {}, "reviews");
  const reviews: Record<string, FindingReview> = {};
  for (const finding of findings) {
    if (input[finding.id] == null) fail("Review every finding before saving.");
    const r = record(input[finding.id], "A review");
    const review: FindingReview = {
      decision: optionalOneOf(r.decision, REVIEW_DECISIONS, "A review decision"),
      correctedCategory: optionalOneOf(r.correctedCategory, ISSUE_CATEGORIES, "A corrected category"),
      highlight: optionalOneOf(r.highlight, HIGHLIGHT_RATINGS, "A highlight rating"),
      note: optionalText(r.note, "A review note", 2000),
    };
    if (!isReviewComplete(review, finding.category)) fail("Review every finding before saving.");
    // Drop answers that do not apply to the chosen decision.
    if (review.decision !== "corrected") delete review.correctedCategory;
    if (review.decision === "rejected") delete review.highlight;
    reviews[finding.id] = review;
  }
  return reviews;
}

function parseMissedIssue(value: unknown): MissedIssue {
  const m = record(value, "A missed issue");
  return {
    id: crypto.randomUUID(),
    category: oneOf(m.category, ISSUE_CATEGORIES, "A missed issue category"),
    description: text(m.description, "A missed issue description", 1000, true),
  };
}

function parseLocation(value: unknown): ReportLocation | undefined {
  const l = record(value, "The location");
  const location: ReportLocation = { label: optionalText(l.label, "The location", 200) };
  if (l.place != null) {
    const p = record(l.place, "The place");
    location.place = {
      osmType: oneOf(p.osmType, OSM_TYPES, "The place type"),
      osmId: integer(p.osmId, "The place id", 1, Number.MAX_SAFE_INTEGER),
      name: text(p.name, "The place name", 200, true),
    };
  }
  const hasCoordinates = l.latitude != null || l.longitude != null;
  if (hasCoordinates) {
    location.latitude = number(l.latitude, "Latitude", -90, 90);
    location.longitude = number(l.longitude, "Longitude", -180, 180);
    const region = activeRegion();
    if (!inRegion(region, location.latitude, location.longitude)) {
      fail(`This location is outside the ${region.name} pilot area. Reports are limited to the pilot area for now.`);
    }
    if (l.accuracyM != null) location.accuracyM = number(l.accuracyM, "Location accuracy", 0, 100_000);
  }
  if (location.place && !hasCoordinates) fail("A chosen place must include its coordinates.");
  return location.label || hasCoordinates || location.place ? location : undefined;
}

function fail(message: string): never {
  throw new InvalidReport(message);
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} is missing or invalid.`);
  return value as Record<string, unknown>;
}

function list(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`The ${what} list is missing.`);
  if (value.length > max) fail(`At most ${max} ${what} can be saved.`);
  return value;
}

function text(value: unknown, what: string, max: number, required = false): string {
  if (typeof value !== "string") fail(`${what} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) fail(`${what} is required.`);
  if (trimmed.length > max) fail(`${what} is longer than ${max} characters.`);
  return trimmed;
}

function optionalText(value: unknown, what: string, max: number): string {
  return value == null ? "" : text(value, what, max);
}

function number(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`${what} is out of range.`);
  }
  return value;
}

function integer(value: unknown, what: string, min: number, max: number): number {
  const n = number(value, what, min, max);
  if (!Number.isInteger(n)) fail(`${what} must be a whole number.`);
  return n;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (!allowed.includes(value as T)) fail(`${what} is not valid.`);
  return value as T;
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T | undefined {
  return value == null ? undefined : oneOf(value, allowed, what);
}

/** An optional day (YYYY-MM-DD) the reporter saw the barrier; never in the future. */
function parseObservedOn(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail("The observation date is not valid.");
  }
  if (Date.parse(`${value}T00:00:00Z`) > Date.now() + 24 * 60 * 60 * 1000) fail("The observation date cannot be in the future.");
  return value;
}
