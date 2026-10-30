// End to end in a real browser: photo -> findings -> evidence -> human review -> consent -> saved
// report, plus the failure paths. The app runs against the mock Meta API, so nothing is billed.
// Needs Google Chrome (set CHROME_PATH if it is not in the default location). Run: npm run e2e
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { startMockMeta } from "../tests/mock-meta";

const PORT = 3123;
const OWNER_KEY = "e2e-owner-key-not-secret";
const REVIEWER_KEY = "e2e-reviewer-key-not-secret";
const BASE = `http://127.0.0.1:${PORT}`;
const PHOTO = path.resolve("public/samples/scooter-blocking-sidewalk.jpg");
const AXE = readFileSync(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p): p is string => Boolean(p && existsSync(p)));

const mock = await startMockMeta();
let server: ChildProcess | undefined;
let browser: Browser | undefined;
let dataDir = "";
let savedReportPath = "";

before(async () => {
  if (!CHROME) return;
  dataDir = await mkdtemp(path.join(os.tmpdir(), "pathable-e2e-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_DIST_DIR: ".next-e2e",
    META_API_BASE_URL: mock.url,
    NOMINATIM_URL: mock.nominatimUrl,
    OSM_API_URL: mock.osmApiUrl,
    MODEL_API_KEY: "e2e-test-key",
    DATA_DIR: dataDir,
    // With an owner key set, the browser is a visitor until it signs in, as on the public site.
    OWNER_KEY,
    REVIEWER_KEY,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const name of ["VERCEL", "BLOB_READ_WRITE_TOKEN", "AI_PAUSED", "AI_DAILY_LIMIT", "ANALYZE_LIMIT_PER_HOUR"]) delete env[name];
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
    env,
    stdio: "ignore",
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  // The dev server compiles each route on first use, which can reload an open page; compile them
  // all up front. These requests are invalid on purpose, so none reaches the (mock) model.
  const missing = "00000000-0000-4000-8000-000000000000";
  for (const route of ["/", "/report", "/reports", "/needs", "/places", "/owner", "/batch", `/reports/${missing}`]) {
    await fetch(BASE + route);
  }
  await fetch(`${BASE}/places/node/1`);
  await fetch(`${BASE}/api/places?q=warm`);
  for (const route of ["/api/analyze", "/api/segment", "/api/reports"]) await fetch(BASE + route, { method: "POST", body: "{}" });
  await fetch(`${BASE}/api/reports/${missing}/image`);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
});

after(async () => {
  await browser?.close();
  if (server?.pid) {
    // On Windows the dev server spawns children, so stop the whole tree.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
    else server.kill();
  }
  mock.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

const finding = (title: string, extra: Record<string, unknown>) => ({
  category: "obstructed_footpath",
  title,
  observed_condition: "An e-scooter lies on the footpath.",
  why_it_matters: "It may block wheelchair users.",
  evidence_phrase: "electric scooter",
  evidence_box: { x_min: 150, y_min: 350, x_max: 650, y_max: 950 },
  potential_impact: "high",
  confidence: "medium",
  uncertainty: "Remaining width unknown.",
  suggested_next_step: "Move the scooter.",
  ...extra,
});

const modelReply = (findings: unknown[]) =>
  JSON.stringify({
    scene_type: "street",
    scene_summary: "A footpath with a fallen scooter.",
    image_quality: "good",
    image_quality_notes: "",
    findings,
    no_findings_reason: "",
  });

async function analyzePhoto(): Promise<Page> {
  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  page.on("dialog", (d) => void d.accept());
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/report`, { waitUntil: "networkidle0" });
  const input = await page.$('input[type="file"]');
  await input!.uploadFile(PHOTO);
  return page;
}

async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    const axe = (window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: tags } })).violations.map((v) => v.id);
  });
}

const cardTexts = (page: Page, selector: string) =>
  page.$$eval(`.finding-card ${selector}`, (els) => els.map((e) => (e.textContent ?? "").trim()));

test("a photo becomes a reviewed, consented, saved report", { skip: !CHROME && "Chrome not found" }, async () => {
  mock.replies.chat = {
    kind: "content",
    content: modelReply([finding("Scooter on the footpath", {}), finding("Uneven surface nearby", { evidence_box: null })]),
  };
  mock.replies.sam.set("electric scooter", { kind: "relative", boxes: [[0.2, 0.4, 0.6, 0.9]] });
  const calls = mock.requests.length;
  const page = await analyzePhoto();

  await page.waitForSelector(".save-panel");
  await page.waitForFunction(() => !document.querySelector(".evidence-status.status-pending"));
  assert.ok(mock.requests.length > calls, "the app called the mock, not the real API");

  const chips = await cardTexts(page, ".chips li:first-child");
  assert.deepEqual(chips, ["Unverified AI finding", "Unverified AI finding"]);
  const evidence = await cardTexts(page, ".evidence-status");
  assert.match(evidence[0], /SAM 3.1 outlined 1 object matching "electric scooter"/);
  assert.match(evidence[1], /did not point to a specific area/);
  assert.equal(await page.$$eval(".viewer-overlay path", (p) => p.length), 1, "one outline drawn on the photo");
  const affects = await cardTexts(page, ".need-chips");
  assert.match(affects[0], /May affect:\s*Mobility\s+Vision/, "an obstructed footpath affects mobility and vision");
  assert.deepEqual(await axeViolations(page), [], "review screen passes WCAG 2.2 AA checks");

  const [scooter, surface] = await page.$$(".finding-card");
  const click = async (card: typeof scooter, xpath: string) => {
    const target = await card.waitForSelector(`xpath/${xpath}`);
    await target!.click();
  };
  await click(scooter, './/label[contains(., "Yes, real barrier")]');
  // The highlight question appears only once the finding is marked as a real barrier.
  await click(scooter, './/fieldset[legend[contains(., "Does the highlight")]]//label[normalize-space(.)="Yes"]');
  await click(surface, './/label[contains(., "Not a barrier")]');
  await page.waitForFunction(() => document.querySelector(".finding-card .chips li")?.textContent === "Confirmed by you");

  const saveDisabled = () => page.$eval(".save-actions .button-primary", (b) => (b as HTMLButtonElement).disabled);
  assert.equal(await saveDisabled(), true, "saving needs the sharing confirmation");
  await page.click(".consent input");
  assert.equal(await saveDisabled(), false);
  await page.click(".save-actions .button-primary");
  await page.waitForSelector(".save-success");

  const reportUrl = await page.$eval('.save-success a[href^="/reports/"]', (a) => a.getAttribute("href"));
  savedReportPath = reportUrl!;
  await page.goto(BASE + reportUrl, { waitUntil: "networkidle0" });
  assert.match(await page.$eval("h1", (h) => h.textContent ?? ""), /1 verified barrier/);
  assert.match(await page.$eval("#status-heading", (h) => h.textContent ?? ""), /Submitted/);
  assert.deepEqual(await axeViolations(page), [], "saved report passes WCAG 2.2 AA checks");
  await page.close();
});

test("a failed analysis shows a clear error", { skip: !CHROME && "Chrome not found" }, async () => {
  mock.replies.chat = { kind: "status", status: 500 };
  const page = await analyzePhoto();
  const error = await page.waitForSelector('.error[role="alert"]');
  assert.match(await error!.evaluate((e) => e.textContent ?? ""), /analysis service failed/);
  assert.equal(await page.$(".finding-card"), null, "no partial findings are shown");
  await page.close();
});

test("a failed segmentation keeps the findings and says so", { skip: !CHROME && "Chrome not found" }, async () => {
  mock.replies.chat = { kind: "content", content: modelReply([finding("Scooter on the footpath", { evidence_phrase: "bench" })]) };
  mock.replies.sam.set("bench", { kind: "reset" });
  const page = await analyzePhoto();
  await page.waitForSelector(".evidence-status.status-unavailable");
  const [evidence] = await cardTexts(page, ".evidence-status");
  assert.match(evidence, /Segmentation was unavailable/);
  assert.ok(await page.$(".save-panel"), "the finding can still be reviewed");
  await page.close();
});

test("my needs are saved on this device and narrow the community reports", { skip: !CHROME && "Chrome not found" }, async () => {
  assert.ok(savedReportPath, "needs the report saved by the first test");
  const page = await browser!.newPage();
  page.setDefaultNavigationTimeout(180_000);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/needs`, { waitUntil: "networkidle0" });
  const check = async (label: string) => (await page.waitForSelector(`xpath/.//label[contains(., "${label}")]`))!.click();
  await check("Tactile paving and guidance");
  await check("Visual crossing signals");
  await page.click(".needs-actions .button-primary");
  await page.waitForFunction(() => /Saved on this device: 2 needs/.test(document.querySelector('[role="status"]')?.textContent ?? ""));
  assert.deepEqual(await axeViolations(page), [], "My needs passes WCAG 2.2 AA checks");

  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelectorAll(".need-option input:checked").length === 2);

  // The saved report has a confirmed obstructed footpath: it affects mobility and vision, not hearing.
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle0" });
  const status = () => page.$eval(".list-status", (e) => e.textContent ?? "");
  const useMine = await page.waitForSelector('xpath/.//button[contains(., "Use my needs")]');
  assert.match(await useMine!.evaluate((b) => b.textContent ?? ""), /Vision, Hearing/);
  await useMine!.click();
  assert.match(await status(), /Showing 1 of 1/);
  await page.click('xpath/.//button[contains(., "Show all")]');
  await page.click('xpath/.//button[@aria-pressed="false"][normalize-space(.)="Hearing"]');
  assert.match(await status(), /Showing 0 of 1/);
  assert.ok(await page.$(".empty-state"), "explains that no report does not mean accessible");
  assert.deepEqual(await axeViolations(page), [], "filtered list passes WCAG 2.2 AA checks");

  await page.goto(`${BASE}/needs`, { waitUntil: "networkidle0" });
  await page.click('xpath/.//button[contains(., "Remove all")]');
  assert.equal(await page.evaluate(() => localStorage.getItem("pathable.needs.v1")), null, "removed from the device");
  await page.close();
});

