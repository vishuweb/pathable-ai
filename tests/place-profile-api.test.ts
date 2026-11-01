// Phase 2 at the API boundary: real routes and real (temporary) storage, no network. Reports and
// observations are submitted as a visitor, approved as the owner, and read back as a place profile.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";

const OWNER_KEY = "owner-secret-for-tests-0123456789";
const REVIEWER_KEY = "reviewer-secret-for-tests-9876543210";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "pathable-profile-"));
Object.assign(process.env, {
  OWNER_KEY,
  REVIEWER_KEY,
  DATA_DIR: dataDir,
  MODEL_API_KEY: "unused-test-key",
  SUBMISSION_LIMIT_PER_HOUR: "1000",
  SUBMISSIONS_PER_DAY: "100000",
  MAX_PENDING_SUBMISSIONS: "1000",
});
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL;

const auth = await import("../lib/owner");
const reportsRoute = await import("../app/api/reports/route");
const reportRoute = await import("../app/api/reports/[id]/route");
const observationsRoute = await import("../app/api/observations/route");
const observationRoute = await import("../app/api/observations/[id]/route");
const { loadPlaceIntelligence } = await import("../lib/place-intelligence-store");
after(() => rm(dataDir, { recursive: true, force: true }));

const OWNER = `${auth.OWNER_COOKIE}=${auth.signIn(OWNER_KEY)!.value}`;
const REVIEWER = `${auth.OWNER_COOKIE}=${auth.signIn(REVIEWER_KEY)!.value}`;
let visitor = 0;
const request = (url: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", `203.0.113.${++visitor % 250}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (pending: Response | Promise<Response>) => {
  const response = await pending;
  // Test helper: response bodies are inspected loosely on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json().catch(() => undefined)) as any };
};

const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#8899aa" } }).jpeg().toBuffer();
const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

const LIBRARY = { osmType: "way", osmId: 517026148, name: "Central Library" } as const;
const LIBRARY_AT = { latitude: 23.8158145, longitude: 86.4421811 };
const finding = {
  id: "f1",
  category: "blocked_curb_ramp",
  title: "Scooter in front of the ramp",
  observed_condition: "A scooter blocks the ramp landing.",
  why_it_matters: "x",
  evidence_phrase: "scooter",
  evidence_box: { x_min: 100, y_min: 100, x_max: 500, y_max: 500 },
  located: true,
  potential_impact: "high",
  confidence: "medium",
  uncertainty: "x",
  suggested_next_step: "x",
};
const reportBody = (change: Record<string, unknown> = {}) => ({
  image: photo,
  width: 400,
  height: 300,
  analysis: { scene_type: "street", scene_summary: "A ramp.", image_quality: "good", image_quality_notes: "", findings: [finding], no_findings_reason: "" },
  evidence: [{ findingId: "f1", phrase: "scooter", status: "approximate", regions: [], modelBox: { left: 40, top: 40, right: 200, bottom: 150 }, note: "Approximate." }],
  models: { analysis: "muse-spark-1.3" },
  timings: { analysisMs: 1000, reviewMs: 2000 },
  reviews: { f1: { decision: "confirmed", highlight: "correct", note: "" } },
  missedIssues: [],
  reviewerNote: "",
  area: "entrance",
  observedOn: "2026-10-30",
  location: { label: "Central Library", ...LIBRARY_AT, place: LIBRARY },
  consent: true,
  ...change,
});
const observationBody = (change: Record<string, unknown> = {}) => ({
  place: LIBRARY,
  ...LIBRARY_AT,
  featureId: "ramp",
  finding: "present",
  area: "entrance",
  note: "",
  observedOn: "2026-10-30",
  consent: true,
  ...change,
});

const sendReport = (change: Record<string, unknown> = {}, cookie?: string) =>
  body(reportsRoute.POST(request("/api/reports", { method: "POST", json: reportBody(change), cookie })));
const sendObservation = (change: Record<string, unknown> = {}, cookie?: string) =>
  body(observationsRoute.POST(request("/api/observations", { method: "POST", json: observationBody(change), cookie })));
const approveReport = (id: string, state: "approved" | "rejected" = "approved") =>
  body(reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: OWNER, json: { moderation: state } }), ctx(id)));
const approveObservation = (id: string, state: "approved" | "rejected" = "approved") =>
  body(observationRoute.PATCH(request(`/api/observations/${id}`, { method: "PATCH", cookie: OWNER, json: { moderation: state } }), ctx(id)));
