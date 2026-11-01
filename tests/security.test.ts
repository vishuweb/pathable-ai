// Phase 1 security and privacy regressions. Keys are set, so a request is a visitor unless it carries
// a signed session cookie. The Meta API is never called; storage is a temporary folder.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";

const OWNER_KEY = "owner-secret-for-tests-0123456789";
const REVIEWER_KEY = "reviewer-secret-for-tests-9876543210";
const dataDir = await mkdtemp(path.join(os.tmpdir(), "pathable-security-"));
Object.assign(process.env, {
  OWNER_KEY,
  REVIEWER_KEY,
  DATA_DIR: dataDir,
  MODEL_API_KEY: "unused-test-key",
  SUBMISSION_LIMIT_PER_HOUR: "3",
  SUBMISSIONS_PER_DAY: "1000",
  MAX_PENDING_SUBMISSIONS: "100",
});
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL;
delete process.env.ANALYZE_LIMIT_PER_HOUR;

const auth = await import("../lib/owner");
const reportsRoute = await import("../app/api/reports/route");
const reportRoute = await import("../app/api/reports/[id]/route");
const reportImageRoute = await import("../app/api/reports/[id]/image/route");
const reportMarkdownRoute = await import("../app/api/reports/[id]/markdown/route");
const draftsRoute = await import("../app/api/drafts/route");
const draftRoute = await import("../app/api/drafts/[id]/route");
const draftImageRoute = await import("../app/api/drafts/[id]/image/route");
const observationsRoute = await import("../app/api/observations/route");
const observationRoute = await import("../app/api/observations/[id]/route");
const observationImageRoute = await import("../app/api/observations/[id]/image/route");
const resultsRoute = await import("../app/api/results/route");
const ownerRoute = await import("../app/api/owner/route");
const moderation = await import("../lib/moderation-store");
after(() => rm(dataDir, { recursive: true, force: true }));

// ---------------------------------------------------------------- helpers

const cookieFor = (key: string, now?: number) => `${auth.OWNER_COOKIE}=${auth.signIn(key, auth.accessConfig(), now)!.value}`;
const OWNER = cookieFor(OWNER_KEY);
const REVIEWER = cookieFor(REVIEWER_KEY);

let visitor = 0;
/** A request from a new visitor address, so one test's volume never limits another's. */
const request = (url: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", `198.51.100.${++visitor % 250}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost${url}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (pending: Response | Promise<Response>) => {
  const response = await pending;
  // Test helper: response bodies are inspected loosely on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json().catch(() => undefined)) as any };
};

const dataUrl = (bytes: Buffer) => `data:image/jpeg;base64,${bytes.toString("base64")}`;
const plainJpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#8899aa" } }).jpeg().toBuffer();
const EXIF = { IFD0: { Copyright: "secret-camera-owner", ImageDescription: "private-description" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "23/1 48/1 57/1", GPSLongitudeRef: "E", GPSLongitude: "86/1 26/1 31/1" } };
const exifJpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#8899aa" } }).withExif(EXIF).jpeg().toBuffer();

const finding = {
  id: "f1",
  category: "obstructed_footpath",
  title: "Scooter",
  observed_condition: "x",
  why_it_matters: "x",
  evidence_phrase: "scooter",
  evidence_box: { x_min: 100, y_min: 100, x_max: 500, y_max: 500 },
  located: true,
  potential_impact: "low",
  confidence: "low",
  uncertainty: "x",
  suggested_next_step: "x",
};
const analysis = {
  scene_type: "street",
  scene_summary: "A footpath.",
  image_quality: "good",
  image_quality_notes: "",
  findings: [finding],
  no_findings_reason: "",
};
const evidence = [{ findingId: "f1", phrase: "scooter", status: "approximate", regions: [], modelBox: { left: 40, top: 40, right: 200, bottom: 150 }, note: "Approximate." }];
const reportBody = (change: Record<string, unknown> = {}) => ({
  image: dataUrl(plainJpeg),
  width: 400,
  height: 300,
  analysis,
  evidence,
  models: { analysis: "muse-spark-1.3" },
  timings: { analysisMs: 1000, reviewMs: 2000 },
  reviews: { f1: { decision: "rejected" } },
  missedIssues: [],
  reviewerNote: "",
  consent: true,
  ...change,
});

