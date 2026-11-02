// Phase 3: field surveys at the API boundary, on temporary storage with no network. All records here
// are test fixtures; none describe the real campus.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";

const OWNER_KEY = "owner-secret-for-tests-0123456789";
const REVIEWER_KEY = "reviewer-secret-for-tests-9876543210";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "pathable-survey-"));
Object.assign(process.env, { OWNER_KEY, REVIEWER_KEY, DATA_DIR: dataDir, MODEL_API_KEY: "unused-test-key" });
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL;

const auth = await import("../lib/owner");
const surveysRoute = await import("../app/api/surveys/route");
const surveyRoute = await import("../app/api/surveys/[id]/route");
const photosRoute = await import("../app/api/surveys/[id]/photos/route");
const photoRoute = await import("../app/api/surveys/photos/[id]/route");
const dataRoute = await import("../app/api/survey-data/route");
const prioritiesRoute = await import("../app/api/survey-priorities/route");
const { loadPlaceIntelligence } = await import("../lib/place-intelligence-store");
const { computeCoverage } = await import("../lib/coverage");
const { directory } = await import("../lib/campus-directory");
const { activeRegion } = await import("../lib/region");
const store = await import("../lib/store");
const { parseCsv, toCsv } = await import("../lib/csv");
const { CHECKLISTS, findChecklist } = await import("../lib/survey-taxonomy");
const { needsOfGroups, NEEDS } = await import("../lib/needs");
const { PLACE_FEATURES } = await import("../lib/place-attributes");
after(() => rm(dataDir, { recursive: true, force: true }));