const setStatus = (id: string, status: string, note = "") =>
  body(reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: OWNER, json: { status, note } }), ctx(id)));
const profile = (place: { osmType: "way" | "node" | "relation"; osmId: number; name: string } = LIBRARY, tags: Record<string, string> = {}) => loadPlaceIntelligence(place, tags);
const feature = (p: Awaited<ReturnType<typeof profile>>, id: string) => p.features.find((f) => f.id === id)!;

test("a visitor's report stays off the place profile until approved, then appears on that place only", async () => {
  const before = (await profile()).barriers.length;
  const sent = await sendReport();
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.moderation, "pending");
  assert.equal((await profile()).barriers.length, before, "pending: invisible");

  assert.equal((await approveReport(sent.body.id)).status, 200);
  const approved = await profile();
  const barrier = approved.barriers.find((b) => b.reportId === sent.body.id)!;
  assert.ok(barrier, "approved: on the library's profile");
  assert.equal(barrier.provenance, "reporter_confirmed", "approval did not verify anything");
  assert.equal(barrier.items[0].categoryLabel, "Blocked curb ramp");
  assert.equal(feature(approved, "ramp").current, "unknown", "a barrier report does not say whether a ramp exists");
  assert.ok(feature(approved, "ramp").barrierIds.includes(sent.body.id));

  const elsewhere = { osmType: "way" as const, osmId: 1, name: "Somewhere" };
  assert.equal((await profile(elsewhere)).barriers.length, 0, "and not on any other place's");
});

test("a rejected report never contributes, and a deleted one disappears", async () => {
  const rejected = await sendReport();
  await approveReport(rejected.body.id, "rejected");
  assert.ok(!(await profile()).barriers.some((b) => b.reportId === rejected.body.id));

  const kept = await sendReport({}, OWNER);
  assert.ok((await profile()).barriers.some((b) => b.reportId === kept.body.id), "owner submissions are approved at once");
  const deleted = await body(reportRoute.DELETE(request(`/api/reports/${kept.body.id}`, { method: "DELETE", cookie: OWNER }), ctx(kept.body.id)));
  assert.equal(deleted.status, 204);
  assert.ok(!(await profile()).barriers.some((b) => b.reportId === kept.body.id), "deleted: gone from the aggregate");
});

test("a report with no place is not guessed onto one; only the owner can link it, and only to a directory place", async () => {
  const sent = await sendReport({ location: { label: "By the east gate", latitude: 23.8159, longitude: 86.4423 } });
  assert.equal(sent.status, 201);
  await approveReport(sent.body.id);
  assert.ok(!(await profile()).barriers.some((b) => b.reportId === sent.body.id), "its coordinates are at the library, yet it is not placed there");

  const link = (cookie: string | undefined, place: unknown) =>
    body(reportRoute.PATCH(request(`/api/reports/${sent.body.id}`, { method: "PATCH", cookie, json: { place, note: "Matches the photo" } }), ctx(sent.body.id)));
  assert.equal((await link(undefined, LIBRARY)).status, 401, "visitors cannot");
  assert.equal((await link(REVIEWER, LIBRARY)).status, 403, "reviewers cannot");
  assert.equal((await link(OWNER, { osmType: "way", osmId: 42 })).status, 400, "a place outside the directory");
  const linked = await link(OWNER, LIBRARY);
  assert.equal(linked.status, 200);
  assert.equal(linked.body.placeAssociation.by, "owner");
  const barrier = (await profile()).barriers.find((b) => b.reportId === sent.body.id)!;
  assert.ok(barrier, "now on the profile");
  assert.deepEqual(barrier.observationCoordinates, undefined, "linking does not invent an exact spot");

  assert.equal((await link(OWNER, null)).status, 200);
  assert.ok(!(await profile()).barriers.some((b) => b.reportId === sent.body.id), "unlinking takes it off again");
});