const LIBRARY = { osmType: "way", osmId: 517026148, name: "Central Library" };
const LIBRARY_AT = { latitude: 23.8158145, longitude: 86.4421811 };
const observationBody = (change: Record<string, unknown> = {}) => ({
  place: LIBRARY,
  ...LIBRARY_AT,
  featureId: "ramp",
  finding: "blocked",
  area: "entrance",
  note: "A bike rack stands in front of the ramp.",
  observedOn: "2026-10-30",
  consent: true,
  ...change,
});

async function saveReport(change: Record<string, unknown> = {}, cookie?: string) {
  return body(await reportsRoute.POST(request("/api/reports", { method: "POST", json: reportBody(change), cookie })));
}
async function saveObservation(change: Record<string, unknown> = {}, cookie?: string) {
  return body(await observationsRoute.POST(request("/api/observations", { method: "POST", json: observationBody(change), cookie })));
}
const getReport = (id: string, cookie?: string) => reportRoute.GET(request(`/api/reports/${id}`, { cookie }), ctx(id));
const getObservations = (cookie?: string, pending = false) =>
  body(observationsRoute.GET(request(`/api/observations?osmType=way&osmId=517026148${pending ? "&pending=1" : ""}`, { cookie })));
const storedImage = async (response: Response) => Buffer.from(await response.arrayBuffer());

// ---------------------------------------------------------------- sessions and fail-closed access

test("without keys: open only for local development, locked everywhere else", () => {
  const none = { ownerKey: undefined, reviewerKey: undefined };
  assert.deepEqual(auth.checkSession(undefined, { ...none, production: false }), { role: "owner" });
  assert.deepEqual(auth.checkSession(undefined, { ...none, production: true }), { problem: "locked" });
  assert.deepEqual(auth.checkSession("anything", { ...none, production: true }), { problem: "locked" });
  assert.equal(auth.signIn(OWNER_KEY, { ...none, production: true }), undefined, "nobody can sign in without a key to match");
  const withKey = { ownerKey: OWNER_KEY, reviewerKey: undefined, production: false };
  assert.deepEqual(auth.checkSession(undefined, withKey), { problem: "missing" }, "setting a key closes local access too");
  assert.equal(auth.ownerKeyMissing({ ...none, production: true }), true);
  assert.equal(auth.ownerKeyRequired({ ...none, production: true }), true);
  assert.equal(auth.ownerKeyRequired({ ...none, production: false }), false);
});

test("a production server with no keys refuses every protected route instead of opening them", async () => {
  const saved = { OWNER_KEY: process.env.OWNER_KEY, REVIEWER_KEY: process.env.REVIEWER_KEY, NODE_ENV: process.env.NODE_ENV };
  try {
    delete process.env.OWNER_KEY;
    delete process.env.REVIEWER_KEY;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const response = await draftsRoute.GET(request("/api/drafts"));
    assert.equal(response.status, 503);
    assert.equal((await draftsRoute.POST(request("/api/drafts", { method: "POST", json: {} }))).status, 503);
    assert.equal((await reportRoute.DELETE(request("/api/reports/x", { method: "DELETE" }), ctx("x"))).status, 503);
    assert.equal((await observationRoute.PATCH(request("/api/observations/x", { method: "PATCH", json: {} }), ctx("x"))).status, 503);
    // A visitor can still send a report, but it cannot be approved by anyone until keys exist.
    const sent = await saveReport();
    assert.equal(sent.body.moderation, "pending");
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else (process.env as Record<string, string>)[k] = v;
    }
  }
});

