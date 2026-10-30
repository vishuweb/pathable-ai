import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORY_INFO } from "../lib/categories";
import { NEEDS, NEED_GROUPS, groupsOf, parsePreferences } from "../lib/needs";
import { verifiedNeeds, type SavedReport } from "../lib/report";
import { ISSUE_CATEGORIES } from "../lib/types";

test("every barrier category names the needs it may affect", () => {
  for (const category of ISSUE_CATEGORIES) {
    const needs = CATEGORY_INFO[category].needs;
    assert.ok(needs.length > 0, category);
    assert.ok(needs.every((n) => NEED_GROUPS.includes(n)), category);
  }
  const covered = new Set(ISSUE_CATEGORIES.flatMap((c) => CATEGORY_INFO[c].needs));
  assert.deepEqual([...NEED_GROUPS].filter((g) => !covered.has(g)), [], "no need group is left without a category");
});

test("every need group offers choices, with unique ids", () => {
  for (const group of NEED_GROUPS) assert.ok(NEEDS.some((n) => n.group === group), group);
  assert.equal(new Set(NEEDS.map((n) => n.id)).size, NEEDS.length);
});

test("stored preferences are read defensively", () => {
  assert.deepEqual(parsePreferences(null), { needs: [], other: "" });
  assert.deepEqual(parsePreferences("not json"), { needs: [], other: "" });
  assert.deepEqual(parsePreferences(JSON.stringify({ needs: "step_free" })), { needs: [], other: "" });
  const parsed = parsePreferences(
    JSON.stringify({ needs: ["step_free", "unknown_need", "tactile_paving", "step_free", 7], other: "x".repeat(500) }),
  );
  assert.deepEqual(parsed.needs, ["step_free", "tactile_paving"], "unknown ids and duplicates are dropped");
  assert.equal(parsed.other.length, 300);
});

test("chosen needs map to their groups", () => {
  assert.deepEqual(groupsOf({ needs: ["tactile_paving", "step_free", "seating"], other: "" }), ["mobility", "vision", "general"]);
  assert.deepEqual(groupsOf({ needs: [], other: "anything" }), []);
});

test("only barriers a person confirmed, corrected or added count towards a report's needs", () => {
  const finding = (id: string, category: string) => ({ id, category });
  const report = {
    analysis: {
      findings: [
        finding("a", "blocked_curb_ramp"),
        finding("b", "signage_problem"),
        finding("c", "obstructed_footpath"),
        finding("d", "tactile_guidance"),
      ],
    },
    reviews: {
      a: { decision: "confirmed", note: "" },
      b: { decision: "rejected", note: "" },
      c: { decision: "corrected", correctedCategory: "crossing_problem", note: "" },
    },
    missedIssues: [{ id: "m", category: "other", description: "No seating" }],
  } as unknown as SavedReport;
  // a: mobility. b: rejected. c: corrected to a crossing problem (mobility, vision, cognitive). d: not reviewed.
  assert.deepEqual(verifiedNeeds(report), ["mobility", "vision", "cognitive", "general"]);
});
