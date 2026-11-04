import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { LOCAL_OWNER_KEY } from "../playwright.config";

// Fills the review server's throwaway data folder, so pages are reviewed with records on them as well
// as empty. Runs first by file name. Nothing here reaches any real deployment: the folder is temporary.

const LIBRARY = { osmType: "way", osmId: 517026148, name: "Central Library" };
const AT = { latitude: 23.8158145, longitude: 86.4421811 };
const finding = (id: string, category: string, title: string, observed: string) => ({
  id,
  category,
  title,
  observed_condition: observed,
  why_it_matters: "It may stop someone reaching the door.",
  evidence_phrase: "object",
  evidence_box: { x_min: 200, y_min: 300, x_max: 700, y_max: 800 },
  located: true,
  potential_impact: "high",
  confidence: "medium",
  uncertainty: "The photo cannot show the remaining width.",
  suggested_next_step: "Ask for it to be moved.",
});

test("seed the review data", async ({ page, request }) => {
  const sample = await sharp(readFileSync("public/samples/scooter-blocking-sidewalk.jpg")).resize(800).jpeg().toBuffer();
  const { width, height } = await sharp(sample).metadata();
  const image = `data:image/jpeg;base64,${sample.toString("base64")}`;

  await page.goto("/owner");
  await page.fill('input[name="key"]', LOCAL_OWNER_KEY);
  await Promise.all([page.waitForURL("**/owner"), page.click('button[type="submit"]')]);
  const owner = page.request;

  const report = (over: Record<string, unknown>) => ({
    image,
    width,
    height,
    analysis: { scene_type: "footpath", scene_summary: "A footpath beside a building entrance.", image_quality: "good", image_quality_notes: "", findings: [finding("f1", "blocked_curb_ramp", "Scooter across the ramp", "A scooter lies across the lower landing of the ramp.")], no_findings_reason: "" },
    evidence: [{ findingId: "f1", phrase: "scooter", status: "approximate", regions: [], modelBox: { left: 100, top: 100, right: 500, bottom: 400 }, note: "Approximate area only." }],
    models: { analysis: "muse-spark-1.3" },
    timings: { analysisMs: 1000, reviewMs: 2000 },
    reviews: { f1: { decision: "confirmed", highlight: "correct", note: "" } },
    missedIssues: [],
    reviewerNote: "Seen on my way to the reading room.",
    area: "steps_ramp",
    observedOn: "2026-10-30",
    location: { label: "Central Library", ...AT, place: LIBRARY },
    consent: true,
    ...over,
  });
  const post = async (url: string, data: unknown, client = owner) => {
    const res = await client.post(url, { data });
    expect(res.status(), `${url}: ${await res.text()}`).toBe(201);
    return (await res.json()) as { id: string };
  };

  // Approved at once because the owner sends them; visitors' stay pending below.
  await post("/api/reports", report({}));
  const resolved = await post("/api/reports", report({ area: "entrance", analysis: { scene_type: "entrance", scene_summary: "An entrance.", image_quality: "good", image_quality_notes: "", findings: [finding("f1", "difficult_entrance", "Bins in front of the door", "Two bins stand in front of the side door.")], no_findings_reason: "" } }));
  await owner.patch(`/api/reports/${resolved.id}`, { data: { status: "resolved", note: "Rechecked with a new photo: the door is clear." } });
  await post("/api/reports", report({ location: undefined, area: undefined }));

  const observation = (over: Record<string, unknown>) => ({ place: LIBRARY, ...AT, featureId: "ramp", finding: "present", area: "entrance", note: "", observedOn: "2026-10-28", consent: true, ...over });
  await post("/api/observations", observation({ featureId: "lift", finding: "damaged", area: "steps_ramp", note: "Out of order on Tuesday." }));
  await post("/api/observations", observation({ featureId: "lift", finding: "present", area: "steps_ramp", note: "It worked on Thursday.", observedOn: "2026-10-30" }));
  await post("/api/observations", observation({ featureId: "seating", area: "inside", note: "Benches along the corridor." }));
  await post("/api/observations", observation({ featureId: "lighting", area: "path", observedOn: "2023-02-01", note: "Lit at night." }));

  const survey = await post("/api/surveys", { place: LIBRARY, checklistId: "entrance", observedOn: "2026-11-01", sublocation: { type: "entrance", name: "East door" } });
  await owner.patch(`/api/surveys/${survey.id}`, { data: { answers: { step_free: { value: "absent", note: "Two steps at the door." }, door_width: { value: 92, unit: "cm", method: "Tape measure" } }, notes: "Checked in the morning." } });
  await owner.patch(`/api/surveys/${survey.id}`, { data: { action: "submit" } });
  await owner.patch(`/api/surveys/${survey.id}`, { data: { action: "approve" } });
  const draft = await post("/api/surveys", { place: LIBRARY, checklistId: "rest", observedOn: "2026-11-02" });
  await owner.patch(`/api/surveys/${draft.id}`, { data: { answers: { seating: { value: "present" } } } });

  // A signed-out visitor's submissions wait for approval.
  await post("/api/reports", report({ reviewerNote: "Waiting for approval." }), request);
  await post("/api/observations", observation({ featureId: "shelter", area: "path", note: "Waiting for approval." }), request);

  // The queue and approvals screens are reviewed with these in them.
  await page.goto("/owner/moderation");
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "ui-review/output/seeded-moderation-1280.png", fullPage: true });
  await page.goto(`/owner/survey/${survey.id}`);
  await page.screenshot({ path: "ui-review/output/seeded-survey-record-1280.png", fullPage: true });
  await page.goto(`/owner/survey/${draft.id}`);
  await page.screenshot({ path: "ui-review/output/seeded-survey-form-1280.png", fullPage: true });
  await page.goto(`/reports/${resolved.id}`);
  await page.screenshot({ path: "ui-review/output/seeded-report-1280.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "ui-review/output/seeded-report-390.png", fullPage: true });
});

test("the report flow's next steps, and carrying on when AI is not available", async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/report", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue to the photo" }).click();
  await page.screenshot({ path: "ui-review/output/flow-photo-1280.png", fullPage: true });
  await page.setInputFiles('input[type="file"]', "public/samples/scooter-blocking-sidewalk.jpg");
  await page.getByRole("button", { name: "Continue without AI" }).click();
  await expect(page.locator(".save-panel")).toBeVisible();
  await page.screenshot({ path: "ui-review/output/flow-manual-1280.png", fullPage: true });
});