test("sessions: valid, wrong role, tampered, forged, expired and rotated cookies are told apart", () => {
  const config = auth.accessConfig();
  const now = Date.now();
  const valid = auth.signIn(OWNER_KEY, config, now)!.value;
  assert.deepEqual(auth.checkSession(valid, config, now), { role: "owner" });
  assert.equal(auth.signIn("wrong-key", config), undefined);
  assert.equal(auth.signIn("", config), undefined);

  const [v, role, expires, sig] = valid.split(".");
  assert.deepEqual(auth.checkSession(`${v}.${role}.${expires}.${sig.slice(0, -2)}AA`, config, now), { problem: "invalid" }, "tampered signature");
  assert.deepEqual(auth.checkSession(`${v}.${role}.${Number(expires) + 99999}.${sig}`, config, now), { problem: "invalid" }, "extended expiry");
  const reviewer = auth.signIn(REVIEWER_KEY, config, now)!.value.split(".");
  assert.deepEqual(auth.checkSession(`v1.owner.${reviewer[2]}.${reviewer[3]}`, config, now), { problem: "invalid" }, "a reviewer cookie relabelled as owner");
  assert.deepEqual(auth.checkSession("not-a-cookie", config, now), { problem: "invalid" });
  assert.deepEqual(auth.checkSession(undefined, config, now), { problem: "missing" });

  const weekLater = now + (auth.SESSION_SECONDS + 5) * 1000;
  assert.deepEqual(auth.checkSession(valid, config, weekLater), { problem: "expired" }, "the server enforces the lifetime");
  assert.deepEqual(auth.checkSession(`${v}.${role}.${expires}.${sig.slice(0, -2)}AA`, config, weekLater), { problem: "invalid" }, "a forged cookie is never reported as merely expired");
  assert.deepEqual(auth.checkSession(valid, { ...config, ownerKey: "a-different-key" }, now), { problem: "invalid" }, "changing the key signs everyone out");
  assert.deepEqual(auth.checkSession(valid, { ...config, ownerKey: undefined }, now), { problem: "invalid" });
});

test("API refusals: 401 for no, bad or expired sessions (clearing bad cookies), 403 for the wrong role", async () => {
  const config = auth.accessConfig();
  const now = Date.now();
  const missing = auth.authFailure(auth.checkSession(undefined, config, now), "owner")!;
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get("set-cookie"), null, "nothing to clear");

  const expired = auth.authFailure(auth.checkSession(auth.signIn(OWNER_KEY, config, now)!.value, config, now + 8 * 864e5), "owner")!;
  assert.equal(expired.status, 401);
  assert.match((await expired.json()).error, /expired/);
  assert.match(expired.headers.get("set-cookie")!, /Max-Age=0/, "an expired cookie is cleared");

  const invalid = auth.authFailure(auth.checkSession("v1.owner.1234567890.AAAA", config, now), "owner")!;
  assert.equal(invalid.status, 401);
  assert.match(invalid.headers.get("set-cookie")!, /Max-Age=0/);

  assert.equal(auth.authFailure({ role: "reviewer" }, "owner")!.status, 403);
  assert.equal(auth.authFailure({ role: "reviewer" }, "reviewer"), undefined);
  assert.equal(auth.authFailure({ role: "owner" }, "reviewer"), undefined);
  assert.equal(auth.authFailure({ role: "owner" }, "owner"), undefined);
});

// ---------------------------------------------------------------- protected routes

test("the review queue is closed to visitors, expired sessions and reviewers (where owner-only)", async () => {
  const stale = cookieFor(OWNER_KEY, Date.now() - 8 * 864e5);
  assert.equal((await draftsRoute.GET(request("/api/drafts"))).status, 401, "a visitor cannot read the queue summary or file names");
  assert.equal((await draftsRoute.GET(request("/api/drafts", { cookie: stale }))).status, 401, "an expired session cannot");
  assert.equal((await draftsRoute.GET(request("/api/drafts", { cookie: "pathable_owner=forged" }))).status, 401);
  assert.equal((await draftsRoute.GET(request("/api/drafts", { cookie: REVIEWER }))).status, 403, "reviewers do not see the batch tool's summary");
  const owner = await body(await draftsRoute.GET(request("/api/drafts", { cookie: OWNER })));
  assert.deepEqual(Object.keys(owner.body).sort(), ["knownSources", "pending"]);

  assert.equal((await draftsRoute.POST(request("/api/drafts", { method: "POST", json: {} }))).status, 401);
  assert.equal((await draftsRoute.POST(request("/api/drafts", { method: "POST", json: {}, cookie: REVIEWER }))).status, 403);
  assert.equal((await draftImageRoute.GET(request("/api/drafts/x/image"), ctx("x"))).status, 401);
  assert.equal((await draftRoute.DELETE(request("/api/drafts/x", { method: "DELETE" }), ctx("x"))).status, 401);
});

