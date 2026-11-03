// How AI calls are bounded: repeats are not paid for twice, running out of credit stops calls and
// says so, and every call is counted. The Meta API is a local mock.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import sharp from "sharp";
import { startMockMeta } from "./mock-meta";

const mock = await startMockMeta();
const dataDir = await mkdtemp(path.join(os.tmpdir(), "pathable-ai-"));
Object.assign(process.env, { META_API_BASE_URL: mock.url, MODEL_API_KEY: "test-key", DATA_DIR: dataDir });
for (const name of ["OWNER_KEY", "VERCEL", "BLOB_READ_WRITE_TOKEN", "ANALYZE_LIMIT_PER_HOUR", "AI_CACHE_SECONDS", "AI_PAUSED"]) delete process.env[name];

const guard = await import("../lib/ai-guard");
const analyzeRoute = await import("../app/api/analyze/route");
const segmentRoute = await import("../app/api/segment/route");
const { aiUsage } = await import("../lib/store");
after(async () => {
  mock.close();
  await rm(dataDir, { recursive: true, force: true });
});
beforeEach(() => guard.resetAiGuard());

const jpeg = async (background: string) => `data:image/jpeg;base64,${(await sharp({ create: { width: 400, height: 300, channels: 3, background } }).jpeg().toBuffer()).toString("base64")}`;
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reply = JSON.stringify({ scene_type: "street", scene_summary: "A path.", image_quality: "good", image_quality_notes: "", findings: [], no_findings_reason: "Nothing visible." });
const chatCalls = () => mock.requests.filter((r) => r.path.endsWith("/chat/completions")).length;

test("the same photo twice makes one model call; a different photo makes another", async () => {
  mock.replies.chat = { kind: "content", content: reply };
  const photo = await jpeg("#111111");
  const before = chatCalls();
  const first = await (await analyzeRoute.POST(post({ image: photo }))).json();
  const second = await (await analyzeRoute.POST(post({ image: photo }))).json();
  assert.equal(chatCalls() - before, 1);
  assert.equal(first.cached, undefined);
  assert.equal(second.cached, true);
  assert.equal(second.analysisMs, first.analysisMs, "timings stay those of the real call");
  assert.deepEqual(second.analysis, first.analysis);
  await analyzeRoute.POST(post({ image: await jpeg("#222222") }));
  assert.equal(chatCalls() - before, 2);
});

test("two simultaneous requests for the same photo share one call", async () => {
  mock.replies.chat = { kind: "content", content: reply };
  const photo = await jpeg("#333333");
  const before = chatCalls();
  const [a, b] = await Promise.all([analyzeRoute.POST(post({ image: photo })), analyzeRoute.POST(post({ image: photo }))]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(chatCalls() - before, 1);
});

test("a failure is not kept, so trying again really tries again", async () => {
  const photo = await jpeg("#444444");
  mock.replies.chat = { kind: "status", status: 500 };
  assert.equal((await analyzeRoute.POST(post({ image: photo }))).status, 502);
  mock.replies.chat = { kind: "content", content: reply };
  assert.equal((await analyzeRoute.POST(post({ image: photo }))).status, 200);
});

test("reuse can be turned off", async () => {
  process.env.AI_CACHE_SECONDS = "0";
  mock.replies.chat = { kind: "content", content: reply };
  const photo = await jpeg("#555555");
  const before = chatCalls();
  await analyzeRoute.POST(post({ image: photo }));
  await analyzeRoute.POST(post({ image: photo }));
  assert.equal(chatCalls() - before, 2);
  delete process.env.AI_CACHE_SECONDS;
});

test("running out of credit stops further calls, says so plainly and does not retry", async () => {
  mock.replies.chat = { kind: "status", status: 402 };
  const before = chatCalls();
  const refused = await analyzeRoute.POST(post({ image: await jpeg("#666666") }));
  assert.equal(refused.status, 503);
  assert.match((await refused.json()).error, /credit has run out.*Nothing was charged/);
  assert.equal(chatCalls() - before, 1, "no retry");
  assert.equal(guard.aiExhausted(), true);

  mock.replies.chat = { kind: "content", content: reply };
  const next = await analyzeRoute.POST(post({ image: await jpeg("#777777") }));
  assert.equal(next.status, 503, "later requests stop before reaching the provider");
  assert.equal(chatCalls() - before, 1);

  const segment = await segmentRoute.POST(post({ image: await jpeg("#777777"), width: 400, height: 300, targets: [{ findingId: "f1", phrase: "scooter", box: { x_min: 0, y_min: 0, x_max: 100, y_max: 100 } }] }));
  assert.equal(segment.status, 503);

  assert.equal(guard.aiExhausted(Date.now() + 2 * 60 * 60 * 1000), false, "it tries again after the pause");
});

test("only credit and billing problems count as running out", () => {
  assert.equal(guard.isCreditError({ status: 402 }), true);
  assert.equal(guard.isCreditError({ status: 429, code: "insufficient_quota" }), true);
  assert.equal(guard.isCreditError({ status: 403, error: { type: "billing_not_active" } }), true);
  assert.equal(guard.isCreditError({ status: 429, message: "Too many requests" }), false, "busy is not out of credit");
  assert.equal(guard.isCreditError({ status: 500 }), false);
  assert.equal(guard.isCreditError(undefined), false);
});

test("every model call is counted, including failures; reused results are not", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const counts = async () => (await aiUsage.list()).find((d) => d.day === day)?.models["muse-spark-1.3"] ?? { calls: 0, failures: 0 };
  const start = await counts();
  mock.replies.chat = { kind: "content", content: reply };
  const photo = await jpeg("#888888");
  await analyzeRoute.POST(post({ image: photo }));
  await analyzeRoute.POST(post({ image: photo }));
  mock.replies.chat = { kind: "status", status: 500 };
  await analyzeRoute.POST(post({ image: await jpeg("#999999") }));
  const end = await counts();
  assert.equal(end.calls - start.calls, 2);
  assert.equal(end.failures - start.failures, 1);
});

test("usage is kept with its tokens, and accounting failure never breaks a request", async () => {
  const at = new Date("2026-01-15T10:00:00Z");
  await guard.recordUsage("sam-3.1", { ok: true, promptTokens: 100, completionTokens: 20, milliseconds: 1500 }, at);
  await guard.recordUsage("sam-3.1", { ok: false, milliseconds: 500 }, at);
  const record = (await aiUsage.list()).find((d) => d.day === "2026-01-15")!;
  assert.deepEqual(record.models["sam-3.1"], { calls: 2, failures: 1, promptTokens: 100, completionTokens: 20, milliseconds: 2000 });
  const value = await guard.metered("m", async () => 7);
  assert.equal(value, 7);
});