test("a place profile shows recorded and unknown information, and takes a report", { skip: !CHROME && "Chrome not found" }, async () => {
  const place = {
    osm_type: "node",
    osm_id: 469782067,
    lat: "51.5085185",
    lon: "-0.1254071",
    name: "Charing Cross Station",
    display_name: "Charing Cross Station, Strand, London",
    category: "highway",
    type: "bus_stop",
    extratags: { wheelchair: "limited", tactile_paving: "no", public_transport: "platform", highway: "bus_stop" },
  };
  mock.replies.placeSearch = { kind: "json", body: [place] };
  mock.replies.placeLookup = { kind: "json", body: [place] };
  mock.replies.osmElement = { kind: "json", body: { elements: [{ timestamp: "2023-01-10T09:00:00Z", tags: { bench: "yes" } }] } };

  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  page.on("dialog", (d) => void d.accept());
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/places`, { waitUntil: "networkidle0" });
  await page.type('input[type="search"]', "charing cross");
  await page.click('xpath/.//button[normalize-space(.)="Search"]');
  const result = await page.waitForSelector('xpath/.//label[contains(., "Charing Cross Station")]');
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), result!.click()]);
  assert.equal(new URL(page.url()).pathname, "/places/node/469782067");

  const text = await page.$eval("main", (m) => m.innerText);
  assert.match(text, /Wheelchair access\s+Partly accessible\s+Community data, not verified/);
  assert.match(text, /Tactile paving\s+None/);
  assert.match(text, /Seating\s+Seating available/, "tags from the OpenStreetMap API are merged in");
  assert.match(text, /Ramp\s+Unknown: not recorded/, "missing information is shown as unknown");
  assert.match(text, /more than 2 years ago, so it may be out of date/);
  assert.match(text, /never rates a place as accessible overall/);
  assert.deepEqual(await axeViolations(page), [], "place profile passes WCAG 2.2 AA checks");

  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('a[href^="/report?osm=node%2F469782067"]')]);
  assert.match(await page.$eval("main", (m) => m.textContent ?? ""), /Reporting at Charing Cross Station/);

  mock.replies.chat = { kind: "content", content: modelReply([finding("Scooter on the footpath", {})]) };
  mock.replies.sam.set("electric scooter", { kind: "relative", boxes: [[0.2, 0.4, 0.6, 0.9]] });
  await (await page.$('input[type="file"]'))!.uploadFile(PHOTO);
  await page.waitForSelector(".save-panel");
  await page.waitForFunction(() => !document.querySelector(".evidence-status.status-pending"));
  assert.match(await page.$eval(".linked-place", (p) => p.textContent ?? ""), /Charing Cross Station/, "the place is pre-filled");
  await (await page.waitForSelector('xpath/.//label[contains(., "Not a barrier")]'))!.click();
  await page.click(".consent input");
  await page.click(".save-actions .button-primary");
  await page.waitForSelector(".save-success");

  await page.goto(`${BASE}/places/node/469782067`, { waitUntil: "networkidle0" });
  assert.match(await page.$eval("#nearby-title + *", (e) => e.textContent ?? ""), /At this place/);
  await page.close();
});

test("an invited reviewer can work through the queue, and nothing more", { skip: !CHROME && "Chrome not found" }, async () => {
  // A queued photo, as batch analysis would leave it.
  const draftId = "11111111-2222-4333-8444-555555555555";
  const draft = {
    id: draftId,
    createdAt: new Date().toISOString(),
    width: 1200,
    height: 1600,
    analysis: JSON.parse(modelReply([{ ...finding("Scooter on the footpath", {}), id: "q1", located: true }])),
    evidence: [],
    models: { analysis: "muse-spark-1.3" },
    timings: { analysisMs: 1000 },
    source: { dataset: "web", file: "e2e.jpg" },
  };
  await mkdir(path.join(dataDir, "drafts"), { recursive: true });
  await writeFile(path.join(dataDir, "drafts", `${draftId}.jpg`), readFileSync(PHOTO));
  await writeFile(path.join(dataDir, "drafts", `${draftId}.json`), JSON.stringify(draft));
  assert.equal((await fetch(`${BASE}/api/drafts/${draftId}/image`)).status, 403, "visitors cannot see queued photos");

  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle0" });
  await page.type('input[name="key"]', REVIEWER_KEY);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  assert.equal(new URL(page.url()).pathname, "/review", "reviewers land on the queue");
  const links = await page.$$eval('nav[aria-label="Reviewer workspace"] a', (a) => a.map((x) => x.textContent));
  assert.deepEqual(links, ["Review queue", "Results"]);

  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('a[href^="/review/"]')]);
  await page.waitForSelector(".save-panel");
  await page.waitForFunction(() => (document.querySelector(".viewer-stage img") as HTMLImageElement | null)?.naturalWidth, {
    timeout: 30_000,
  });
  await (await page.waitForSelector('xpath/.//label[contains(., "Not a barrier")]'))!.click();
  await page.click(".consent input");
  await page.click(".save-actions .button-primary");
  await page.waitForFunction(() => /Nothing is waiting|Review queue/.test(document.querySelector("main")?.textContent ?? ""));
  assert.equal((await fetch(`${BASE}/api/drafts`).then((r) => r.json())).pending, 0, "the photo left the queue");

  await page.goto(`${BASE}/batch`, { waitUntil: "networkidle0" });
  assert.match(await page.$eval("main", (m) => m.textContent ?? ""), /kept for the project owner/, "no batch analysis");
  await page.goto(BASE + savedReportPath, { waitUntil: "networkidle0" });
  const text = await page.$eval("main", (m) => m.textContent ?? "");
  assert.ok(!text.includes("Delete report") && !text.includes("Record a status change"), "no moderation");
  const status = await page.evaluate(async (url) => (await fetch(url, { method: "DELETE" })).status, `/api${savedReportPath}`);
  assert.equal(status, 403, "the server refuses deletion by a reviewer");

  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle0" });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('xpath/.//button[contains(., "Sign out")]')]);
  assert.equal((await page.cookies()).find((c) => c.name === "pathable_owner"), undefined, "signed out");
  await page.close();
});

test("visitors see the public site; the owner gets the workspace and moderation", { skip: !CHROME && "Chrome not found" }, async () => {
  assert.ok(savedReportPath, "needs the report saved by the first test");
  const visitor = await browser!.newPage();
  visitor.setDefaultNavigationTimeout(180_000);
  await visitor.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  await visitor.goto(BASE, { waitUntil: "networkidle0" });
  const nav = await visitor.$$eval('nav[aria-label="Main"] a', (links) => links.map((a) => a.textContent));
  assert.deepEqual(
    nav,
    ["Report a barrier", "Explore places", "Community reports", "My needs", "How it works"],
    "no owner tools in the public navigation",
  );
  assert.ok(await visitor.$('.hero a[href="/report"]'), "the home page leads to reporting");
  assert.deepEqual(await axeViolations(visitor), [], "home page passes WCAG 2.2 AA checks");

  await visitor.goto(`${BASE}/batch`, { waitUntil: "networkidle0" });
  assert.match(await visitor.$eval("main", (m) => m.textContent ?? ""), /kept for the project owner/);
  await visitor.goto(BASE + savedReportPath, { waitUntil: "networkidle0" });
  const visitorText = await visitor.$eval("main", (m) => m.textContent ?? "");
  assert.ok(!visitorText.includes("Delete report") && !visitorText.includes("Record a status change"), "no moderation for visitors");
  assert.match(visitorText, /Request removal or a correction/);
  await visitor.close();

  const owner = await browser!.newPage();
  owner.setDefaultNavigationTimeout(180_000);
  owner.on("dialog", (d) => void d.accept());
  await owner.goto(`${BASE}/owner`, { waitUntil: "networkidle0" });
  await owner.type('input[name="key"]', OWNER_KEY);
  await Promise.all([owner.waitForNavigation({ waitUntil: "networkidle0" }), owner.click('button[type="submit"]')]);
  assert.equal(new URL(owner.url()).pathname, "/owner");
  const workspace = await owner.$$eval('nav[aria-label="Owner workspace"] a', (links) => links.map((a) => a.textContent));
  assert.deepEqual(workspace, ["Workspace", "Batch analyze", "Review queue", "Results"]);

  await owner.goto(BASE + savedReportPath, { waitUntil: "networkidle0" });
  await owner.select(".status-form select", "under_review");
  await owner.click(".status-form button[type=submit]");
  await owner.waitForFunction(() => /Under review/.test(document.querySelector("#status-heading")?.textContent ?? ""));
  const deleteButton = await owner.waitForSelector('xpath/.//button[contains(., "Delete report")]');
  await Promise.all([owner.waitForNavigation({ waitUntil: "networkidle0" }), deleteButton!.click()]);
  assert.equal((await fetch(BASE + "/api" + savedReportPath)).status, 404, "the report is gone");
  await owner.close();
});