test("owner-only report and observation actions refuse visitors and reviewers", async () => {
  const saved = await saveReport({}, OWNER);
  const id = saved.body.id as string;
  for (const [label, response] of [
    ["report delete", await reportRoute.DELETE(request(`/api/reports/${id}`, { method: "DELETE" }), ctx(id))],
    ["report status", await reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", json: { status: "verified" } }), ctx(id))],
    ["report approve", await reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", json: { moderation: "approved" } }), ctx(id))],
  ] as const) assert.equal(response.status, 401, label);
  assert.equal((await reportRoute.DELETE(request(`/api/reports/${id}`, { method: "DELETE", cookie: REVIEWER }), ctx(id))).status, 403);
  assert.equal((await reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: REVIEWER, json: { moderation: "approved" } }), ctx(id))).status, 403);
  assert.equal((await observationRoute.PATCH(request(`/api/observations/${id}`, { method: "PATCH", json: {} }), ctx(id))).status, 401);
  assert.equal((await observationRoute.DELETE(request(`/api/observations/${id}`, { method: "DELETE", cookie: REVIEWER }), ctx(id))).status, 403);
});

// ---------------------------------------------------------------- rate limiting

test("public report submission is rate limited per visitor; the owner and reviewers are not", async () => {
  const sameVisitor = () => request("/api/reports", { method: "POST", json: {}, headers: { "x-forwarded-for": "203.0.113.7" } });
  // Each call below is refused by validation (400), but still counts against the visitor's allowance.
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = sameVisitor();
    r.headers.set("x-forwarded-for", "203.0.113.7");
    statuses.push((await reportsRoute.POST(r)).status);
  }
  assert.deepEqual(statuses, [400, 400, 400, 429, 429], "three allowed, then refused");
  const other = request("/api/reports", { method: "POST", json: {} });
  other.headers.set("x-forwarded-for", "203.0.113.99");
  assert.equal((await reportsRoute.POST(other)).status, 400, "another visitor is unaffected");

  for (const cookie of [OWNER, REVIEWER]) {
    for (let i = 0; i < 6; i++) {
      const r = request("/api/reports", { method: "POST", json: {}, cookie });
      r.headers.set("x-forwarded-for", "203.0.113.50");
      assert.equal((await reportsRoute.POST(r)).status, 400);
    }
  }

  const obs = [];
  for (let i = 0; i < 5; i++) {
    const r = request("/api/observations", { method: "POST", json: {} });
    r.headers.set("x-forwarded-for", "203.0.113.8");
    obs.push((await observationsRoute.POST(r)).status);
  }
  assert.deepEqual(obs, [400, 400, 400, 429, 429], "observations are limited the same way");
});

test("the pending-approval backlog is capped from storage, whatever the visitor address", async () => {
  const before = await moderation.countPending();
  process.env.MAX_PENDING_SUBMISSIONS = String(before + 2);
  try {
    assert.equal((await saveReport()).status, 201);
    assert.equal((await saveObservation()).status, 201);
    const full = await saveReport();
    assert.equal(full.status, 503);
    assert.match(full.body.error, /waiting for review/);
    assert.equal((await saveObservation()).status, 503);
    assert.equal((await saveReport({}, OWNER)).status, 201, "the owner is never refused");
  } finally {
    process.env.MAX_PENDING_SUBMISSIONS = "100";
  }
});

// ---------------------------------------------------------------- server-side image cleaning

