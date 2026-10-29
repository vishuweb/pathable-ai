import assert from "node:assert/strict";
import { test } from "node:test";
import { isReviewComplete } from "../lib/report";

test("a review needs a decision", () => {
  assert.equal(isReviewComplete(undefined, "other"), false);
  assert.equal(isReviewComplete({ note: "" }, "other"), false);
});

test("a rejected finding needs nothing more", () => {
  assert.equal(isReviewComplete({ note: "", decision: "rejected" }, "other"), true);
});

test("a real barrier needs a highlight rating", () => {
  assert.equal(isReviewComplete({ note: "", decision: "confirmed" }, "other"), false);
  assert.equal(isReviewComplete({ note: "", decision: "confirmed", highlight: "partial" }, "other"), true);
});

test("a correction needs a different category", () => {
  const corrected = { note: "", decision: "corrected" as const, highlight: "correct" as const };
  assert.equal(isReviewComplete(corrected, "other"), false);
  assert.equal(isReviewComplete({ ...corrected, correctedCategory: "other" }, "other"), false);
  assert.equal(isReviewComplete({ ...corrected, correctedCategory: "blocked_curb_ramp" }, "other"), true);
});
