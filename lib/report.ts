import type { StatusEvent } from "./report-status";
import type { Evidence, IssueCategory, SceneAnalysis } from "./types";

export const REVIEW_DECISIONS = ["confirmed", "corrected", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const HIGHLIGHT_RATINGS = ["correct", "partial", "wrong"] as const;
export type HighlightRating = (typeof HIGHLIGHT_RATINGS)[number];

/** A human reviewer's verdict on one AI finding. */
export interface FindingReview {
  /** confirmed: real barrier as described; corrected: real barrier, wrong category; rejected: not a barrier. */
  decision?: ReviewDecision;
  /** Required when decision is "corrected": the category the reviewer says is right. */
  correctedCategory?: IssueCategory;
  /** Whether the highlighted region shows the evidence. Asked only for real barriers. */
  highlight?: HighlightRating;
  note: string;
}

/** A barrier the reviewer can see in the photo that the AI did not report. */
export interface MissedIssue {
  id: string;
  category: IssueCategory;
  description: string;
}

export interface ReportLocation {
  /** Free-text place description, e.g. "Main St & 3rd Ave, north-east corner". */
  label: string;
  latitude?: number;
  longitude?: number;
  /** Accuracy radius in meters, as reported by the device. */
  accuracyM?: number;
}

/** Where an evaluated photo came from, so results can be reported per dataset (e.g. "own" vs "web"). */
export interface PhotoSource {
  dataset: string;
  file: string;
}

export interface ModelInfo {
  analysis: string;
  segmentation?: string;
}

/** The AI's output for one photo, before any human review. */
export interface AnalysisResult {
  width: number;
  height: number;
  analysis: SceneAnalysis;
  evidence: Evidence[];
  models: ModelInfo;
  timings: { analysisMs: number; segmentationMs?: number };
  source?: PhotoSource;
}

/** What the batch page submits: an analyzed photo waiting in the review queue. */
export interface DraftSubmission extends AnalysisResult {
  /** The analyzed photo as a JPEG data URL. */
  image: string;
}

export interface AnalysisDraft extends AnalysisResult {
  id: string;
  createdAt: string;
}

/** What the browser submits when saving a reviewed report. */
export interface ReportSubmission extends Omit<AnalysisResult, "timings"> {
  /** The photo as a JPEG data URL; omitted when the review came from a queued draft. */
  image?: string;
  /** The queued draft this review is for; its photo is reused and the draft is removed. */
  draftId?: string;
  location?: ReportLocation;
  /** Keyed by finding id; every finding must be reviewed. */
  reviews: Record<string, FindingReview>;
  missedIssues: MissedIssue[];
  reviewerNote: string;
  /** The person confirmed they may share the photo and that the report will be public. */
  consent: true;
  /** reviewMs: wall-clock time from results appearing to the report being saved. */
  timings: { analysisMs: number; segmentationMs?: number; reviewMs: number };
}

export interface SavedReport extends Omit<ReportSubmission, "image" | "draftId" | "consent"> {
  /** When the sharing statement was confirmed; absent on reports saved before consent was recorded. */
  consentedAt?: string;
  /** Status changes, oldest first, starting with "submitted"; absent on reports saved before statuses existed. */
  statusHistory?: StatusEvent[];
  id: string;
  createdAt: string;
}

/** GET /api/drafts */
export interface DraftsSummary {
  pending: number;
  /** "dataset/file" keys of every photo already queued or reviewed, so batches can skip them. */
  knownSources: string[];
}

export interface SaveReportResponse {
  id: string;
}

export function sourceKey(source: PhotoSource): string {
  return `${source.dataset}/${source.file}`;
}

export function emptyReview(): FindingReview {
  return { note: "" };
}

/** A review is complete when it has a decision, plus a highlight rating and corrected category where they apply. */
export function isReviewComplete(review: FindingReview | undefined, originalCategory: IssueCategory): boolean {
  if (!review?.decision) return false;
  if (review.decision === "rejected") return true;
  if (!review.highlight) return false;
  if (review.decision === "corrected") {
    return review.correctedCategory !== undefined && review.correctedCategory !== originalCategory;
  }
  return true;
}

export interface ReportSummary {
  findings: number;
  confirmed: number;
  corrected: number;
  rejected: number;
  missed: number;
  /** Barriers a human verified: confirmed + corrected + missed. */
  verified: number;
}

export function summarizeReport(report: Pick<SavedReport, "analysis" | "reviews" | "missedIssues">): ReportSummary {
  const decisions = report.analysis.findings.map((f) => report.reviews[f.id]?.decision);
  const count = (d: ReviewDecision) => decisions.filter((x) => x === d).length;
  const confirmed = count("confirmed");
  const corrected = count("corrected");
  const missed = report.missedIssues.length;
  return {
    findings: decisions.length,
    confirmed,
    corrected,
    rejected: count("rejected"),
    missed,
    verified: confirmed + corrected + missed,
  };
}