test("report photos are re-encoded on the server: EXIF, GPS and text metadata never reach storage", async () => {
  assert.ok(exifJpeg.includes(Buffer.from("secret-camera-owner")), "the test photo really carries the secret");
  assert.ok((await sharp(exifJpeg).metadata()).exif, "and EXIF");
  const saved = await saveReport({ image: dataUrl(exifJpeg) });
  assert.equal(saved.status, 201);
  const stored = await storedImage(await reportImageRoute.GET(request(`/api/reports/${saved.body.id}/image`, { cookie: OWNER }), ctx(saved.body.id)));
  const meta = await sharp(stored).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(`${meta.width}x${meta.height}`, "400x300");
  assert.equal(meta.exif, undefined);
  assert.equal(meta.icc, undefined);
  assert.equal(meta.xmp, undefined);
  assert.ok(!stored.includes(Buffer.from("secret-camera-owner")) && !stored.includes(Buffer.from("private-description")));
  assert.ok(!stored.includes(Buffer.from("Exif")), "no Exif block at all");
});

test("observation photos are cleaned the same way", async () => {
  const saved = await saveObservation({ photo: dataUrl(exifJpeg) }, OWNER);
  assert.equal(saved.status, 201);
  const stored = await storedImage(await observationImageRoute.GET(request(`/api/observations/${saved.body.id}/image`, { cookie: OWNER }), ctx(saved.body.id)));
  assert.equal((await sharp(stored).metadata()).exif, undefined);
  assert.ok(!stored.includes(Buffer.from("secret-camera-owner")));
});

test("queued photos are cleaned when they are queued", async () => {
  const queued = await body(await draftsRoute.POST(request("/api/drafts", {
    method: "POST",
    cookie: OWNER,
    json: { ...reportBody(), image: dataUrl(exifJpeg), consent: undefined, reviews: undefined, missedIssues: undefined, reviewerNote: undefined, timings: { analysisMs: 1000 } },
  })));
  assert.equal(queued.status, 201);
  const stored = await storedImage(await draftImageRoute.GET(request(`/api/drafts/${queued.body.id}/image`, { cookie: REVIEWER }), ctx(queued.body.id)));
  assert.equal((await sharp(stored).metadata()).exif, undefined);
  assert.ok(!stored.includes(Buffer.from("secret-camera-owner")));
});

test("unreadable or mismatched photos are refused", async () => {
  const garbage = await saveReport({ image: dataUrl(Buffer.from("this is not a picture at all")) });
  assert.equal(garbage.status, 400);
  assert.match(garbage.body.error, /could not be read as an image/);
  const sideways = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#222" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const mismatched = await saveReport({ image: dataUrl(sideways) });
  assert.equal(mismatched.status, 400, "orientation is applied on the server, so the declared size no longer matches");
  assert.match(mismatched.body.error, /size does not match/);
  assert.equal((await saveReport({ width: 401 })).status, 400);
  assert.equal((await saveObservation({ photo: dataUrl(Buffer.from("nope")) })).status, 400);
});

test("only real JPEG, PNG and WebP pictures are accepted, whatever the upload claims to be", async () => {
  const base = { create: { width: 400, height: 300, channels: 3 as const, background: "#445566" } };
  const png = await sharp(base).png().toBuffer();
  const webp = await sharp(base).webp().toBuffer();
  assert.equal((await saveReport({ image: dataUrl(png) }, OWNER)).status, 201, "PNG is converted to a clean JPEG");
  assert.equal((await saveReport({ image: dataUrl(webp) }, OWNER)).status, 201);
  const gif = await sharp(base).gif().toBuffer();
  const tiff = await sharp(base).tiff().toBuffer();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300"/></svg>');
  for (const [label, bytes] of [["gif", gif], ["tiff", tiff], ["svg", svg]] as const) {
    const refused = await saveReport({ image: dataUrl(bytes) });
    assert.equal(refused.status, 400, `${label} posing as a JPEG is refused`);
    assert.equal((await saveObservation({ photo: dataUrl(bytes) })).status, 400, `${label} observation photo is refused`);
  }
});

// ---------------------------------------------------------------- requests from other sites