test("the exact spot is kept apart from the place's position, for reports and observations", async () => {
  const spot = { latitude: LIBRARY_AT.latitude - 0.0006, longitude: LIBRARY_AT.longitude - 0.0004, accuracyM: 7.4 };
  const sent = await sendReport({ location: { label: "East ramp", ...spot, place: LIBRARY } });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const stored = (await body(reportRoute.GET(request(`/api/reports/${sent.body.id}`, { cookie: OWNER }), ctx(sent.body.id)))).body;
  assert.deepEqual(stored.location.placeCoordinates, LIBRARY_AT);
  assert.equal(stored.location.observationCoordinates.latitude, spot.latitude);
  assert.equal(stored.location.observationCoordinates.accuracyM, 7);
  assert.equal(stored.location.latitude, spot.latitude, "the map position is the barrier's, not the building's centre");
  assert.equal(stored.location.place.name, "Central Library");

  const tooFar = await sendReport({ location: { label: "x", latitude: 23.8095, longitude: 86.443, place: LIBRARY } });
  assert.equal(tooFar.status, 400);

  const observed = await sendObservation({ ...spot, featureId: "signage" }, OWNER);
  assert.equal(observed.status, 201);
  const listed = (await body(observationsRoute.GET(request(`/api/observations?osmType=way&osmId=${LIBRARY.osmId}`)))).body.observations.find((o: { id: string }) => o.id === observed.body.id);
  assert.equal(listed.latitude, LIBRARY_AT.latitude, "the place's own position");
  assert.equal(listed.observationCoordinates.latitude, spot.latitude, "and the spot, separately");
  const plain = await sendObservation({ featureId: "landmarks" }, OWNER);
  const plainListed = (await body(observationsRoute.GET(request(`/api/observations?osmType=way&osmId=${LIBRARY.osmId}`)))).body.observations.find((o: { id: string }) => o.id === plain.body.id);
  assert.equal(plainListed.observationCoordinates, undefined, "no spot given, none invented");
});

test("an observation changes only its own feature, and only once approved", async () => {
  const sent = await sendObservation({ featureId: "lift", finding: "damaged", area: "steps_ramp", note: "Out of order" });
  assert.equal(sent.body.moderation, "pending");
  assert.equal(feature(await profile(), "lift").current, "unknown");
  await approveObservation(sent.body.id);
  const p = await profile();
  assert.equal(feature(p, "lift").current, "community");
  assert.equal(feature(p, "lift").claims[0].provenance, "community");
  assert.equal(feature(p, "steps").current, "unknown", "other features are untouched");
  await approveObservation((await sendObservation({ featureId: "seating" })).body.id, "rejected");
  assert.equal(feature(await profile(), "seating").current, "unknown", "rejected: nothing recorded");
});

test("duplicates are counted together; confirm, dispute and update behave as documented", async () => {
  const first = await sendObservation({ featureId: "visual_alarms", finding: "present", area: "inside", note: "Flashing lights by the stairs" }, OWNER);
  const again = await sendObservation({ featureId: "visual_alarms", finding: "present", area: "inside", note: "There are strobe alarms near the main stairs", observedOn: "2026-11-01" });
  assert.equal(again.status, 201);
  assert.equal(again.body.similarTo, first.body.id, "told the same thing was already reported");
  await approveObservation(again.body.id);
  let p = await profile();
  assert.equal(feature(p, "visual_alarms").claims.length, 1, "worded differently, still one claim");
  assert.equal(feature(p, "visual_alarms").claims[0].count, 2);

  const respond = (kind: string, change: Record<string, unknown> = {}, id = first.body.id) =>
    sendObservation({ featureId: "visual_alarms", respondsTo: { id, kind }, ...change }, OWNER);
  const confirm = await respond("confirm", { finding: "absent", area: "toilet" });
  assert.equal(confirm.status, 201);
  p = await profile();
  assert.equal(feature(p, "visual_alarms").claims.length, 1, "a confirmation copies what it confirms, whatever was sent");
  assert.equal(feature(p, "visual_alarms").claims[0].count, 3);

  assert.equal((await respond("dispute", { finding: "present" })).status, 400, "disagreeing means saying something different");
  const dispute = await respond("dispute", { finding: "absent" });
  assert.equal(dispute.status, 201);
  p = await profile();
  assert.ok(feature(p, "visual_alarms").conflict, "the disagreement is shown");
  assert.equal(feature(p, "visual_alarms").claims.length, 2, "both stay");

  assert.equal((await respond("update", { finding: "present", area: "inside" })).status, 400, "an update must change something");
  assert.equal((await sendObservation({ featureId: "ramp", respondsTo: { id: first.body.id, kind: "confirm" } }, OWNER)).status, 400, "another feature's observation");
  assert.equal((await sendObservation({ featureId: "visual_alarms", respondsTo: { id: "00000000-0000-4000-8000-000000000000", kind: "confirm" } }, OWNER)).status, 400, "nothing there");
  const pendingOne = await sendObservation({ featureId: "visual_alarms", finding: "blocked", area: "path" });
  assert.equal((await respond("confirm", {}, pendingOne.body.id)).status, 400, "an observation nobody can see yet cannot be answered");

  const update = await respond("update", { finding: "damaged", area: "inside", note: "Now broken" });
  assert.equal(update.status, 201);
  p = await profile();
  assert.equal(feature(p, "visual_alarms").conflict, undefined, "the update settled the disagreement for that spot");
  assert.ok(feature(p, "visual_alarms").history.length >= 1, "and the earlier record is kept");
});

