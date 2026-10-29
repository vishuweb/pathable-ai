import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics, evaluationReports, rate } from "../lib/metrics";
import type { FindingReview, SavedReport } from "../lib/report";
import type { IssueCategory } from "../lib/types";

const finding = (id: string, category: IssueCategory) => ({ id, category, title: id, located: true });

function report(
  dataset: string,
  findings: ReturnType<typeof finding>[],
  reviews: Record<string, Partial<FindingReview>>,
  missed: IssueCategory[] = [],
  reviewMs = 30_000,
): SavedReport {
  return {
    source: dataset === "single" ? undefined : { dataset, file: "x.jpg" },
    analysis: { findings },
    evidence: findings.map((f) => ({ findingId: f.id, status: "segmented", regions: [] })),
    reviews,
    missedIssues: missed.map((category, i) => ({ id: `m${i}`, category, description: "missed" })),
    timings: { analysisMs: 10_000, segmentationMs: 3_000, reviewMs },
  } as unknown as SavedReport;
}

// A: one confirmed (highlight correct), one rejected, plus one missed barrier.
// B: one corrected to a different category (highlight partial).
// C: a clear photo where the AI raised a false alarm. D: a clear photo, AI silent.
const reports = [
  report(
    "own",
    [finding("a1", "obstructed_footpath"), finding("a2", "damaged_surface")],
    { a1: { decision: "confirmed", highlight: "correct" }, a2: { decision: "rejected" } },
    ["damaged_surface"],
    20_000,
  ),
  report(
    "web",
    [finding("b1", "obstructed_footpath")],
    { b1: { decision: "corrected", correctedCategory: "blocked_curb_ramp", highlight: "partial" } },
    [],
    40_000,
  ),
  report("web", [finding("c1", "other")], { c1: { decision: "rejected" } }, [], 10_000),
  report("single", [], {}, [], 5_000),
];

test("overall counts and rates follow the human verdicts", () => {
  const [all] = computeMetrics(reports);
  assert.equal(all.photos, 4);
  assert.equal(all.photosWithBarrier, 2);
  assert.deepEqual([all.confirmed, all.corrected, all.rejected, all.missed, all.aiFindings], [1, 1, 2, 1, 4]);
  assert.equal(all.precision.value, 2 / 4);
  assert.equal(all.recall.value, 2 / 3);
  assert.equal(all.categoryAccuracy.value, 1 / 2);
  assert.equal(all.highlightCorrect.value, 1 / 2);
  assert.equal(all.highlightUseful.value, 1);
  assert.equal(all.falseAlarmPhotos.value, 1 / 2);
  assert.equal(all.medianReviewSeconds, 15);
});

test("results are split by dataset", () => {
  const [all, own, web, single] = computeMetrics(reports);
  assert.deepEqual([all, own, web, single].map((m) => m.dataset), ["all", "own", "web", "single"]);
  assert.equal(own.recall.value, 1 / 2);
  assert.equal(web.precision.value, 1 / 2);
  assert.equal(computeMetrics([reports[0]]).length, 1, "no per-dataset columns for a single dataset");
});

test("per-category results use the corrected category as the truth", () => {
  const [all] = computeMetrics(reports);
  const byCategory = Object.fromEntries(all.byCategory.map((c) => [c.category, c]));
  assert.equal(byCategory.obstructed_footpath.precision.value, 1);
  assert.equal(byCategory.blocked_curb_ramp.verified, 1);
  assert.equal(byCategory.blocked_curb_ramp.recall.value, 1);
  assert.equal(byCategory.damaged_surface.verified, 1);
  assert.equal(byCategory.damaged_surface.recall.value, 0);
  assert.equal(byCategory.damaged_surface.precision.value, 0);
});

test("rates carry a 95% Wilson interval that contains the estimate", () => {
  const half = rate(2, 4);
  assert.ok(half.low! > 0 && half.low! < 0.5);
  assert.ok(half.high! > 0.5 && half.high! < 1);
  const perfect = rate(10, 10);
  assert.equal(perfect.high, 1);
  assert.ok(perfect.low! > 0.6 && perfect.low! < 0.75, "10 of 10 is not certainty");
  assert.deepEqual(rate(0, 0), { numerator: 0, denominator: 0 });
});

test("single uploads are left out once a batch has been reviewed", () => {
  const single = reports[3];
  assert.deepEqual(evaluationReports([single]), { included: [single], excluded: 0 });
  const { included, excluded } = evaluationReports(reports);
  assert.equal(included.length, 3);
  assert.equal(excluded, 1);
});