test("a signed-in owner's browser cannot be driven from another site", async () => {
  const saved = await saveReport({});
  const id = saved.body.id as string;
  const attack = (headers: Record<string, string>, method: "PATCH" | "DELETE" = "PATCH") =>
    reportRoute[method](
      request(`/api/reports/${id}`, { method, cookie: OWNER, headers, ...(method === "PATCH" ? { json: { moderation: "approved" } } : {}) }),
      ctx(id),
    );
  const foreign: Record<string, string>[] = [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "null" }];
  for (const headers of foreign) {
    const refused = await attack(headers);
    assert.equal(refused.status, 403, JSON.stringify(headers));
    assert.match((await refused.json()).error, /another site/);
  }
  assert.equal((await attack({ origin: "https://evil.example" }, "DELETE")).status, 403);
  assert.equal((await (await getReport(id, OWNER)).json()).moderation.state, "pending", "nothing changed");

  // The real site's own requests, and non-browser clients, still work.
  assert.equal((await attack({ origin: "http://localhost", "sec-fetch-site": "same-origin" })).status, 200);

  const signOut = (headers: Record<string, string>) => {
    const form = new FormData();
    form.set("action", "signout");
    return ownerRoute.POST(new Request("http://localhost/api/owner", { method: "POST", body: form, headers }));
  };
  assert.equal((await signOut({ origin: "https://evil.example" })).status, 403, "another site cannot sign the owner out");
  assert.equal((await signOut({ origin: "http://localhost" })).status, 303);
});

// ---------------------------------------------------------------- moderation and visibility

test("a visitor's report is pending and invisible to everyone but the owner until approved", async () => {
  const sent = await saveReport({ reviewerNote: "visible only after approval" });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.moderation, "pending");
  const id = sent.body.id as string;

  for (const cookie of [undefined, REVIEWER]) {
    assert.equal((await getReport(id, cookie)).status, 404, "the report data");
    assert.equal((await reportImageRoute.GET(request(`/api/reports/${id}/image`, { cookie }), ctx(id))).status, 404, "the photo");
    assert.equal((await reportMarkdownRoute.GET(request(`/api/reports/${id}/markdown`, { cookie }), ctx(id))).status, 404, "the export");
  }
  assert.ok(!(await moderation.publicReports()).some((r) => r.id === id), "not in any public list");
  assert.equal((await getReport(id, OWNER)).status, 200, "the owner can see it");
  assert.equal((await reportImageRoute.GET(request(`/api/reports/${id}/image`, { cookie: OWNER }), ctx(id))).status, 200);

  const approved = await body(await reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: OWNER, json: { moderation: "approved", note: "Checked: no faces" } }), ctx(id)));
  assert.equal(approved.status, 200);
  assert.equal(approved.body.moderation.state, "approved");
  assert.equal((await getReport(id)).status, 200, "now public");
  assert.ok((await moderation.publicReports()).some((r) => r.id === id));

  await reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: OWNER, json: { moderation: "rejected" } }), ctx(id));
  assert.equal((await getReport(id)).status, 404, "rejected reports are hidden again");
  assert.equal((await reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: OWNER, json: { moderation: "maybe" } }), ctx(id))).status, 400);
});

test("pending reports stay out of the public results", async () => {
  const before = (await body(await resultsRoute.GET())).body.reviewedPhotos + (await body(await resultsRoute.GET())).body.singleUploadsNotCounted;
  const pendingOnly = await saveReport({}, undefined);
  assert.equal(pendingOnly.body.moderation, "pending");
  const after = await body(await resultsRoute.GET());
  assert.equal(after.body.reviewedPhotos + after.body.singleUploadsNotCounted, before, "a pending report is not counted at all");
});

