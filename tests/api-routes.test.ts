// The API route handlers end to end, with a mocked Meta API and a temporary data folder:
// input validation, error mapping, saving reports, and that the API key never leaks.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { encodeWav } from "../lib/wav";
import { startMockMeta } from "./mock-meta";

const API_KEY = "test-key-must-never-leak";
const mock = await startMockMeta();
const dataDir = await mkdtemp(path.join(os.tmpdir(), "pathable-test-"));
Object.assign(process.env, { META_API_BASE_URL: mock.url, MODEL_API_KEY: API_KEY, DATA_DIR: dataDir });
for (const name of ["OWNER_KEY", "VERCEL", "BLOB_READ_WRITE_TOKEN", "ANALYZE_LIMIT_PER_HOUR"]) delete process.env[name];

const analyzeRoute = await import("../app/api/analyze/route");
const segmentRoute = await import("../app/api/segment/route");
const transcribeRoute = await import("../app/api/transcribe/route");
const reportsRoute = await import("../app/api/reports/route");
const reportRoute = await import("../app/api/reports/[id]/route");
const markdownRoute = await import("../app/api/reports/[id]/markdown/route");
const healthRoute = await import("../app/api/health/route");

after(async () => {
  mock.close();
  await rm(dataDir, { recursive: true, force: true });
});

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";
const post = (body: unknown, contentType = "application/json") =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" || body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body),
  });
const read = async (response: Response) => ({ status: response.status, body: await response.json() });

const modelReply = {
  scene_type: "street",
  scene_summary: "A footpath beside a road.",
  image_quality: "good",
  image_quality_notes: "",
  findings: [
    {
      category: "obstructed_footpath",
      title: "Scooter across the footpath",
      observed_condition: "An e-scooter lies across the footpath.",
      why_it_matters: "It may block wheelchair users.",
      evidence_phrase: "electric scooter",
      evidence_box: { x_min: 100, y_min: 500, x_max: 400, y_max: 900 },
      potential_impact: "high",
      confidence: "medium",
      uncertainty: "Remaining width unknown.",
      suggested_next_step: "Move the scooter.",
    },
  ],
  no_findings_reason: "",
};

test("analyze: rejects bad input before calling the model", async () => {
  const calls = mock.requests.length;
  assert.deepEqual(await read(await analyzeRoute.POST(post({}))), { status: 400, body: { error: "Missing image." } });
  assert.equal((await analyzeRoute.POST(post({ image: "data:image/gif;base64,R0lG" }))).status, 400);
  assert.equal((await analyzeRoute.POST(post({ image: "https://example.com/a.jpg" }))).status, 400);
  assert.equal((await analyzeRoute.POST(post("{not json"))).status, 400);
  assert.equal(mock.requests.length, calls, "no model call for invalid input");
});

test("analyze: refuses oversized bodies, even without a Content-Length", async () => {
  const big = new Uint8Array(13 * 1024 * 1024).fill(97);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(big);
      controller.close();
    },
  });
  const request = new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  assert.equal((await analyzeRoute.POST(request)).status, 413);
});

test("analyze: returns validated findings and maps upstream failures to clear errors", async () => {
  mock.replies.chat = { kind: "content", content: JSON.stringify(modelReply) };
  const ok = await read(await analyzeRoute.POST(post({ image: JPEG })));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.model, "muse-spark-1.3");
  assert.equal(ok.body.analysis.findings[0].located, true);

  mock.replies.chat = { kind: "status", status: 429 };
  assert.equal((await analyzeRoute.POST(post({ image: JPEG }))).status, 503);
  mock.replies.chat = { kind: "content", content: "not json" };
  assert.equal((await analyzeRoute.POST(post({ image: JPEG }))).status, 502);
  mock.replies.chat = { kind: "status", status: 401 };
  const unauthorized = await analyzeRoute.POST(post({ image: JPEG }));
  assert.equal(unauthorized.status, 502);
  assert.ok(!(await unauthorized.text()).includes(API_KEY), "errors never echo the API key");
});

test("segment: validates targets and returns evidence per finding", async () => {
  assert.equal((await segmentRoute.POST(post({ image: JPEG, width: 400, height: 300, targets: [] }))).status, 400);
  const inverted = { findingId: "f1", phrase: "car", box: { x_min: 900, y_min: 0, x_max: 100, y_max: 100 } };
  assert.equal((await segmentRoute.POST(post({ image: JPEG, width: 400, height: 300, targets: [inverted] }))).status, 400);

  mock.replies.sam.set("electric scooter", { kind: "objects", boxes: [[60, 160, 150, 260]] });
  const target = { findingId: "f1", phrase: "electric scooter", box: { x_min: 100, y_min: 500, x_max: 400, y_max: 900 } };
  const { status, body } = await read(await segmentRoute.POST(post({ image: JPEG, width: 400, height: 300, targets: [target] })));
  assert.equal(status, 200);
  assert.equal(body.evidence[0].status, "segmented");
});