const OWNER = `${auth.OWNER_COOKIE}=${auth.signIn(OWNER_KEY)!.value}`;
const REVIEWER = `${auth.OWNER_COOKIE}=${auth.signIn(REVIEWER_KEY)!.value}`;
const request = (url: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
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

const LIBRARY = { osmType: "way", osmId: 517026148, name: "Central Library" } as const;
const LIBRARY_AT = { latitude: 23.8158145, longitude: 86.4421811 };
const today = "2026-11-02";
const start = (change: Record<string, unknown> = {}, cookie = OWNER) =>
  body(surveysRoute.POST(request("/api/surveys", { method: "POST", cookie, json: { place: LIBRARY, checklistId: "building", observedOn: today, ...change } })));
const save = (id: string, change: Record<string, unknown>, cookie = OWNER) =>
  body(surveyRoute.PATCH(request(`/api/surveys/${id}`, { method: "PATCH", cookie, json: change }), ctx(id)));
const act = (id: string, action: string, note = "", cookie = OWNER) => save(id, { action, note }, cookie);
const get = (id: string, cookie = OWNER) => body(surveyRoute.GET(request(`/api/surveys/${id}`, { cookie }), ctx(id)));
const profile = (place: { osmType: "way" | "node" | "relation"; osmId: number } = LIBRARY, tags: Record<string, string> = {}) => loadPlaceIntelligence(place, tags);
const feature = (p: Awaited<ReturnType<typeof profile>>, id: string) => p.features.find((f) => f.id === id)!;
const publish = async (id: string) => {
  assert.equal((await act(id, "submit")).status, 200);
  assert.equal((await act(id, "approve", "", REVIEWER)).status, 200);
};
const photo = async () => `data:image/jpeg;base64,${(await sharp({ create: { width: 300, height: 200, channels: 3, background: "#667788" } }).withExif({ IFD0: { Copyright: "secret-camera-owner" } }).jpeg().toBuffer()).toString("base64")}`;

test("the taxonomy is sound: every need and feature exists, and every kind of value is typed", () => {
  const needs = new Set(NEEDS.map((n) => n.id));
  const features = new Set(PLACE_FEATURES.map((f) => f.id));
  assert.ok(CHECKLISTS.length >= 11);
  for (const checklist of CHECKLISTS) {
    assert.ok(checklist.inspect && checklist.record && checklist.evidence && checklist.limits, `${checklist.id} explains itself`);
    assert.ok(checklist.attributes.length, checklist.id);
    assert.equal(new Set(checklist.attributes.map((a) => a.id)).size, checklist.attributes.length);
    for (const attribute of checklist.attributes) {
      assert.ok(attribute.definition, attribute.id);
      assert.ok(attribute.needIds.every((n) => needs.has(n)), `${checklist.id}.${attribute.id} needs`);
      if (attribute.featureId) assert.ok(features.has(attribute.featureId), `${checklist.id}.${attribute.id} feature`);
    }
  }
  assert.ok(!JSON.stringify(CHECKLISTS).match(/compliant|meets the standard/i), "no checklist claims compliance");
  assert.equal(findChecklist("nope"), undefined);
  assert.ok(needsOfGroups(["cognitive"]).length);
});

test("creating a survey needs the owner, a directory place and a valid target", async () => {
  assert.equal((await start({}, "")).status, 401);
  assert.equal((await start({}, REVIEWER)).status, 403);
  assert.equal((await start({ place: { osmType: "way", osmId: 42 } })).status, 400, "not in the directory");
  assert.equal((await start({ checklistId: "nope" })).status, 400);
  assert.equal((await start({ observedOn: "someday" })).status, 400);
  assert.equal((await start({ observedOn: "2099-01-01" })).status, 400, "not in the future");
  assert.equal((await start({ checklistId: "ramp" })).status, 400, "a ramp checklist needs a specific ramp");
  assert.equal((await start({ checklistId: "ramp", sublocation: { type: "lift", name: "Main lift" } })).status, 400, "the checklist must fit the spot");
  assert.equal((await start({ checklistId: "ramp", sublocation: { type: "ramp", name: "" } })).status, 400, "the spot must be named");

  const sent = await start({ observedOn: "2026-10-01" });
  assert.equal(sent.status, 201);
  const stored = await get(sent.body.id);
  assert.equal(stored.body.state, "draft");
  assert.equal(stored.body.place.name, "Central Library", "the directory's own record");
  assert.equal(stored.body.source.kind, "owner_recorded");
});

test("an incomplete survey can be saved and resumed, and shows what is left", async () => {
  const { body: { id } } = await start({ observedOn: "2026-10-02" });
  const first = await save(id, { answers: { step_free: { value: "partial", note: "Only the east door" } }, notes: "First visit", privateNotes: "Guard was helpful" });
  assert.equal(first.status, 200);
  const resumed = await get(id);
  assert.equal(resumed.body.answers.step_free.value, "partial");
  assert.equal(resumed.body.state, "draft");
  const second = await save(id, { answers: { ...resumed.body.answers, lift: { value: "not_operational" } } });
  assert.equal(second.status, 200);
  const again = await get(id);
  assert.deepEqual(Object.keys(again.body.answers).sort(), ["lift", "step_free"]);
  assert.equal(again.body.notes, "First visit", "fields not sent are kept");
  const { surveyProgress } = await import("../lib/survey");
  const progress = surveyProgress(again.body);
  assert.equal(progress.assessed, 2);
  assert.equal(progress.total, findChecklist("building")!.attributes.length);
  assert.ok(progress.notAssessed.some((a) => a.id === "seating"));
  assert.equal((await save(id, { answers: {} }, REVIEWER)).status, 403, "reviewers do not edit");
});

test("attribute values and units are validated by type", async () => {
  const { body: { id } } = await start({ checklistId: "ramp", sublocation: { type: "ramp", name: "Test ramp A" } });
  const answers = (a: Record<string, unknown>) => save(id, { answers: a });
  assert.match((await answers({ ramp: { value: "yes" } })).body.error, /choose one of the listed options/);
  assert.match((await answers({ surface: { value: "marble" } })).body.error, /listed options/);
  assert.match((await answers({ slope: { value: "steep", unit: "percent" } })).body.error, /enter a number/);
  assert.match((await answers({ slope: { value: 500, unit: "percent" } })).body.error, /between/);
  assert.match((await answers({ slope: { value: 8 } })).body.error, /choose a unit/);
  assert.match((await answers({ slope: { value: 8, unit: "cm" } })).body.error, /choose a unit/);
  assert.match((await answers({ width: { value: 120, unit: "mm" } })).body.error, /choose a unit/);
  assert.match((await answers({ nonsense: { value: 1 } })).body.error, /not on the/);
  const ok = await answers({ ramp: { value: "obstructed" }, slope: { value: 8.5, unit: "percent", method: "Rise and run with a tape" }, width: { value: "120" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.answers.width.unit, "cm", "the only allowed unit");
  assert.equal(ok.body.answers.width.value, 120);

  // A measurement without a method, or an "absent" without saying where you looked, cannot be submitted.
  assert.equal((await save(id, { answers: { width: { value: 120, unit: "cm" } } })).status, 200);
  assert.match((await act(id, "submit")).body.error, /say how it was measured/);
  assert.equal((await save(id, { answers: { handrails: { value: "absent" } } })).status, 200);
  assert.match((await act(id, "submit")).body.error, /say where you looked/);
  const empty = await start({ observedOn: "2026-10-03" });
  assert.match((await act(empty.body.id, "submit")).body.error, /at least one thing/);
});

test("a survey of one entrance speaks for that entrance only, and keeps its exact position", async () => {
  const spot = { latitude: LIBRARY_AT.latitude - 0.0006, longitude: LIBRARY_AT.longitude - 0.0004, accuracyM: 6 };
  const a = await start({ checklistId: "entrance", sublocation: { type: "entrance", name: "North entrance" }, ...spot });
  assert.equal(a.status, 201);
  assert.equal((await get(a.body.id)).body.coordinates.latitude, spot.latitude);
  await save(a.body.id, { answers: { step_free: { value: "absent", note: "Two steps at the door" } } });
  await publish(a.body.id);
  const b = await start({ checklistId: "entrance", sublocation: { type: "entrance", name: "East entrance" } });
  await save(b.body.id, { answers: { step_free: { value: "present" } } });
  await publish(b.body.id);

  const p = await profile();
  const stepFree = feature(p, "step_free_entrance");
  const claims = stepFree.claims.filter((c) => c.source === "survey");
  assert.equal(claims.length, 2, "both entrances are shown");
  assert.equal(stepFree.conflict, undefined, "one step-free entrance and one not are not a contradiction");
  assert.ok(claims.some((c) => /North entrance only, not to the whole place/.test(c.scope)));
  const north = p.surveys.find((s) => s.id === a.body.id)!;
  assert.equal(north.coordinates?.latitude, spot.latitude);
  assert.equal(feature(p, "lift").claims.filter((c) => c.source === "survey").length, 0, "other features are untouched");

  // A named spot belongs to its own place.
  const other = directory(activeRegion()).find((x) => x.osmId !== LIBRARY.osmId)!;
  assert.equal((await start({ place: other, checklistId: "entrance", sublocationId: a.body.sublocationId })).status, 400, "another place's entrance");
  assert.equal((await profile({ osmType: other.osmType, osmId: other.osmId })).surveys.length, 0, "nothing leaks to another place");
});

test("positions outside the campus or away from the place are refused", async () => {
  assert.equal((await start({ latitude: 40.4459, longitude: -3.6774 })).status, 400, "Madrid");
  assert.match((await start({ latitude: 23.8095, longitude: 86.443 })).body.error, /does not match the place/);
});

test("nothing unapproved is public: drafts, submitted, returned and rejected surveys, and their photos", async () => {
  const { body: { id } } = await start({ checklistId: "hearing", observedOn: "2026-10-04" });
  await save(id, { answers: { visual_alarms: { value: "present" } }, notes: "PUBLIC-AFTER-APPROVAL", privateNotes: "PRIVATE-TEAM-NOTE" });
  const added = await body(photosRoute.POST(request(`/api/surveys/${id}/photos`, { method: "POST", cookie: OWNER, json: { image: await photo(), caption: "Alarm" } }), ctx(id)));
  assert.equal(added.status, 201);
  const photoId = added.body.id as string;
  const visitorPhoto = () => photoRoute.GET(request(`/api/surveys/photos/${photoId}`), ctx(photoId));
  assert.equal((await save(id, { answers: { visual_alarms: { value: "present", photoIds: [photoId] } } })).status, 200);

  const hidden = async (label: string) => {
    const text = JSON.stringify(await profile());
    assert.ok(!text.includes("PUBLIC-AFTER-APPROVAL") && !text.includes(id), `${label}: not on the profile`);
    assert.equal((await visitorPhoto()).status, 404, `${label}: photo hidden`);
    const exported = await (await dataRoute.GET(request("/api/survey-data?scope=public"))).text();
    assert.ok(!exported.includes(id), `${label}: not exported`);
  };
  await hidden("draft");
  assert.equal((await get(id, "")).status, 401);
  assert.equal((await act(id, "approve", "", REVIEWER)).status, 400, "a draft cannot be approved");
  assert.equal((await act(id, "submit")).status, 200);
  await hidden("submitted");
  assert.equal((await act(id, "return", "", REVIEWER)).status, 400, "returning needs a reason");
  assert.equal((await act(id, "return", "Photo is blurred", REVIEWER)).status, 200);
  await hidden("returned");
  assert.equal((await act(id, "submit")).status, 200);
  assert.equal((await act(id, "approve", "", "")).status, 401);
  assert.equal((await act(id, "approve", "", REVIEWER)).status, 200);

  const text = JSON.stringify(await profile());
  assert.ok(text.includes("PUBLIC-AFTER-APPROVAL"), "approved: public");
  assert.ok(!text.includes("PRIVATE-TEAM-NOTE"), "the private note never is");
  assert.equal((await visitorPhoto()).status, 200);
  assert.equal((await visitorPhoto()).headers.get("cache-control"), "private, no-store");
  const stored = Buffer.from(await (await visitorPhoto()).arrayBuffer());
  assert.equal((await sharp(stored).metadata()).exif, undefined, "survey photos are cleaned");
  assert.ok(!stored.includes(Buffer.from("secret-camera-owner")));

  assert.equal((await save(id, { notes: "edited" })).status, 400, "a public survey is not edited in place");
  assert.equal((await act(id, "withdraw", "Wrong floor", REVIEWER)).status, 403, "only the owner withdraws");
  assert.equal((await act(id, "withdraw", "Wrong floor")).status, 200);
  await hidden("withdrawn");

  const rejected = await start({ checklistId: "rest", observedOn: "2026-10-05" });
  await save(rejected.body.id, { answers: { seating: { value: "present" } } });
  await act(rejected.body.id, "submit");
  assert.equal((await act(rejected.body.id, "reject", "Wrong place", REVIEWER)).status, 200);
  assert.ok(!JSON.stringify(await profile()).includes(rejected.body.id));
});

test("an owner's record is never independently verified by approval, or by the owner", async () => {
  const { body: { id } } = await start({ checklistId: "visual", observedOn: "2026-10-06" });
  await save(id, { answers: { lighting: { value: "present", note: "Checked at 7pm" } } });
  await act(id, "submit");
  assert.equal((await act(id, "approve")).status, 200, "the owner can publish their own record");
  const published = feature(await profile(), "lighting");
  assert.equal(published.current, "owner_recorded", "published is not verified");

  assert.match((await act(id, "check", "I looked again")).body.error, /not independent/);
  assert.match((await act(id, "check", "", REVIEWER)).body.error, /what the check was based on/);
  assert.equal(feature(await profile(), "lighting").current, "owner_recorded");
  assert.equal((await act(id, "check", "Went on 3 Nov at 7pm: lit", REVIEWER)).status, 200);
  const checked = feature(await profile(), "lighting");
  assert.equal(checked.current, "verified");
  assert.match(checked.claims[0].verifiedNote!, /Went on 3 Nov/);
});

test("conflicting surveys both stay visible; a newer survey replaces only when it says so", async () => {
  const a = await start({ checklistId: "signage", observedOn: "2026-09-01" });
  await save(a.body.id, { answers: { landmarks: { value: "present" }, signage: { value: "present" } } });
  await publish(a.body.id);
  const b = await start({ checklistId: "signage", observedOn: "2026-10-20" });
  assert.equal(b.status, 201);
  await save(b.body.id, { answers: { landmarks: { value: "absent", note: "Walked the whole front" } } });
  await publish(b.body.id);
  let landmarks = feature(await profile(), "landmarks");
  assert.ok(landmarks.conflict, "the newer survey does not silently win");
  assert.equal(landmarks.claims.length, 2);

  assert.equal((await start({ checklistId: "visual", supersedes: b.body.id })).status, 400, "only the same spot and checklist");
  const c = await start({ checklistId: "signage", observedOn: "2026-11-01", supersedes: a.body.id });
  await save(c.body.id, { answers: { landmarks: { value: "absent", note: "Walked the whole front again" } } });
  landmarks = feature(await profile(), "landmarks");
  assert.ok(landmarks.conflict, "still shown while the replacement is only a draft");
  await publish(c.body.id);
  landmarks = feature(await profile(), "landmarks");
  assert.equal(landmarks.conflict, undefined);
  assert.equal(landmarks.history.length, 1, "the replaced record is kept in the history");
  assert.equal(landmarks.claims[0].count, 2, "the two matching surveys count as one claim");
  const p = await profile();
  assert.equal(p.surveys.find((s) => s.id === a.body.id)?.supersededBy, c.body.id);
});

test("a likely duplicate survey is flagged when it is started", async () => {
  const first = await start({ checklistId: "toilet", sublocation: { type: "toilet", name: "Ground floor" }, observedOn: "2026-10-10" });
  const again = await start({ checklistId: "toilet", sublocationId: first.body.sublocationId, observedOn: "2026-10-12" });
  assert.equal(again.body.similarTo, first.body.id);
  const later = await start({ checklistId: "toilet", sublocationId: first.body.sublocationId, observedOn: "2026-06-01" });
  assert.equal(later.body.similarTo, undefined, "months apart is a new survey");
});

test("import: a preview stores nothing, bad rows are explained, and a bad file is refused whole", async () => {
  const row = (change: Record<string, unknown> = {}) => ({ place_osm_type: "way", place_osm_id: LIBRARY.osmId, checklist: "building", attribute: "seating", value: "present", observed_on: "2026-08-01", ...change });
  const post = (rows: unknown[], commit = false, cookie = OWNER) =>
    body(dataRoute.POST(request(`/api/survey-data${commit ? "?commit=1" : ""}`, { method: "POST", cookie, json: { rows } })));
  assert.equal((await post([row()], false, "")).status, 401);
  assert.equal((await post([row()], false, REVIEWER)).status, 403);

  const before = (await store.surveys.list()).length;
  const preview = await post([row()]);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.committed, false);
  assert.equal(preview.body.surveys.length, 1);
  assert.equal((await store.surveys.list()).length, before, "a preview stores nothing");

  const bad = await post([
    row({ place_osm_id: 42 }),
    row({ checklist: "nope" }),
    row({ attribute: "nope" }),
    row({ value: "excellent" }),
    row({ observed_on: "yesterday" }),
    row({ verification_state: "verified" }),
    row({ source: "verified" }),
    row({ latitude: 40.4459, longitude: -3.6774 }),
    row({ latitude: 23.8095, longitude: 86.443 }),
    row({ checklist: "ramp", attribute: "ramp", value: "present" }),
    row({ checklist: "ramp", attribute: "slope", value: 5, unit: "percent", sublocation_type: "ramp", sublocation_name: "R" }),
    row(),
  ]);
  const rowsWithErrors = bad.body.errors.map((e: { row: number }) => e.row);
  assert.deepEqual(rowsWithErrors, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.match(bad.body.errors[5].error, /cannot be imported/);
  assert.match(bad.body.errors[7].error, /outside/);
  assert.match(bad.body.errors[10].error, /how it was measured/);
  const refused = await post([row({ place_osm_id: 42 }), row()], true);
  assert.equal(refused.status, 400);
  assert.equal((await store.surveys.list()).length, before, "one bad row stops the whole file");
  assert.match((await post([row(), row()])).body.errors[0].error, /appears twice/);
});

test("import: arrives for review with its provenance, never public or verified, and never overwrites", async () => {
  const row = (change: Record<string, unknown> = {}) => ({ place_osm_type: "way", place_osm_id: LIBRARY.osmId, checklist: "rest", attribute: "shelter", value: "present", observed_on: "2026-07-01", source: "community", source_reference: "2026 student survey sheet", ...change });
  const post = (rows: unknown[], commit = true) => body(dataRoute.POST(request(`/api/survey-data${commit ? "?commit=1" : ""}`, { method: "POST", cookie: OWNER, json: { rows } })));
  const done = await post([row()]);
  assert.equal(done.status, 200);
  assert.equal(done.body.created, 1);
  const created = (await store.surveys.list()).find((s) => s.observedOn === "2026-07-01")!;
  assert.equal(created.state, "submitted");
  assert.equal(created.source.kind, "community");
  assert.equal(created.source.reference, "2026 student survey sheet");
  assert.ok(!(await profile()).surveys.some((s) => s.id === created.id), "not public on arrival");

  const again = await post([row()]);
  assert.equal(again.body.created, 0, "the same statement is skipped");
  assert.equal(again.body.surveys[0].duplicateOf, created.id);

  const different = await post([row({ value: "absent", note: "Walked around it" })]);
  assert.equal(different.body.created, 1);
  assert.equal(different.body.surveys[0].conflictsWith, created.id, "a different statement is kept beside it");
  assert.equal((await store.surveys.get(created.id))!.answers.shelter.value, "present", "and the original is untouched");

  await act(created.id, "approve", "", REVIEWER);
  const shelter = (await profile()).features.find((f) => f.id === "shelter")!;
  assert.equal(shelter.current, "community", "the imported source is kept, not upgraded");

  // CSV takes the same route.
  const csv = toCsv(["place_osm_type", "place_osm_id", "checklist", "attribute", "value", "note", "observed_on"], [{ place_osm_type: "way", place_osm_id: LIBRARY.osmId, checklist: "rest", attribute: "other", value: 'Bench, "shaded"', note: "", observed_on: "2026-06-15" }]);
  const viaCsv = await body(dataRoute.POST(request("/api/survey-data", { method: "POST", cookie: OWNER, headers: { "content-type": "text/csv" }, body: csv })));
  assert.equal(viaCsv.status, 200);
  assert.deepEqual(viaCsv.body.errors, []);
  assert.equal(viaCsv.body.surveys[0].answers, 1);
});

test("export: the public form has approved records and public fields only; the full form is the owner's", async () => {
  const { body: { id } } = await start({ checklistId: "rest", observedOn: "2026-05-01" });
  await save(id, { answers: { seating: { value: "present" } }, notes: "EXPORT-PUBLIC-NOTE", privateNotes: "EXPORT-PRIVATE-NOTE" });
  const draft = await start({ checklistId: "rest", observedOn: "2026-05-02" });
  await save(draft.body.id, { answers: { seating: { value: "absent" } } });
  await publish(id);

  const open = await dataRoute.GET(request("/api/survey-data?scope=public&format=csv"));
  assert.equal(open.status, 200);
  assert.match(open.headers.get("content-disposition")!, /attachment/);
  const text = await open.text();
  assert.ok(text.includes(id));
  assert.ok(!text.includes(draft.body.id), "no drafts");
  assert.ok(!text.includes("EXPORT-PRIVATE-NOTE") && !/private_notes|observer|,state/.test(text.split("\r\n")[0]), "no private fields");
  const parsed = parseCsv(text);
  assert.ok("rows" in parsed && parsed.rows.some((r) => r.survey_id === id && r.provenance === "owner_recorded"));

  assert.equal((await dataRoute.GET(request("/api/survey-data?scope=full"))).status, 401);
  assert.equal((await dataRoute.GET(request("/api/survey-data?scope=full", { cookie: REVIEWER }))).status, 403);
  const full = await (await dataRoute.GET(request("/api/survey-data?scope=full", { cookie: OWNER }))).text();
  assert.ok(full.includes("EXPORT-PRIVATE-NOTE") && full.includes(draft.body.id));
});

test("CSV is read strictly and cannot carry a live formula out", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",2\n'), { rows: [{ a: 'x, "y"', b: "2" }] });
  assert.ok("error" in parseCsv('a\n"open'));
  assert.ok("error" in parseCsv(""));
  const csv = toCsv(["a", "b"], [{ a: "=HYPERLINK(1)", b: 5 }]);
  assert.ok(csv.includes("'=HYPERLINK(1)"), "the formula is neutralised");
  assert.ok(csv.includes(",5"));
});

test("coverage counts what is recorded, by stated definitions, and never reads a gap as accessible", async () => {
  const places = [
    { osmType: "way" as const, osmId: 1, name: "Library A", category: "library" as const },
    { osmType: "way" as const, osmId: 2, name: "Hostel B", category: "hostel" as const },
    { osmType: "way" as const, osmId: 3, name: "Sports C", category: "sports" as const },
  ];
  const at = "2026-10-01T00:00:00Z";
  const survey = (over: Record<string, unknown>) =>
    ({ id: `s${Math.random()}`, createdAt: at, updatedAt: at, place: places[0], checklistId: "rest", observedOn: "2026-10-01", observer: "owner", source: { kind: "owner_recorded" }, state: "approved", answers: {}, notes: "", privateNotes: "", photoIds: [], history: [], checks: [], ...over }) as never;
  const spot = (id: string, type: string) => ({ id, createdAt: at, place: places[0], type, name: id }) as never;
  const coverage = computeCoverage({
    places,
    surveys: [
      survey({ answers: { seating: { value: "present" }, shelter: { value: "unknown" } } }),
      survey({ checklistId: "entrance", sublocationId: "e1", answers: { step_free: { value: "present" } } }),
      survey({ checklistId: "crossing", sublocationId: "c1", answers: { kerb: { value: "absent" } }, checks: [{ by: "reviewer", at, note: "Seen" }] }),
      survey({ checklistId: "footpath", sublocationId: "f1", state: "draft", answers: { surface: { value: "smooth" } } }),
      survey({ place: places[1], state: "submitted", answers: { seating: { value: "present" } } }),
    ],
    sublocations: [spot("e1", "entrance"), spot("c1", "crossing"), spot("f1", "footpath")],
    observations: [],
    reports: [],
    priorities: [{ id: "p", createdAt: at, place: places[2], level: "hold", note: "Closed for repairs" }],
    now: new Date("2026-11-03"),
  });
  assert.equal(coverage.directory.places, 3);
  assert.equal(coverage.survey.placesWithApprovedSurvey, 1, "a draft or submitted survey does not count as surveyed");
  assert.equal(coverage.placesAwaitingReview, 1);
  assert.equal(coverage.verified.places, 1);
  assert.equal(coverage.verified.surveyAnswers, 1);
  assert.equal(coverage.surveyedSpots.entrances, 1);
  assert.equal(coverage.surveyedSpots.pathsAndCrossings, 1, "the draft footpath does not count");
  assert.equal(coverage.attributes.assessed, 3, "could not tell is not assessed");
  assert.ok(coverage.attributes.onStartedChecklists > 3);
  assert.equal(coverage.byNeedGroup.mobility, 2);
  assert.equal(coverage.byNeedGroup.general, 1);
  assert.equal(coverage.placesIncomplete, 1, "one recorded line does not make a place surveyed");
  assert.deepEqual(coverage.unsurveyed.map((p) => p.osmId), [2, 3]);
  assert.equal(coverage.queue.at(-1)!.place.name, "Sports C", "on hold goes last");
  assert.equal(coverage.queue[0].place.name, "Hostel B", "unsurveyed outranks already surveyed");
  assert.ok(coverage.queue[0].reasons.some((r) => /No published survey/.test(r)));
  assert.ok(!/score|rating|percent/i.test(JSON.stringify(Object.keys(coverage))));
});

test("the owner sets survey priorities; nobody else can", async () => {
  const set = (cookie: string | undefined, change: Record<string, unknown> = {}) =>
    body(prioritiesRoute.POST(request("/api/survey-priorities", { method: "POST", cookie, json: { place: LIBRARY, level: "high", note: "Most used", ...change } })));
  assert.equal((await set(undefined)).status, 401);
  assert.equal((await set(REVIEWER)).status, 403);
  assert.equal((await set(OWNER, { level: "urgent" })).status, 400);
  assert.equal((await set(OWNER, { place: { osmType: "way", osmId: 42 } })).status, 400);
  assert.equal((await set(OWNER)).status, 200);
  assert.equal((await set(OWNER, { level: "hold", note: "Building works" })).status, 200, "setting it again replaces it");
  const all = await store.surveyPriorities.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].level, "hold");
});

test("a cross-site request cannot drive the survey routes", async () => {
  const { body: { id } } = await start({ checklistId: "rest", observedOn: "2026-04-01" });
  const attack = await surveyRoute.PATCH(request(`/api/surveys/${id}`, { method: "PATCH", cookie: OWNER, headers: { origin: "https://evil.example" }, json: { action: "submit" } }), ctx(id));
  assert.equal(attack.status, 403);
});