test("a visitor's observation is pending, and neither it nor its photo is public until approved", async () => {
  const sent = await saveObservation({ photo: dataUrl(plainJpeg), note: "Needs approval first" });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.moderation, "pending");
  const id = sent.body.id as string;

  assert.ok(!(await getObservations()).body.observations.some((o: { id: string }) => o.id === id));
  assert.ok((await getObservations(OWNER, true)).body.observations.some((o: { id: string }) => o.id === id), "the owner can list pending ones");
  assert.equal((await body(observationsRoute.GET(request("/api/observations?osmType=way&osmId=517026148&pending=1")))).status, 401, "visitors cannot ask for pending ones");
  assert.equal((await observationImageRoute.GET(request(`/api/observations/${id}/image`), ctx(id))).status, 404);
  assert.equal((await observationImageRoute.GET(request(`/api/observations/${id}/image`, { cookie: OWNER }), ctx(id))).status, 200);

  assert.equal((await observationRoute.PATCH(request(`/api/observations/${id}`, { method: "PATCH", cookie: OWNER, json: { moderation: "approved" } }), ctx(id))).status, 200);
  assert.ok((await getObservations()).body.observations.some((o: { id: string }) => o.id === id), "listed once approved");
  assert.equal((await observationImageRoute.GET(request(`/api/observations/${id}/image`), ctx(id))).status, 200);
});

test("owner and reviewer submissions are approved at once; existing reports without a moderation record stay public", async () => {
  assert.equal((await saveReport({}, OWNER)).body.moderation, "approved");
  assert.equal((await saveObservation({}, OWNER)).body.moderation, "approved");
  const { isPublic } = await import("../lib/moderation");
  assert.equal(isPublic({}), true, "reports made before moderation existed are not hidden");
  assert.equal(isPublic({ moderation: { state: "pending", at: "x" } }), false);
});

// ---------------------------------------------------------------- caching and deletion

test("observation and report photos are never cached, and stop being served once deleted", async () => {
  const sent = await saveObservation({ photo: dataUrl(plainJpeg) }, OWNER);
  const id = sent.body.id as string;
  const image = await observationImageRoute.GET(request(`/api/observations/${id}/image`), ctx(id));
  assert.equal(image.status, 200);
  const cacheControl = image.headers.get("cache-control")!;
  assert.equal(cacheControl, "private, no-store");
  assert.ok(!/public|immutable|max-age=[1-9]/.test(cacheControl), "no shared or long-lived caching");

  assert.equal((await observationRoute.DELETE(request(`/api/observations/${id}`, { method: "DELETE", cookie: OWNER }), ctx(id))).status, 204);
  assert.equal((await observationImageRoute.GET(request(`/api/observations/${id}/image`), ctx(id))).status, 404, "gone immediately");
  assert.equal((await observationImageRoute.GET(request(`/api/observations/${id}/image`, { cookie: OWNER }), ctx(id))).status, 404);
  assert.ok(!(await getObservations()).body.observations.some((o: { id: string }) => o.id === id));

  const report = await saveReport({}, OWNER);
  const reportImage = await reportImageRoute.GET(request(`/api/reports/${report.body.id}/image`), ctx(report.body.id));
  assert.equal(reportImage.headers.get("cache-control"), "private, no-store");
  assert.equal((await reportRoute.DELETE(request(`/api/reports/${report.body.id}`, { method: "DELETE", cookie: OWNER }), ctx(report.body.id))).status, 204);
  assert.equal((await reportImageRoute.GET(request(`/api/reports/${report.body.id}/image`), ctx(report.body.id))).status, 404);
  assert.equal((await draftImageRoute.GET(request("/api/drafts/x/image", { cookie: OWNER }), ctx("x"))).status, 404, "draft photos: owner allowed, nothing there");
});

// ---------------------------------------------------------------- spoofed places

test("observations are tied to real campus directory places and positions", async () => {
  const error = async (change: Record<string, unknown>) => (await saveObservation(change)).body.error as string;
  assert.equal(await error({ place: { ...LIBRARY, osmId: 999999999 } }), "Choose a place from the campus directory.", "an id that is not in the directory");
  assert.equal(await error({ place: { osmType: "way", osmId: 1 } }), "Choose a place from the campus directory.");
  assert.equal(await error({ place: { ...LIBRARY, osmType: "area" } }), "Choose the place this is about.");
  assert.equal(await error({ place: { ...LIBRARY, osmId: -5 } }), "Choose the place this is about.");
  assert.match(await error({ latitude: 40.4459, longitude: -3.6774 }), /outside the IIT \(ISM\) Dhanbad pilot area/, "coordinates in Madrid");
  assert.equal(await error({ latitude: 23.8095, longitude: 86.4430 }), "The location does not match the place.", "on campus, but nowhere near the library");
  assert.equal(await error({ latitude: undefined, longitude: undefined }), "This place is outside the IIT (ISM) Dhanbad pilot area.", "missing coordinates");

  // A real place with a fake name and slightly off coordinates is accepted, but stored as the directory has it.
  const spoofed = await saveObservation({ place: { ...LIBRARY, name: "Totally Different Building" }, latitude: LIBRARY_AT.latitude + 0.0005, longitude: LIBRARY_AT.longitude }, OWNER);
  assert.equal(spoofed.status, 201);
  const stored = (await getObservations()).body.observations.find((o: { id: string }) => o.id === spoofed.body.id);
  assert.equal(stored.place.name, "Central Library");
  assert.equal(stored.latitude, 23.8158145);
  assert.equal(stored.longitude, 86.4421811);
});