test("transcribe: accepts only short mono 16-bit WAV, and biases recognition", async () => {
  const wav = (seconds: number) => new Uint8Array(encodeWav(new Float32Array(16_000 * seconds)));
  assert.equal((await transcribeRoute.POST(post("hello", "audio/wav"))).status, 400);
  assert.equal((await transcribeRoute.POST(post(wav(0.1), "audio/wav"))).status, 400, "too short");
  assert.equal((await transcribeRoute.POST(post(wav(70), "audio/wav"))).status, 413, "too long");

  mock.replies.transcribe = { kind: "json", body: { transcript: "  Curb ramp blocked.  ", audioDurationMs: 2000 } };
  const ok = await read(await transcribeRoute.POST(post(wav(2), "audio/wav")));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.text, "Curb ramp blocked.");
  const upstream = mock.requests.at(-1)!;
  assert.equal(upstream.headers.authorization, `Bearer ${API_KEY}`);
  const multipart = upstream.body.toString("latin1");
  assert.match(multipart, /"model":"muse-voice-transcribe-1.0"/);
  assert.match(multipart, /"keywords":\[[^\]]*"curb ramp"/);

  mock.replies.transcribe = { kind: "status", status: 429 };
  assert.equal((await transcribeRoute.POST(post(wav(2), "audio/wav"))).status, 503);
  mock.replies.transcribe = { kind: "status", status: 500 };
  assert.equal((await transcribeRoute.POST(post(wav(2), "audio/wav"))).status, 502);
});

const finding = { ...modelReply.findings[0], id: "f1", located: true };
const submission = (reviews: unknown, extra: Record<string, unknown> = {}) => ({
  image: JPEG,
  width: 400,
  height: 300,
  analysis: { ...modelReply, findings: [finding] },
  evidence: [
    {
      findingId: "f1",
      phrase: "electric scooter",
      status: "segmented",
      regions: [{ objectId: "0", box: { left: 60, top: 160, right: 150, bottom: 260 }, path: "M0 0L1 0L1 1Z", maskWidth: 90, maskHeight: 100 }],
      modelBox: { left: 40, top: 150, right: 160, bottom: 270 },
      note: "SAM 3.1 outlined 1 object.",
    },
  ],
  models: { analysis: "muse-spark-1.3", segmentation: "sam-3.1" },
  timings: { analysisMs: 9000, segmentationMs: 3000, reviewMs: 20000 },
  reviews,
  missedIssues: [{ category: "damaged_surface", description: "Cracked kerb edge." }],
  reviewerNote: "",
  consent: true,
  ...extra,
});

test("reports: refuses a report without the sharing confirmation", async () => {
  const reviews = { f1: { decision: "rejected" } };
  for (const consent of [undefined, false, "yes"]) {
    const response = await read(await reportsRoute.POST(post(submission(reviews, { consent }))));
    assert.deepEqual(response, { status: 400, body: { error: "Confirm the sharing statement before saving." } });
  }
});

test("reports: refuses unreviewed findings and unsafe outlines", async () => {
  const unreviewed = await read(await reportsRoute.POST(post(submission({}))));
  assert.deepEqual(unreviewed, { status: 400, body: { error: "Review every finding before saving." } });
  const noHighlight = await reportsRoute.POST(post(submission({ f1: { decision: "confirmed" } })));
  assert.equal(noHighlight.status, 400);
  const script = submission({ f1: { decision: "rejected" } });
  script.evidence[0].regions[0].path = '"/><script>alert(1)</script>';
  assert.deepEqual(await read(await reportsRoute.POST(post(script))), {
    status: 400,
    body: { error: "An evidence outline is not valid." },
  });
});

test("reports: a reviewed report is saved and can be read back as JSON and Markdown", async () => {
  const saved = await read(await reportsRoute.POST(post(submission({ f1: { decision: "confirmed", highlight: "correct" } }))));
  assert.equal(saved.status, 201);
  const id: string = saved.body.id;
  assert.deepEqual((await readdir(path.join(dataDir, "reports"))).sort(), [`${id}.jpg`, `${id}.json`]);

  const params = { params: Promise.resolve({ id }) };
  const report = await read(await reportRoute.GET(new Request("http://localhost"), params));
  assert.equal(report.body.reviews.f1.decision, "confirmed");
  assert.equal(report.body.consentedAt, report.body.createdAt, "the confirmation time is recorded");
  assert.equal(report.body.consent, undefined);
  assert.equal(report.body.missedIssues[0].category, "damaged_surface");
  const markdown = await (await markdownRoute.GET(new Request("http://localhost"), params)).text();
  assert.match(markdown, /AI description \(confirmed by reviewer\)/);
  assert.match(markdown, /Reviewer description:\*\* Cracked kerb edge\./);

  const missing = await reportRoute.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "../../etc/passwd" }) });
  assert.equal(missing.status, 404, "ids are validated, so paths cannot escape the data folder");
});

test("reports: the owner can delete a report and its photo", async () => {
  const saved = await read(await reportsRoute.POST(post(submission({ f1: { decision: "rejected" } }))));
  const id: string = saved.body.id;
  const params = { params: Promise.resolve({ id }) };
  assert.equal((await reportRoute.DELETE(new Request("http://localhost"), params)).status, 204);
  assert.equal((await reportRoute.GET(new Request("http://localhost"), params)).status, 404);
  assert.ok(!(await readdir(path.join(dataDir, "reports"))).some((f) => f.startsWith(id)), "photo removed too");
  assert.equal((await reportRoute.DELETE(new Request("http://localhost"), params)).status, 404);
  const traversal = { params: Promise.resolve({ id: "../reports" }) };
  assert.equal((await reportRoute.DELETE(new Request("http://localhost"), traversal)).status, 404);
});

test("health: reports configuration without exposing the key", async () => {
  const response = await healthRoute.GET();
  const text = await response.text();
  assert.equal(JSON.parse(text).apiKeyConfigured, true);
  assert.ok(!text.includes(API_KEY));
});
