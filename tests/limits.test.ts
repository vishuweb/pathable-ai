// Cost protection on the routes that call the Meta API: the daily cap and the pause switch.
import assert from "node:assert/strict";
import { test } from "node:test";

// Nothing here may reach a model: every request is refused or fails validation first.
Object.assign(process.env, { META_API_BASE_URL: "http://127.0.0.1:9/v1", MODEL_API_KEY: "test-key", AI_DAILY_LIMIT: "2" });
for (const name of ["OWNER_KEY", "VERCEL", "ANALYZE_LIMIT_PER_HOUR", "AI_PAUSED"]) delete process.env[name];
const analyzeRoute = await import("../app/api/analyze/route");
const transcribeRoute = await import("../app/api/transcribe/route");

const call = () =>
  analyzeRoute.POST(new Request("http://localhost/api", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));

test("the daily cap counts every AI route together", async () => {
  assert.equal((await call()).status, 400, "allowed through to validation");
  const audio = await transcribeRoute.POST(new Request("http://localhost/api", { method: "POST", body: "x" }));
  assert.equal(audio.status, 400, "allowed through to validation");
  const capped = await call();
  assert.equal(capped.status, 429);
  assert.match((await capped.json()).error, /today's AI limit/);
});

test("AI_PAUSED=1 stops AI calls immediately", async () => {
  process.env.AI_PAUSED = "1";
  const paused = await call();
  assert.equal(paused.status, 503);
  assert.match((await paused.json()).error, /paused/);
  delete process.env.AI_PAUSED;
});