test("a report's chosen campus place is stored with the directory's name and position", async () => {
  const spoofed = await saveReport({ location: { label: "x", latitude: 23.8095, longitude: 86.443, place: { ...LIBRARY, name: "Fake Name" } } }, OWNER);
  assert.equal(spoofed.status, 201);
  const stored = (await body(await getReport(spoofed.body.id, OWNER))).body;
  assert.equal(stored.location.place.name, "Central Library");
  assert.equal(stored.location.latitude, 23.8158145);
  const outside = await saveReport({ location: { label: "Madrid", latitude: 40.4459, longitude: -3.6774 } }, OWNER);
  assert.equal(outside.status, 400);
});

// ---------------------------------------------------------------- existing workflows keep working

test("the queue workflow still works: owner queues, reviewer reviews, the report is public at once", async () => {
  const queued = await body(await draftsRoute.POST(request("/api/drafts", {
    method: "POST",
    cookie: OWNER,
    json: { ...reportBody(), consent: undefined, reviews: undefined, missedIssues: undefined, reviewerNote: undefined, timings: { analysisMs: 1000 }, source: { dataset: "web", file: "web-001.jpg" } },
  })));
  assert.equal(queued.status, 201);
  const draftId = queued.body.id as string;
  assert.equal((await body(await draftsRoute.GET(request("/api/drafts", { cookie: OWNER })))).body.knownSources.includes("web/web-001.jpg"), true);
  assert.equal((await draftImageRoute.GET(request(`/api/drafts/${draftId}/image`, { cookie: REVIEWER }), ctx(draftId))).status, 200);

  const review = reportBody({ draftId, image: undefined, source: { dataset: "web", file: "web-001.jpg" } });
  assert.equal((await body(await reportsRoute.POST(request("/api/reports", { method: "POST", json: review })))).status, 401, "a visitor cannot save queue reviews");
  const saved = await body(await reportsRoute.POST(request("/api/reports", { method: "POST", json: review, cookie: REVIEWER })));
  assert.equal(saved.status, 201);
  assert.equal(saved.body.moderation, "approved");
  assert.equal((await getReport(saved.body.id)).status, 200, "queue reviews are public at once, as before");
  assert.equal((await draftImageRoute.GET(request(`/api/drafts/${draftId}/image`, { cookie: OWNER }), ctx(draftId))).status, 404, "the photo left the queue");
});

test("status changes, deletion and the report export still work for the owner", async () => {
  const saved = await saveReport({}, OWNER);
  const id = saved.body.id as string;
  const patch = (json: unknown) => reportRoute.PATCH(request(`/api/reports/${id}`, { method: "PATCH", cookie: OWNER, json }), ctx(id));
  assert.equal((await patch({ status: "verified", note: "Checked on site" })).status, 200);
  assert.equal((await patch({ status: "resolved" })).status, 400, "a note is still required for resolved");
  const markdown = await (await reportMarkdownRoute.GET(request(`/api/reports/${id}/markdown`), ctx(id))).text();
  assert.match(markdown, /Status:\*\* Verified/);
  assert.equal((await reportRoute.DELETE(request(`/api/reports/${id}`, { method: "DELETE", cookie: OWNER }), ctx(id))).status, 204);
});
