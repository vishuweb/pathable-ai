// Place intelligence: how reports and observations become a place's profile. Pure logic, no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORY_FEATURES } from "../lib/evidence-map";
import { needsOfGroups } from "../lib/needs";
import type { Observation } from "../lib/observations";
import { buildPlaceIntelligence, isStaffSubmitted } from "../lib/place-intelligence";
import { orderBarriers, orderFeatures, orderGroups } from "../lib/profile-order";
import type { SavedReport } from "../lib/report";
import type { StatusEvent } from "../lib/report-status";
import type { IssueCategory } from "../lib/types";

const LIBRARY = { osmType: "way" as const, osmId: 517026148, name: "Central Library" };
const OTHER = { osmType: "way" as const, osmId: 999000111, name: "Another Building" };
const NOW = new Date("2026-11-02T00:00:00Z");

let n = 0;
const obs = (over: Partial<Observation> = {}): Observation => {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return {
    id,
    createdAt: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00Z`,
    place: LIBRARY,
    latitude: 23.8158,
    longitude: 86.4422,
    featureId: "ramp",
    finding: "present",
    area: "entrance",
    note: "",
    observedOn: "2026-10-20",
    hasPhoto: false,
    consentedAt: "2026-10-10T10:00:00Z",
    statusHistory: [{ status: "community", at: "2026-10-10T10:00:00Z", note: "" }],
    ...over,
  };
};

const report = (
  over: { category?: IssueCategory; decision?: "confirmed" | "rejected" | null; place?: typeof LIBRARY | null; history?: StatusEvent[] } & Partial<SavedReport> = {},
): SavedReport => {
  const { category = "blocked_curb_ramp", decision = "confirmed", place = LIBRARY, history, ...rest } = over;
  const id = `11111111-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return {
    id,
    createdAt: "2026-10-25T09:00:00Z",
    width: 400,
    height: 300,
    analysis: {
      scene_type: "street",
      scene_summary: "",
      image_quality: "good",
      image_quality_notes: "",
      no_findings_reason: "",
      findings: [
        {
          id: "f1",
          category,
          title: "Scooter in front of the ramp",
          observed_condition: "A scooter blocks the ramp landing.",
          why_it_matters: "",
          evidence_phrase: "scooter",
          evidence_box: { x_min: 0, y_min: 0, x_max: 1, y_max: 1 },
          located: false,
          potential_impact: "high",
          confidence: "medium",
          uncertainty: "",
          suggested_next_step: "",
        },
      ],
    },
    evidence: [],
    models: { analysis: "muse-spark-1.3" },
    reviews: decision ? { f1: { decision, highlight: "correct", note: "" } } : {},
    missedIssues: [],
    reviewerNote: "",
    area: "entrance",
    location: place ? { label: place.name, place, latitude: 23.8158, longitude: 86.4422 } : { label: "Near the gate", latitude: 23.8159, longitude: 86.4423 },
    consentedAt: "2026-10-25T09:00:00Z",
    statusHistory: history ?? [{ status: "submitted", at: "2026-10-25T09:00:00Z", note: "" }],
    timings: { analysisMs: 1, reviewMs: 1 },
    ...rest,
  } as unknown as SavedReport;
};

const profile = (observations: Observation[] = [], reports: SavedReport[] = [], tags: Record<string, string> = {}, place = LIBRARY) =>
  buildPlaceIntelligence({ place, tags, observations, reports, now: NOW });
const feature = (p: ReturnType<typeof profile>, id: string) => p.features.find((f) => f.id === id)!;

test("an approved mobility barrier appears on the correct place profile, scoped to what it can show", () => {
  const p = profile([], [report()]);
  assert.equal(p.barriers.length, 1);
  assert.equal(p.barriers[0].items[0].categoryLabel, "Blocked curb ramp");
  assert.deepEqual(p.barriers[0].needGroups, ["mobility"]);
  assert.deepEqual(p.barriers[0].affectedFeatureIds, CATEGORY_FEATURES.blocked_curb_ramp);
  assert.match(p.barriers[0].scope, /one entrance, not to every entrance/);
  // It flags the ramp but does not say whether a ramp exists or works: that stays unknown.
  assert.deepEqual(feature(p, "ramp").barrierIds, [p.barriers[0].reportId]);
  assert.equal(feature(p, "ramp").current, "unknown");
  assert.equal(feature(p, "lift").barrierIds.length, 0, "a ramp report says nothing about the lift");
  assert.equal(feature(p, "step_free_entrance").barrierIds.length, 0, "or about other entrances' features");
});

test("pending and rejected submissions contribute nothing", () => {
  const at = "2026-10-26T00:00:00Z";
  const pendingReport = report({ moderation: { state: "pending", at } });
  const rejectedReport = report({ moderation: { state: "rejected", at } });
  const pendingObs = obs({ moderation: { state: "pending", at } });
  const rejectedObs = obs({ moderation: { state: "rejected", at, note: "spam" } });
  const p = profile([pendingObs, rejectedObs], [pendingReport, rejectedReport]);
  assert.equal(p.barriers.length + p.resolved.length, 0);
  assert.equal(p.contributions.length, 0);
  assert.ok(p.features.every((f) => f.current === "unknown" && f.claims.length === 0));
  assert.equal(p.summary.lastObservedOn, undefined);
  // An approved record with no moderation field (made before moderation existed) still counts.
  assert.equal(profile([obs()], [report()]).barriers.length, 1);
});

test("a report tied to one building never appears on another, and one with no place is not guessed", () => {
  assert.equal(profile([], [report({ place: OTHER })]).barriers.length, 0);
  assert.equal(profile([], [report({ place: OTHER })], {}, OTHER).barriers.length, 1);
  const unplaced = report({ place: null });
  assert.equal(profile([], [unplaced]).barriers.length, 0, "even though its coordinates are on the library's doorstep");
  assert.equal(profile([obs({ place: OTHER })]).contributions.length, 0, "observations also belong to their place");
});

test("precise coordinates are carried separately from the place's own position", () => {
  const r = report({
    location: {
      label: "Ramp by the east door",
      place: LIBRARY,
      placeCoordinates: { latitude: 23.8158, longitude: 86.4422 },
      latitude: 23.81602,
      longitude: 86.44261,
      observationCoordinates: { latitude: 23.81602, longitude: 86.44261, accuracyM: 8 },
    },
  });
  const b = profile([], [r]).barriers[0];
  assert.deepEqual(b.placeCoordinates, { latitude: 23.8158, longitude: 86.4422 });
  assert.deepEqual(b.observationCoordinates, { latitude: 23.81602, longitude: 86.44261, accuracyM: 8 });
  const o = obs({ observationCoordinates: { latitude: 23.8161, longitude: 86.4425 } });
  assert.deepEqual(profile([o]).contributions[0].observationCoordinates, { latitude: 23.8161, longitude: 86.4425 });
});

test("an observation speaks only for its own feature", () => {
  const p = profile([obs({ featureId: "lift", finding: "damaged", area: "steps_ramp" })]);
  assert.equal(feature(p, "lift").current, "community");
  assert.equal(feature(p, "ramp").current, "unknown");
  assert.equal(p.features.filter((f) => f.current !== "unknown").length, 1);
});

test("AI suggestions stay unverified, and rejected ones do not appear", () => {
  const confirmed = profile([], [report()]).barriers[0];
  assert.equal(confirmed.provenance, "reporter_confirmed");
  assert.equal(confirmed.items[0].provenance, "reporter_confirmed");
  const unreviewed = profile([], [report({ decision: null })]).barriers[0];
  assert.equal(unreviewed.provenance, "ai");
  assert.equal(profile([], [report({ decision: "rejected" })]).barriers.length, 0, "nothing the reporter rejected is shown");
});

test("reporter confirmation, owner approval and independent verification are three different things", () => {
  const verified = (note: string): StatusEvent[] => [
    { status: "submitted", at: "2026-10-25T09:00:00Z", note: "" },
    { status: "verified", at: "2026-10-27T09:00:00Z", note },
  ];
  assert.equal(profile([], [report({ moderation: { state: "approved", at: "2026-10-26T00:00:00Z" } })]).barriers[0].provenance, "reporter_confirmed", "approval alone verifies nothing");
  const withReason = profile([], [report({ history: verified("Site visit 27 Oct: scooter present, ramp blocked") })]).barriers[0];
  assert.equal(withReason.provenance, "verified");
  assert.match(withReason.verifiedNote!, /Site visit/);
  const noReason = profile([], [report({ history: verified("") })]).barriers[0];
  assert.equal(noReason.provenance, "reporter_confirmed");
  assert.match(noReason.verificationCaveat!, /without a recorded reason/);
  const staffOwn = report({ history: verified("Looked again"), moderation: { state: "approved", at: "2026-10-26T00:00:00Z", note: "Saved by the owner" } });
  assert.equal(isStaffSubmitted(staffOwn), true);
  const own = profile([], [staffOwn]).barriers[0];
  assert.equal(own.provenance, "reporter_confirmed", "the team's check of its own report is not independent");
  assert.match(own.verificationCaveat!, /not an independent check/);
});

test("an observation is independently verified only with a recorded reason", () => {
  const checked = (note: string) =>
    obs({ statusHistory: [{ status: "community", at: "2026-10-10T10:00:00Z", note: "" }, { status: "verified", at: "2026-10-28T10:00:00Z", note }] });
  assert.equal(feature(profile([checked("Site visit 28 Oct")]), "ramp").current, "verified");
  assert.equal(feature(profile([checked("")]), "ramp").current, "community");
  assert.equal(feature(profile([obs()]), "ramp").claims[0].provenance, "community");
  // The team checking its own observation is not independent.
  const own = obs({
    moderation: { state: "approved", at: "2026-10-10T10:00:00Z", note: "Saved by the owner" },
    statusHistory: [{ status: "community", at: "2026-10-10T10:00:00Z", note: "" }, { status: "verified", at: "2026-10-28T10:00:00Z", note: "Looked again" }],
  });
  const claim = feature(profile([own]), "ramp").claims[0];
  assert.equal(claim.provenance, "community");
  assert.match(claim.verificationCaveat!, /not an independent check/);
});

test("disagreeing observations are shown as a conflict and neither wins", () => {
  const present = obs({ finding: "present", observedOn: "2026-10-01", createdAt: "2026-10-02T00:00:00Z" });
  const blocked = obs({ finding: "blocked", observedOn: "2026-10-28", createdAt: "2026-10-29T00:00:00Z" });
  const ramp = feature(profile([present, blocked]), "ramp");
  assert.ok(ramp.conflict);
  assert.equal(ramp.claims.length, 2, "both are kept");
  assert.ok(ramp.claims.every((c) => c.inConflict));
  assert.match(ramp.conflict!.summary, /none has been chosen as correct/);
  // OpenStreetMap against a visitor is a conflict too.
  const against = feature(profile([obs({ finding: "absent" })], [], { ramp: "yes" }), "ramp");
  assert.ok(against.conflict);
  assert.deepEqual(against.claims.map((c) => c.source).sort(), ["observation", "osm"]);
  // Different spots, or the same account, are not a conflict.
  const elsewhere = feature(profile([present, obs({ finding: "absent", area: "toilet" })]), "ramp");
  assert.equal(elsewhere.conflict, undefined, "a ramp at an entrance and none at the toilets do not contradict each other");
  assert.equal(feature(profile([present, obs({ finding: "present", observedOn: "2026-10-22" })]), "ramp").conflict, undefined);
});

test("saying something has changed supersedes the old claim without deleting it", () => {
  const before = obs({ finding: "present", observedOn: "2026-09-01", createdAt: "2026-09-02T00:00:00Z" });
  const after = obs({
    finding: "damaged",
    observedOn: "2026-10-30",
    createdAt: "2026-10-31T00:00:00Z",
    respondsTo: { id: before.id, kind: "update" },
  });
  const ramp = feature(profile([before, after]), "ramp");
  assert.equal(ramp.conflict, undefined, "the update resolved the disagreement");
  assert.deepEqual(ramp.claims.map((c) => c.id), [after.id]);
  assert.deepEqual(ramp.history.map((c) => c.id), [before.id]);
  assert.equal(ramp.history[0].supersededBy, after.id);
  assert.equal(profile([before, after]).contributions.find((c) => c.id === before.id)!.superseded, true);
});

test("a dispute keeps both views visible; a confirmation and the same sighting are counted once per claim", () => {
  const first = obs({ finding: "damaged", observedOn: "2026-10-20", createdAt: "2026-10-21T00:00:00Z", note: "Handrail loose" });
  const disputing = obs({ finding: "blocked", observedOn: "2026-10-25", createdAt: "2026-10-26T00:00:00Z", respondsTo: { id: first.id, kind: "dispute" } });
  const ramp = feature(profile([first, disputing]), "ramp");
  assert.ok(ramp.conflict, "two problems are still a disagreement once one is disputed");
  assert.equal(ramp.claims.length, 2);

  const again = obs({ finding: "damaged", observedOn: "2026-10-22", createdAt: "2026-10-23T00:00:00Z", note: "The rail wobbles" });
  const confirm = obs({ finding: "damaged", observedOn: "2026-10-24", createdAt: "2026-10-25T00:00:00Z", respondsTo: { id: first.id, kind: "confirm" } });
  const evidence = obs({ finding: "damaged", observedOn: "2026-10-24", createdAt: "2026-10-25T12:00:00Z", hasPhoto: true, respondsTo: { id: first.id, kind: "evidence" } });
  const merged = profile([first, again, confirm, evidence]);
  const claims = feature(merged, "ramp").claims;
  assert.equal(claims.length, 1, "described differently, but one claim");
  assert.equal(claims[0].count, 3, "the first, the repeat and the confirmation; evidence adds proof, not a vote");
  assert.equal(claims[0].hasPhoto, true);
  assert.equal(merged.contributions.length, 4, "every contribution stays listed");
  assert.equal(merged.contributions.find((c) => c.id === again.id)!.mergedInto, first.id);
  // A different finding or spot is not a duplicate; neither is the same thing months later.
  assert.equal(feature(profile([first, obs({ finding: "damaged", area: "path", observedOn: "2026-10-22" })]), "ramp").claims.length, 2);
  assert.equal(feature(profile([first, obs({ finding: "damaged", observedOn: "2027-02-01" })]), "ramp").claims.length, 2);
});

test("a response to something no longer public stands alone", () => {
  const response = obs({ finding: "present", respondsTo: { id: "00000000-0000-4000-8000-ffffffffffff", kind: "confirm" } });
  const p = profile([response]);
  assert.equal(feature(p, "ramp").claims.length, 1);
  assert.equal(p.contributions[0].respondsTo, undefined);
});

test("deleting a record removes it from the aggregate, while resolved barriers keep their history", () => {
  const r = report();
  const o = obs({ featureId: "lift", finding: "damaged" });
  assert.equal(profile([o], [r]).summary.openBarriers, 1);
  const after = profile([], []);
  assert.equal(after.summary.openBarriers, 0);
  assert.equal(after.summary.withRecord, 0);

  const history: StatusEvent[] = [
    { status: "submitted", at: "2026-10-25T09:00:00Z", note: "" },
    { status: "verified", at: "2026-10-26T09:00:00Z", note: "Seen on site" },
    { status: "action_reported", at: "2026-10-28T09:00:00Z", note: "Guard says scooter moved" },
    { status: "resolved", at: "2026-10-30T09:00:00Z", note: "Rechecked 30 Oct with a new photo: landing clear" },
  ];
  const p = profile([], [report({ history })]);
  assert.equal(p.barriers.length, 0, "no longer an open barrier");
  assert.equal(p.resolved.length, 1);
  const b = p.resolved[0];
  assert.equal(b.provenance, "resolved");
  assert.match(b.resolution!.note, /landing clear/);
  assert.deepEqual(b.history.map((e) => e.status), ["submitted", "verified", "action_reported", "resolved"]);
  assert.equal(feature(p, "ramp").barrierIds.length, 0);
  // "Action reported" alone is not a resolution.
  const claimed = profile([], [report({ history: history.slice(0, 3) })]);
  assert.equal(claimed.barriers.length, 1);
  assert.equal(claimed.barriers[0].open, true);
});

test("a closed duplicate is not counted again", () => {
  const closed = report({ history: [{ status: "submitted", at: "2026-10-25T09:00:00Z", note: "" }, { status: "closed", at: "2026-10-26T09:00:00Z", note: "Duplicate", duplicateOf: "x" }] });
  const p = profile([], [report(), closed]);
  assert.equal(p.summary.openBarriers, 1);
  assert.equal(p.resolved[0].closedAs?.note, "Duplicate");
});

test("old information gets a warning but is never turned into unknown or accessible", () => {
  const old = obs({ observedOn: "2023-01-01", createdAt: "2023-01-02T00:00:00Z" });
  const ramp = feature(profile([old]), "ramp");
  assert.equal(ramp.current, "community", "still what it was");
  assert.equal(ramp.outdated, true);
  assert.equal(ramp.claims[0].outdated, true);
  assert.equal(feature(profile([obs({ observedOn: "2026-10-01" })]), "ramp").outdated, false);
  assert.equal(profile([], [], { wheelchair: "yes", check_date: "2022-01-01" }).summary.outdated, 1);
  // Barriers get a recheck flag after a year, and stay open.
  const stale = profile([], [report({ createdAt: "2025-06-01T00:00:00Z", history: [{ status: "submitted", at: "2025-06-01T00:00:00Z", note: "" }] })]).barriers[0];
  assert.equal(stale.open, true);
  assert.equal(stale.recheckDue, true);
  assert.equal(profile([], [report()]).barriers[0].recheckDue, false);
});

test("the summary counts records honestly and never produces a score", () => {
  const p = profile([obs()], [], { wheelchair: "yes" });
  assert.equal(p.summary.withRecord + p.summary.unknown, p.summary.features);
  assert.equal(p.summary.byProvenance.osm, 1);
  assert.equal(p.summary.byProvenance.community, 1);
  assert.ok(!("score" in p.summary) && !("rating" in p.summary));
  assert.equal(p.summary.lastObservedOn, "2026-10-20");
  assert.equal(profile().summary.lastObservedOn, undefined);
});

test("preferences change the order and emphasis of the profile without hiding anything", () => {
  const p = profile([obs({ featureId: "ramp", finding: "blocked" }), obs({ featureId: "tactile_paving", finding: "present", area: "crossing" })], [report({ category: "tactile_guidance" })]);
  const all = p.features.map((f) => f.id).sort();

  const mobility = orderFeatures(p.features, needsOfGroups(["mobility"]));
  const visual = orderFeatures(p.features, needsOfGroups(["vision"]));
  assert.ok(mobility.mine.some((f) => f.id === "ramp") && !mobility.mine.some((f) => f.id === "tactile_paving"));
  assert.ok(visual.mine.some((f) => f.id === "tactile_paving") && !visual.mine.some((f) => f.id === "ramp"));
  for (const { mine, rest } of [mobility, visual]) {
    assert.deepEqual([...mine, ...rest].map((f) => f.id).sort(), all, "every detail is still there, in one list or the other");
  }
  const visualIds = visual.mine.map((f) => f.id);
  assert.ok(visualIds.indexOf("tactile_paving") < visualIds.indexOf("lighting"), "what has an open barrier comes before plain unknowns");

  const none = orderFeatures(p.features, []);
  assert.equal(none.mine.length, 0);
  assert.equal(none.rest.length, p.features.length);

  assert.deepEqual(orderGroups(needsOfGroups(["vision"])).slice(0, 1), ["vision"]);
  assert.equal(orderGroups(needsOfGroups(["vision"])).length, 5, "the other groups follow");
  const barriers = [
    { ...p.barriers[0], reportId: "mobility-one", needGroups: ["mobility" as const] },
    { ...p.barriers[0], reportId: "vision-one", needGroups: ["vision" as const] },
  ];
  assert.deepEqual(orderBarriers(barriers, needsOfGroups(["vision"])).map((b) => b.barrier.reportId), ["vision-one", "mobility-one"]);
  assert.deepEqual(orderBarriers(barriers, []).map((b) => b.barrier.reportId), ["mobility-one", "vision-one"], "no preference, no reordering");
});