test("conflicting observations stay distinguishable, and an exact verification needs a reason", async () => {
  const a = await sendObservation({ featureId: "hearing_loop", finding: "present", area: "inside" }, OWNER);
  const b = await sendObservation({ featureId: "hearing_loop", finding: "absent", area: "inside", observedOn: "2026-10-31" }, OWNER);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const p = await profile();
  const loop = feature(p, "hearing_loop");
  assert.ok(loop.conflict);
  assert.equal(loop.claims.length, 2);

  const verify = (note: string) =>
    body(observationRoute.PATCH(request(`/api/observations/${a.body.id}`, { method: "PATCH", cookie: OWNER, json: { status: "verified", note } }), ctx(a.body.id)));
  assert.equal((await verify("")).status, 400);
  assert.equal((await verify("Site visit 1 Nov 2026")).status, 200);
  const after = feature(await profile(), "hearing_loop");
  assert.ok(after.conflict, "verifying one does not erase the other");
  assert.equal(after.conflict!.hasVerified, false, "the owner's own observation checked by the owner is not independent");
});

test("a visitor's observation, once verified by the owner with a reason, counts as independently verified", async () => {
  const sent = await sendObservation({ featureId: "tactile_paving", finding: "present", area: "crossing" });
  await approveObservation(sent.body.id);
  assert.equal(feature(await profile(), "tactile_paving").current, "community");
  await body(observationRoute.PATCH(request(`/api/observations/${sent.body.id}`, { method: "PATCH", cookie: OWNER, json: { status: "verified", note: "Site visit 1 Nov" } }), ctx(sent.body.id)));
  const tactile = feature(await profile(), "tactile_paving");
  assert.equal(tactile.current, "verified");
  assert.match(tactile.claims[0].verifiedNote!, /Site visit/);
});

test("a resolved barrier keeps its whole history, and rechecks need evidence", async () => {
  const sent = await sendReport({}, OWNER);
  const id = sent.body.id as string;
  assert.equal((await setStatus(id, "resolved")).status, 400, "resolved needs a note");
  assert.equal((await setStatus(id, "verified", "Seen on site, 31 Oct")).status, 200);
  assert.equal((await setStatus(id, "action_reported", "Guard says it was moved")).status, 200);
  let p = await profile();
  assert.ok(p.barriers.some((b) => b.reportId === id), "action reported is not resolved");
  assert.equal((await setStatus(id, "resolved", "Rechecked 1 Nov with a new photo: landing clear")).status, 200);
  p = await profile();
  assert.ok(!p.barriers.some((b) => b.reportId === id));
  const resolved = p.resolved.find((b) => b.reportId === id)!;
  assert.equal(resolved.provenance, "resolved");
  assert.deepEqual(resolved.history.map((e) => e.status), ["submitted", "verified", "action_reported", "resolved"]);
  assert.match(resolved.resolution!.note, /landing clear/);
});

test("pending and private records never leak through the profile, and drafts are not part of it", async () => {
  const sentReport = await sendReport({ location: { label: "Central Library", ...LIBRARY_AT, place: LIBRARY }, reviewerNote: "PRIVATE-NOTE-XYZ" });
  const sentObservation = await sendObservation({ featureId: "shelter", note: "PRIVATE-OBS-XYZ" });
  const text = JSON.stringify(await profile());
  assert.ok(!text.includes(sentReport.body.id) && !text.includes(sentObservation.body.id));
  assert.ok(!text.includes("PRIVATE-NOTE-XYZ") && !text.includes("PRIVATE-OBS-XYZ"));
  assert.ok(!text.includes("moderation"), "no moderation internals in the public model");
});

test("owner-only: nobody else can change a profile through the write routes", async () => {
  const sent = await sendObservation({ featureId: "seating" }, OWNER);
  const id = sent.body.id as string;
  for (const cookie of [undefined, REVIEWER]) {
    const denied = await body(observationRoute.PATCH(request(`/api/observations/${id}`, { method: "PATCH", cookie, json: { moderation: "rejected" } }), ctx(id)));
    assert.ok([401, 403].includes(denied.status));
  }
  assert.equal(feature(await profile(), "seating").current, "community", "unchanged");
});
