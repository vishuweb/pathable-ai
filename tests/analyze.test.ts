// Muse Spark analysis against a mocked Meta API: request shape, response validation and fallbacks.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { RateLimitError } from "openai";
import { startMockMeta } from "./mock-meta";

const mock = await startMockMeta();
process.env.META_API_BASE_URL = mock.url;
process.env.MODEL_API_KEY = "test-key-not-real";
const { AnalysisError, analyzeImage, normalizeAnalysis } = await import("../lib/analyze");
after(mock.close);

const IMAGE = "data:image/jpeg;base64,/9j/AA==";

const goodFinding = {
  category: "obstructed_footpath",
  title: "Scooter across the footpath",
  observed_condition: "An e-scooter lies across the footpath.",
  why_it_matters: "It may block wheelchair users.",
  evidence_phrase: "electric scooter",
  evidence_box: { x_min: 100, y_min: 500, x_max: 400, y_max: 900 },
  potential_impact: "high",
  confidence: "medium",
  uncertainty: "Remaining clear width cannot be measured.",
  suggested_next_step: "Move the scooter and check the clear width.",
};

const reply = (findings: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    scene_type: "street",
    scene_summary: "A footpath beside a road.",
    image_quality: "good",
    image_quality_notes: "",
    findings,
    no_findings_reason: "",
    ...extra,
  });

test("sends the photo with a strict JSON schema and the API key, server-side", async () => {
  mock.replies.chat = { kind: "content", content: reply([goodFinding]) };
  const analysis = await analyzeImage(IMAGE);
  assert.equal(analysis.findings.length, 1);
  const request = mock.requests.at(-1)!;
  assert.equal(request.headers.authorization, "Bearer test-key-not-real");
  const body = JSON.parse(request.body.toString());
  assert.equal(body.model, "muse-spark-1.3");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.messages[1].content[1].image_url.url, IMAGE);
});

test("a well-formed finding passes through unchanged and is located", async () => {
  mock.replies.chat = { kind: "content", content: reply([goodFinding]) };
  const [finding] = (await analyzeImage(IMAGE)).findings;
  assert.equal(finding.category, "obstructed_footpath");
  assert.equal(finding.evidence_phrase, "electric scooter");
  assert.deepEqual(finding.evidence_box, goodFinding.evidence_box);
  assert.equal(finding.located, true);
  assert.match(finding.id, /^[0-9a-f-]{36}$/);
});

test("bad values fall back to safe defaults instead of failing the analysis", () => {
  const analysis = normalizeAnalysis(
    JSON.parse(
      reply([{ ...goodFinding, category: "lava", potential_impact: 7, confidence: null, title: 42 }], {
        image_quality: "superb",
      }),
    ),
  );
  const [finding] = analysis.findings;
  assert.equal(analysis.image_quality, "limited");
  assert.equal(finding.category, "other");
  assert.equal(finding.potential_impact, "medium");
  assert.equal(finding.confidence, "low", "unknown confidence never reads as high");
  assert.equal(finding.title, "");
});

test("boxes are clamped to the 0-1000 scale and their corners put in order", () => {
  const [finding] = normalizeAnalysis(
    JSON.parse(reply([{ ...goodFinding, evidence_box: { x_min: 1200, y_min: "900", x_max: -50, y_max: 100 } }])),
  ).findings;
  assert.deepEqual(finding.evidence_box, { x_min: 0, y_min: 100, x_max: 1000, y_max: 900 });
  assert.equal(finding.located, true);
});

test("a finding with no usable location is kept but marked unlocated", () => {
  const [noBox, tinyBox, noPhrase] = normalizeAnalysis(
    JSON.parse(
      reply([
        { ...goodFinding, evidence_box: null },
        { ...goodFinding, evidence_box: { x_min: 10, y_min: 10, x_max: 11, y_max: 500 } },
        { ...goodFinding, evidence_phrase: "  " },
      ]),
    ),
  ).findings;
  for (const finding of [noBox, tinyBox, noPhrase]) assert.equal(finding.located, false);
  assert.deepEqual(noBox.evidence_box, { x_min: 0, y_min: 0, x_max: 1000, y_max: 1000 });
  assert.equal(noPhrase.evidence_phrase, "obstructed footpath", "falls back to the category name");
});

test("at most 10 findings are kept, and non-object entries are skipped", () => {
  const analysis = normalizeAnalysis(JSON.parse(reply(["junk", null, ...Array(12).fill(goodFinding)])));
  assert.equal(analysis.findings.length, 10);
});

test("an empty findings list gets an explanation", () => {
  assert.equal(normalizeAnalysis(JSON.parse(reply([]))).no_findings_reason, "The model did not report any potential barriers.");
  assert.equal(
    normalizeAnalysis(JSON.parse(reply([], { no_findings_reason: "Clear, wide footpath." }))).no_findings_reason,
    "Clear, wide footpath.",
  );
});

test("malformed replies are rejected with a clear error", async () => {
  mock.replies.chat = { kind: "content", content: "not json" };
  await assert.rejects(analyzeImage(IMAGE), AnalysisError);
  mock.replies.chat = { kind: "content", content: JSON.stringify({ findings: "none" }) };
  await assert.rejects(analyzeImage(IMAGE), /did not match the expected structure/);
  mock.replies.chat = { kind: "content", content: "" };
  await assert.rejects(analyzeImage(IMAGE), /empty response/);
});

test("upstream errors surface as API errors, without retries", async () => {
  const before = mock.requests.length;
  mock.replies.chat = { kind: "status", status: 429 };
  await assert.rejects(analyzeImage(IMAGE), RateLimitError);
  assert.equal(mock.requests.length - before, 1, "no automatic retry");
});
