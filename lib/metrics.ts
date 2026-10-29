// Evaluation metrics computed from human-reviewed reports. Every human verdict is a label:
// confirmed/corrected findings are true positives, rejected ones false positives, and barriers
// the reviewer added as "missed" are false negatives.
import type { HighlightRating, SavedReport } from "./report";
import { ISSUE_CATEGORIES, type EvidenceStatus, type IssueCategory } from "./types";

export interface Rate {
  numerator: number;
  denominator: number;
  /** Undefined when the denominator is 0. */
  value?: number;
  /** 95% Wilson score interval. */
  low?: number;
  high?: number;
}

export interface CategoryMetrics {
  category: IssueCategory;
  /** AI findings the model put in this category, and how many were real barriers. */
  aiFindings: number;
  precision: Rate;
  /** Verified barriers whose true category is this one, and how many the AI found. */
  verified: number;
  recall: Rate;
}

export interface DatasetMetrics {
  dataset: string;
  photos: number;
  photosWithBarrier: number;
  aiFindings: number;
  confirmed: number;
  corrected: number;
  rejected: number;
  missed: number;
  precision: Rate;
  recall: Rate;
  categoryAccuracy: Rate;
  highlights: Record<HighlightRating, number>;
  highlightCorrect: Rate;
  highlightUseful: Rate;
  evidence: Record<EvidenceStatus, number>;
  /** Photos with no verified barrier where the AI still reported something. */
  falseAlarmPhotos: Rate;
  medianReviewSeconds?: number;
  medianAnalysisSeconds?: number;
  medianPipelineSeconds?: number;
  byCategory: CategoryMetrics[];
}

export const ALL_DATASETS = "all";

/** Metrics for all reports together, then for each dataset present. */
export function computeMetrics(reports: SavedReport[]): DatasetMetrics[] {
  const groups = new Map<string, SavedReport[]>();
  for (const r of reports) {
    const key = datasetOf(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const order = ["own", "web", "single"];
  const keys = [...groups.keys()].sort((a, b) => rank(a, order) - rank(b, order) || a.localeCompare(b));
  return [metricsFor(ALL_DATASETS, reports), ...(keys.length > 1 ? keys.map((k) => metricsFor(k, groups.get(k)!)) : [])];
}

/**
 * The reports that count as the evaluation set: photos from a batch (own or web). Single uploads,
 * such as visitors trying a public demo, count only while no batch has been reviewed.
 */
export function evaluationReports(reports: SavedReport[]): { included: SavedReport[]; excluded: number } {
  const batch = reports.filter((r) => r.source);
  return batch.length ? { included: batch, excluded: reports.length - batch.length } : { included: reports, excluded: 0 };
}

export function datasetOf(report: SavedReport): string {
  return report.source?.dataset ?? "single";
}

function metricsFor(dataset: string, reports: SavedReport[]): DatasetMetrics {
  let confirmed = 0;
  let corrected = 0;
  let rejected = 0;
  let missed = 0;
  let photosWithBarrier = 0;
  let clearPhotos = 0;
  let falseAlarms = 0;
  const highlights: Record<HighlightRating, number> = { correct: 0, partial: 0, wrong: 0 };
  const evidence: Record<EvidenceStatus, number> = { segmented: 0, approximate: 0, unavailable: 0, unlocated: 0 };
  const perCategory = new Map<IssueCategory, { aiFindings: number; aiReal: number; verified: number; found: number }>(
    ISSUE_CATEGORIES.map((c) => [c, { aiFindings: 0, aiReal: 0, verified: 0, found: 0 }]),
  );

  for (const report of reports) {
    let verifiedHere = report.missedIssues.length;
    for (const finding of report.analysis.findings) {
      const review = report.reviews[finding.id];
      const ai = perCategory.get(finding.category)!;
      ai.aiFindings++;
      const status = report.evidence.find((e) => e.findingId === finding.id)?.status;
      if (status) evidence[status]++;
      if (review?.decision === "rejected") {
        rejected++;
        continue;
      }
      if (review?.decision !== "confirmed" && review?.decision !== "corrected") continue;
      if (review.decision === "confirmed") confirmed++;
      else corrected++;
      verifiedHere++;
      ai.aiReal++;
      const trueCategory = review.decision === "corrected" && review.correctedCategory ? review.correctedCategory : finding.category;
      const truth = perCategory.get(trueCategory)!;
      truth.verified++;
      truth.found++;
      if (review.highlight) highlights[review.highlight]++;
    }
    for (const issue of report.missedIssues) {
      missed++;
      perCategory.get(issue.category)!.verified++;
    }
    if (verifiedHere > 0) {
      photosWithBarrier++;
    } else {
      clearPhotos++;
      if (report.analysis.findings.length > 0) falseAlarms++;
    }
  }

  const real = confirmed + corrected;
  const rated = highlights.correct + highlights.partial + highlights.wrong;
  return {
    dataset,
    photos: reports.length,
    photosWithBarrier,
    aiFindings: real + rejected,
    confirmed,
    corrected,
    rejected,
    missed,
    precision: rate(real, real + rejected),
    recall: rate(real, real + missed),
    categoryAccuracy: rate(confirmed, real),
    highlights,
    highlightCorrect: rate(highlights.correct, rated),
    highlightUseful: rate(highlights.correct + highlights.partial, rated),
    evidence,
    falseAlarmPhotos: rate(falseAlarms, clearPhotos),
    medianReviewSeconds: median(reports.map((r) => r.timings.reviewMs / 1000)),
    medianAnalysisSeconds: median(reports.map((r) => r.timings.analysisMs / 1000)),
    medianPipelineSeconds: median(reports.map((r) => (r.timings.analysisMs + (r.timings.segmentationMs ?? 0)) / 1000)),
    byCategory: ISSUE_CATEGORIES.map((category) => {
      const c = perCategory.get(category)!;
      return {
        category,
        aiFindings: c.aiFindings,
        precision: rate(c.aiReal, c.aiFindings),
        verified: c.verified,
        recall: rate(c.found, c.verified),
      };
    }),
  };
}

export function rate(numerator: number, denominator: number): Rate {
  if (denominator === 0) return { numerator, denominator };
  const [low, high] = wilson(numerator, denominator);
  return { numerator, denominator, value: numerator / denominator, low, high };
}

/** 95% Wilson score interval: honest for small samples and rates near 0 or 1. */
function wilson(k: number, n: number, z = 1.96): [number, number] {
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function median(values: number[]): number | undefined {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rank(key: string, order: string[]): number {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
}
