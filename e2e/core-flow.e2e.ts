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
    // These tests change the mock's reply for the same photo, so results must not be reused.
    AI_CACHE_SECONDS: "0",
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
  await fetch(`${BASE}/places/way/1`);
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
  // Step 1 asks where it is, and can be skipped.
  await (await page.waitForSelector('xpath/.//button[contains(., "Continue to the photo")]'))!.click();
  const input = await page.waitForSelector('input[type="file"]');
  await input!.uploadFile(PHOTO);
  return page;
}

async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    const axe = (window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: tags } })).violations.map((v) => `${v.id} at ${v.nodes.map((n) => String(n.target)).join(", ")}`);
  });
}

/** A fresh browser page signed in as the project owner. */
async function ownerPage(): Promise<Page> {
  // Its own browser context, so the owner's cookie never reaches the "visitor" pages.
  const context = await browser!.createBrowserContext();
  const owner = await context.newPage();
  owner.once("close", () => void context.close().catch(() => undefined));
  owner.setDefaultTimeout(60_000);
  owner.setDefaultNavigationTimeout(180_000);
  owner.on("dialog", (d) => void d.accept());
  await owner.setViewport({ width: 1100, height: 900 });
  await owner.goto(`${BASE}/owner`, { waitUntil: "networkidle0" });
  await owner.type('input[name="key"]', OWNER_KEY);
  await Promise.all([owner.waitForNavigation({ waitUntil: "networkidle0" }), owner.click('button[type="submit"]')]);
  return owner;
}

/** Approves everything waiting on the owner's Approvals page, and says how many items that was. */
async function approveAll(): Promise<number> {
  const owner = await ownerPage();
  await owner.goto(`${BASE}/owner/moderation`, { waitUntil: "networkidle0" });
  let approved = 0;
  for (;;) {
    const buttons = await owner.$$('xpath/.//button[contains(., "Approve")]');
    if (!buttons.length) break;
    assert.equal(await buttons[0].evaluate((b) => (b as HTMLButtonElement).disabled), true, "approval is locked until the owner says they checked");
    await owner.click(".report-item .consent input");
    await buttons[0].click();
    await owner.waitForFunction((n) => document.querySelectorAll(".report-item").length < n, {}, buttons.length);
    approved++;
  }
  await owner.close();
  return approved;
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
  const posted = page.waitForResponse((r) => r.url().endsWith("/api/reports") && r.request().method() === "POST");
  await page.click(".save-actions .button-primary");
  const { id, moderation } = (await (await posted).json()) as { id: string; moderation: string };
  assert.equal(moderation, "pending", "a visitor's report waits for approval");
  await page.waitForSelector(".save-success");
  const message = await page.$eval(".save-success", (e) => e.textContent ?? "");
  assert.match(message, /Report received.*It is not public yet/s);
  assert.equal(await page.$('.save-success a[href^="/reports/"]'), null, "no link to a page that would not open");

  savedReportPath = `/reports/${id}`;
  assert.equal((await fetch(`${BASE}/api/reports/${id}`)).status, 404, "its data is hidden");
  assert.equal((await fetch(`${BASE}/api/reports/${id}/image`)).status, 404, "its photo is hidden");
  assert.equal((await fetch(BASE + savedReportPath)).status, 404, "its page is hidden");
  const listing = await (await fetch(`${BASE}/reports`)).text();
  assert.ok(!listing.includes(`href="/reports/${id}"`), "and it is not listed");

  assert.equal(await approveAll(), 1, "the owner approves it from the Approvals page");
  assert.equal((await fetch(`${BASE}/api/reports/${id}`)).status, 200, "now public");
  await page.goto(BASE + savedReportPath, { waitUntil: "networkidle0" });
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

test("campus places: search stays on campus, the map shows the boundary, and a profile opens", { skip: !CHROME && "Chrome not found" }, async () => {
  const library = {
    osm_type: "way",
    osm_id: 517026148,
    lat: "23.8158145",
    lon: "86.4421811",
    name: "Central Library",
    display_name: "Central Library, IIT (ISM) Dhanbad, Dhanbad",
    category: "amenity",
    type: "library",
    extratags: { wheelchair: "limited" },
  };
  const madrid = { ...library, osm_id: 24489652, lat: "40.4459", lon: "-3.6774", name: "Auditorio Nacional de Musica" };
  mock.replies.placeSearch = { kind: "json", body: [madrid] };
  mock.replies.placeLookup = { kind: "json", body: [library] };
  mock.replies.osmElement = { kind: "json", body: { elements: [{ timestamp: "2023-01-10T09:00:00Z", tags: { bench: "yes" } }] } };

  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  page.on("dialog", (d) => void d.accept());
  // Tests never load real map tiles from OpenStreetMap's servers.
  await page.setRequestInterception(true);
  page.on("request", (r) => void (r.url().includes("tile.openstreetmap.org") ? r.abort() : r.continue()));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  await page.goto(`${BASE}/places`, { waitUntil: "networkidle0" });
  assert.match(await page.$eval("h1", (h) => h.textContent ?? ""), /Explore IIT \(ISM\) Dhanbad/);
  // On a phone the map is one tap away, and loads only then.
  assert.equal(await page.$(".campus-map"), null, "no map tiles are fetched until it is asked for");
  await (await page.waitForSelector('xpath/.//div[contains(@class,"view-toggle")]//button[contains(., "Map")]'))!.click();
  await page.waitForSelector(".campus-map path.leaflet-interactive");
  await (await page.waitForSelector('xpath/.//div[contains(@class,"view-toggle")]//button[contains(., "List")]'))!.click();
  const listed = await page.$$eval(".place-list li a", (a) => a.map((x) => x.textContent ?? ""));
  assert.ok(listed.length > 50, "the campus directory is listed");
  assert.equal(new Set(listed).size, listed.length, "no two entries have the same name");
  assert.ok(!listed.some((n) => /^Unnamed/.test(n)), "unnamed fragments are not listed");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling on a phone");

  const search = async (q: string) => {
    await page.$eval('form[role="search"] input', (i) => ((i as HTMLInputElement).value = ""));
    await page.type('form[role="search"] input', q);
    const before = await page.$eval(".list-status", (e) => e.textContent ?? "");
    await page.click('form[role="search"] button[type="submit"]');
    await page.waitForFunction(
      (previous) => {
        const status = document.querySelector(".list-status")?.textContent ?? "";
        return status !== previous && /found within|No matching place/.test(status);
      },
      {},
      before,
    );
    return page.$eval(".list-status", (e) => e.textContent ?? "");
  };
  assert.equal(await search("NAC Auditorium"), "No matching place found within IIT (ISM) Dhanbad campus.");
  assert.equal(await page.$(".place-list"), null, "Madrid is never shown");
  assert.match(await search("central library"), /found within IIT \(ISM\) Dhanbad/);
  assert.equal(await page.$eval(".place-list li a", (a) => a.textContent), "Central Library");
  assert.deepEqual(await axeViolations(page), [], "Explore campus passes WCAG 2.2 AA checks");
  await page.close();
});

// The four user journeys, on a real campus place (Central Library, OpenStreetMap way 517026148).
const LIBRARY_PATH = "/places/way/517026148";
const library = {
  osm_type: "way",
  osm_id: 517026148,
  lat: "23.8158145",
  lon: "86.4421811",
  name: "Central Library",
  display_name: "Central Library, IIT (ISM) Dhanbad, Dhanbad",
  category: "amenity",
  type: "library",
  extratags: { wheelchair: "limited" },
};

async function openAs(needs: string[]): Promise<Page> {
  mock.replies.placeSearch = { kind: "json", body: [] };
  mock.replies.placeLookup = { kind: "json", body: [library] };
  mock.replies.osmElement = { kind: "json", body: { elements: [{ timestamp: "2023-01-10T09:00:00Z", tags: { bench: "yes" } }] } };
  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  page.on("dialog", (d) => void d.accept());
  await page.setRequestInterception(true);
  page.on("request", (r) => void (r.url().includes("tile.openstreetmap.org") ? r.abort() : r.continue()));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  for (const need of needs) {
    await (await page.waitForSelector(`xpath/.//div[contains(@class,"need-group-chips")]//button[contains(., "${need}")]`))!.click();
  }
  await page.waitForFunction((n) => document.querySelectorAll(".need-group-chips [aria-pressed=true]").length === n, {}, needs.length);
  return page;
}

async function openLibraryFromHome(page: Page): Promise<string> {
  // The home page search leads to the place, as a visitor would do it.
  await page.type("#destination", "Central Library");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('.destination-search button[type="submit"]')]);
  assert.equal(new URL(page.url()).pathname, "/places");
  await page.waitForFunction(() => /found within/.test(document.querySelector(".list-status")?.textContent ?? ""));
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".place-list li a")]);
  assert.equal(new URL(page.url()).pathname, LIBRARY_PATH);
  return page.$eval("main", (m) => (m as HTMLElement).innerText);
}

const section = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to));

test("journey 1, mobility: step-free, ramp, lift, entrance and toilet information, with unknowns named", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await openAs(["Mobility"]);
  const text = await openLibraryFromHome(page);
  const overview = section(text, "Your accessibility overview", "Reported barriers");
  assert.match(overview, /For your needs: Mobility/);
  assert.match(overview, /Wheelchair access\s+Recorded in OpenStreetMap · Outdated\s+Recorded in OpenStreetMap · Outdated: Partly accessible/, "recorded, with its source and a stale warning");
  assert.match(overview, /Last seen more than two years ago\. It may have changed; it is shown as recorded\./, "and says plainly that it was kept, not dropped");
  for (const unknown of ["Steps at the entrance or way in", "Ramp", "Lift", "Wheelchair-accessible toilet", "Accessible parking or drop-off"]) {
    assert.match(overview, new RegExp(`${unknown}\\s+Unknown\\s+Add what you saw`), `${unknown} is unknown`);
  }
  assert.match(overview, /1 of 11 details for your needs are recorded; 10 are unknown\./);
  assert.ok(!/Tactile paving|Hearing loop/.test(overview), "other needs do not crowd the overview");
  assert.match(text, /never called accessible because some details are\s+recorded/);
  const unknown = section(text, "What is still unknown", "Community contributions");
  assert.match(unknown, /could matter to your visit/);
  assert.match(unknown, /Ramp/);
  assert.deepEqual(await axeViolations(page), [], "profile passes WCAG 2.2 AA checks");
  await page.close();
});

test("journey 2, visual: tactile, obstacle, lighting and wayfinding information, with unknowns named", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await openAs(["Visual"]);
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  const overview = section(await page.$eval("main", (m) => (m as HTMLElement).innerText), "Your accessibility overview", "What is known");
  assert.match(overview, /For your needs: Vision/);
  for (const label of ["Tactile paving", "Obstacles a cane may miss on the way in", "Lighting", "High-contrast or audio guidance signs"]) {
    assert.match(overview, new RegExp(`${label}\\s+Unknown`), `${label} is unknown, not assumed`);
  }
  assert.ok(!/Wheelchair access|Hearing loop/.test(overview), "only visual details lead");
  await page.close();
});

test("journey 3, hearing: visual alerts and communication facilities, with no assumptions", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await openAs(["Hearing"]);
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  const text = await page.$eval("main", (m) => (m as HTMLElement).innerText);
  const overview = section(text, "Your accessibility overview", "What is known");
  assert.match(overview, /For your needs: Hearing/);
  assert.match(overview, /Visual emergency alarms and written notices\s+Unknown/);
  assert.match(overview, /Hearing loop\s+Unknown/);
  assert.match(overview, /0 of \d+ details for your needs are recorded/);
  assert.ok(!/photo/i.test(overview), "nothing here is inferred from a photograph");
  await page.close();
});

test("journey, wayfinding: simple directions, signs and landmarks come first, with no assumptions", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await openAs(["Wayfinding"]);
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  const overview = section(await page.$eval("main", (m) => (m as HTMLElement).innerText), "Your accessibility overview", "Reported barriers");
  assert.match(overview, /For your needs: Cognitive/);
  assert.match(overview, /Clear signs and directions\s+Unknown/);
  assert.match(overview, /Recognisable landmarks and a simple way in\s+Unknown/);
  assert.ok(!/Wheelchair access|Hearing loop|Tactile paving/.test(overview), "other needs do not crowd it");
  const all = await page.$eval("main", (m) => (m as HTMLElement).innerText);
  assert.match(all, /Wheelchair access/, "but they are still on the page");
  assert.deepEqual(await axeViolations(page), [], "passes WCAG 2.2 AA checks");
  await page.close();
});

test("journey 4, contribution: observe a feature, report a barrier at the place, and follow it", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await openAs(["Mobility"]);
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });

  // Start from an unknown: "Add what you saw: Ramp" jumps to the form with Ramp chosen.
  await (await page.waitForSelector('xpath/.//ul[contains(@class,"features")]//li[.//strong[normalize-space(.)="Ramp"]]//button'))!.click();
  assert.equal(await page.$eval(".observation-form select", (s) => (s as HTMLSelectElement).value), "ramp");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "contribute-heading", "focus moves to the form");

  await (await page.waitForSelector('xpath/.//label[contains(., "There, but blocked")]'))!.click();
  await page.type(".observation-form textarea", "A bike rack stands in front of the ramp.");
  const submit = await page.waitForSelector('xpath/.//button[contains(., "Share observation publicly")]');
  assert.equal(await submit!.evaluate((b) => (b as HTMLButtonElement).disabled), true, "needs the sharing confirmation");
  await page.click(".observation-form .consent input");
  await submit!.click();
  await page.waitForFunction(() => /Thank you/.test(document.querySelector(".observation-form p[role=status]")?.textContent ?? ""));
  assert.match(await page.$eval(".observation-form p[role=status]", (e) => e.textContent ?? ""), /waiting for the project owner's approval/);
  await new Promise((r) => setTimeout(r, 1000));
  assert.ok(!/Community reported/.test(await page.$eval(".features", (e) => e.textContent ?? "")), "not shown while pending");
  assert.equal(await approveAll(), 1, "the owner approves the observation");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => /Community reported/.test(document.querySelector(".features")?.textContent ?? ""));
  const overview = await page.$eval(".overview", (o) => (o as HTMLElement).innerText);
  assert.match(overview, /Ramp\s+Community reported\s+Community reported: There, but blocked · An entrance · last seen \d{4}-\d{2}-\d{2}/);
  assert.match(overview, /Applies to one entrance, not to every entrance at this place\./, "a local finding says how far it reaches");
  const known = await page.$eval("#known-title", (h) => (h.parentElement as HTMLElement).innerText);
  assert.match(known, /Community reported: There, but blocked.*“A bike rack stands in front of the ramp\.”/s);

  // Report a barrier with a photo, pre-filled with this place.
  mock.replies.chat = { kind: "content", content: modelReply([finding("Bike rack blocks the ramp", {})]) };
  mock.replies.sam.set("electric scooter", { kind: "relative", boxes: [[0.2, 0.4, 0.6, 0.9]] });
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('header a[href^="/report?osm=way%2F517026148"]')]);
  assert.match(await page.$eval("main", (m) => m.textContent ?? ""), /Reporting at Central Library/);
  await (await page.$('input[type="file"]'))!.uploadFile(PHOTO);
  await page.waitForSelector(".save-panel");
  await page.waitForFunction(() => !document.querySelector(".evidence-status.status-pending"));
  await (await page.waitForSelector('xpath/.//label[contains(., "Yes, real barrier")]'))!.click();
  await (await page.waitForSelector('xpath/.//fieldset[legend[contains(., "Does the highlight")]]//label[normalize-space(.)="Yes"]'))!.click();
  await page.select('xpath/.//label[contains(., "Which part of the place")]//select', "steps_ramp");
  await page.click(".consent input");
  const posted = page.waitForResponse((r) => r.url().endsWith("/api/reports") && r.request().method() === "POST");
  await page.click(".save-actions .button-primary");
  const { id: reportId } = (await (await posted).json()) as { id: string };
  await page.waitForSelector(".save-success");
  const reportPath = `/reports/${reportId}`;

  // Pending: not on the place page or in the community list until the owner approves it.
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  assert.match(await page.$eval("#reports-title", (h) => (h.parentElement as HTMLElement).innerText), /No barrier has been reported/);
  assert.equal(await approveAll(), 1, "the owner approves the report");

  // It now shows on the place page, with its status, and in the community list with its location.
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  const reports = await page.$eval("#reports-title", (h) => (h.parentElement as HTMLElement).innerText);
  assert.match(reports, /Reported \d{4}-\d{2}-\d{2}/);
  assert.match(reports, /Steps, a ramp or a lift/);
  assert.match(reports, /Applies to one set of steps, one ramp or one lift, not to every ramp or lift at this place\./);
  assert.match(reports, /Status:\s*Submitted/);
  assert.match(reports, /Confirmed by the person who reported it\. Nobody else has checked it yet\./);
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle0" });
  const list = await page.$eval(".report-list", (l) => (l as HTMLElement).innerText);
  assert.match(list, /At Central Library/);
  assert.match(list, /Steps, a ramp or a lift/);
  await page.goto(BASE + reportPath!, { waitUntil: "networkidle0" });
  const detail = await page.$eval("main", (m) => (m as HTMLElement).innerText);
  assert.match(detail, /Affected area\s+Steps, a ramp or a lift/);
  assert.match(detail, /Status: Submitted/);
  assert.deepEqual(await axeViolations(page), [], "report passes WCAG 2.2 AA checks");
  await page.close();
});

test("journey 5, conflict and verification: disagreeing observations are both shown, and verification needs a reason", { skip: !CHROME && "Chrome not found" }, async () => {
  const send = async (change: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place: { osmType: "way", osmId: 517026148, name: "Central Library" },
        latitude: 23.8158145,
        longitude: 86.4421811,
        featureId: "lift",
        area: "steps_ramp",
        note: "",
        consent: true,
        ...change,
      }),
    });
    assert.equal(res.status, 201);
    return ((await res.json()) as { id: string }).id;
  };
  const broken = await send({ finding: "damaged", observedOn: "2026-10-28", note: "Out of order on Tuesday" });
  await send({ finding: "present", observedOn: "2026-10-30", note: "I used it on Thursday" });

  // Pending: the profile knows nothing about either.
  const open = async (needs: string[] = ["Mobility"]) => {
    const page = await openAs(needs);
    await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
    return page;
  };
  let page = await open();
  assert.ok(!(await page.$eval("main", (m) => (m as HTMLElement).innerText)).includes("Out of order on Tuesday"));
  await page.close();

  assert.equal(await approveAll(), 2, "the owner approves both");

  // Verification needs a recorded reason, and a visitor cannot do it.
  const owner = await ownerPage();
  const verify = (note: string) =>
    owner.evaluate(
      async (id, text) =>
        (await fetch(`/api/observations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "verified", note: text }) })).status,
      broken,
      note,
    );
  assert.equal(
    (await fetch(`${BASE}/api/observations/${broken}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "verified", note: "me" }) })).status,
    401,
  );
  assert.equal(await verify(""), 400, "no reason, no verification");
  assert.equal(await verify("Site visit 31 Oct 2026: lift out of order, sign on the door"), 200);
  await owner.close();

  page = await open();
  const lift = await page.$eval("main", (m) => (m as HTMLElement).innerText);
  assert.match(lift, /Records disagree/, "the disagreement is stated");
  assert.match(lift, /none has been chosen as correct/);
  assert.match(lift, /There, but damaged or not working · Steps, a ramp or a lift/, "one account is kept");
  assert.match(lift, /Present and usable · Steps, a ramp or a lift/, "and so is the other");
  assert.match(lift, /Independently verified: There, but damaged/);
  assert.match(lift, /Checked: Site visit 31 Oct 2026/);
  assert.match(lift, /One of them is independently verified; the others are still shown\./);
  assert.match(lift, /Community reported: Present and usable/, "the unverified one is not upgraded");
  assert.match(lift, /Independently verified\s+1/, "one detail is verified, no more");
  assert.deepEqual(await axeViolations(page), [], "a profile with a conflict passes WCAG 2.2 AA checks");

  // "It has changed since" settles the disagreement without deleting either record.
  await (await page.waitForSelector('xpath/.//li[contains(@class,"claim")][contains(., "Present and usable")]//button[contains(., "It has changed since")]'))!.click();
  assert.match(await page.$eval(".response-banner", (e) => e.textContent ?? ""), /It has changed since\./);
  await (await page.waitForSelector('xpath/.//label[contains(., "There, but blocked")]'))!.click();
  await page.click(".observation-form .consent input");
  await (await page.waitForSelector('xpath/.//button[contains(., "Share observation publicly")]'))!.click();
  await page.waitForFunction(() => /Thank you/.test(document.querySelector(".observation-form p[role=status]")?.textContent ?? ""));
  assert.equal(await approveAll(), 1, "the update waits for approval like anything else");
  await page.reload({ waitUntil: "networkidle0" });
  const after = await page.$eval("main", (m) => (m as HTMLElement).innerText);
  assert.match(after, /Earlier records that were updated \(1\)/, "the old claim moved to the history, not away");
  await page.close();
});

test("contributor: the exact position stays apart from the place's, and the result reaches the right profile", { skip: !CHROME && "Chrome not found" }, async () => {
  await browser!.defaultBrowserContext().overridePermissions(BASE, ["geolocation"]);
  const page = await openAs(["Comfort"]);
  const spot = { latitude: 23.815215, longitude: 86.441781 };
  await page.setGeolocation({ ...spot, accuracy: 9 });
  await page.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  await page.click(".contribute-form summary");
  await page.select(".observation-form select", "shelter");
  await (await page.waitForSelector('xpath/.//button[contains(., "Add my exact position")]'))!.click();
  await page.waitForFunction(() => /saved with this, separately from the place/.test(document.querySelector(".observation-form")?.textContent ?? ""));
  await page.type(".observation-form textarea", "A covered waiting area by the side door.");
  await page.click(".observation-form .consent input");
  await (await page.waitForSelector('xpath/.//button[contains(., "Share observation publicly")]'))!.click();
  await page.waitForFunction(() => /Thank you/.test(document.querySelector(".observation-form p[role=status]")?.textContent ?? ""));
  assert.equal(await approveAll(), 1);

  const listed = (await (await fetch(`${BASE}/api/observations?osmType=way&osmId=517026148`)).json()) as { observations: { featureId: string; latitude: number; observationCoordinates?: { latitude: number; accuracyM?: number } }[] };
  const stored = listed.observations.find((o) => o.featureId === "shelter")!;
  assert.equal(stored.latitude, 23.8158145, "the place's own position");
  assert.equal(stored.observationCoordinates?.latitude, spot.latitude, "and the exact spot, separately");
  assert.equal(stored.observationCoordinates?.accuracyM, 9);
  await page.reload({ waitUntil: "networkidle0" });
  assert.match(await page.$eval(".overview", (o) => (o as HTMLElement).innerText), /Shelter from the weather\s+Community reported/);
  await browser!.defaultBrowserContext().clearPermissionOverrides();
  await page.close();
});

test("discovery: filters use real records, and empty results do not read as good news", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await openAs([]);
  await page.goto(`${BASE}/places`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".place-list");
  const showSelect = 'xpath/.//label[contains(., "Show")]//select';
  const choose = async (value: string) => {
    await page.select(showSelect, value);
    await new Promise((r) => setTimeout(r, 500));
    return page.$$eval(".place-list li a", (a) => a.map((x) => x.textContent ?? ""));
  };
  const all = await page.$$eval(".place-list li a", (a) => a.length);
  const barriers = await choose("barriers");
  assert.deepEqual(barriers, ["Central Library"], "the only place with an approved linked report");
  assert.match(await page.$eval(".place-list li", (l) => (l as HTMLElement).innerText), /open barrier report/);
  const recorded = await choose("recorded");
  assert.ok(recorded.includes("Central Library"));
  const gaps = await choose("gaps");
  assert.equal(gaps.length + recorded.length, all, "every place is in exactly one of the two");
  assert.ok(!gaps.some((name) => recorded.includes(name)));
  assert.deepEqual(await choose("checked"), [], "no survey has been published yet");
  assert.match(await page.$eval(".explorer .empty-state", (e) => e.textContent ?? ""), /not that there is nothing to find/);

  // "Fill a gap" on the home page goes straight to the gaps.
  await page.goto(BASE, { waitUntil: "networkidle0" });
  assert.ok(await page.waitForSelector('.info-card a[href="/places?show=gaps"]'));
  assert.ok(!(await page.$eval("main", (m) => m.textContent ?? "")).includes("Popular places"), "no claim of popularity without data");

  const missing = await page.goto(`${BASE}/no-such-page`, { waitUntil: "domcontentloaded" });
  assert.equal(missing?.status(), 404);
  assert.match(await page.$eval("h1", (h) => h.textContent ?? ""), /could not find that page/);
  await page.close();
});

test("report without AI: if the AI fails, a person can still report, and nothing claims to come from AI", { skip: !CHROME && "Chrome not found" }, async () => {
  mock.replies.chat = { kind: "status", status: 500 };
  const page = await analyzePhoto();
  await page.waitForSelector('.error[role="alert"]');
  await (await page.waitForSelector('xpath/.//button[contains(., "Continue without AI")]'))!.click();
  await page.waitForSelector(".save-panel");
  assert.match(await page.$eval("main", (m) => m.textContent ?? ""), /nothing here came from AI/);
  await page.click(".consent input");
  const share = await page.waitForSelector(".save-actions .button-primary");
  assert.equal(await share!.evaluate((b) => (b as HTMLButtonElement).disabled), true, "needs a barrier described by the person");
  await page.close();
});

test("demo: real interactions on sample data, clearly labelled, and nothing reaches the server or real records", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  await page.setViewport({ width: 360, height: 760, isMobile: true, hasTouch: true });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes.push(r.url());
  });
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle0" });
  assert.equal((await page.$$('a[href^="/demo/"]')).length, 4, "four scenarios");
  assert.deepEqual(await axeViolations(page), [], "the demo list passes WCAG 2.2 AA checks");
  const NOTICE = "Illustrative demo — not verified campus data.";
  for (const id of ["mobility", "visual", "hearing", "wayfinding"]) {
    await page.goto(`${BASE}/demo/${id}`, { waitUntil: "networkidle0" });
    assert.ok((await page.$eval(".demo-banner", (e) => e.textContent ?? "")).includes(NOTICE), `${id} is labelled`);
    assert.ok(await page.$('.demo-banner a[href="/places"]'), "with a way out");
  }

  await page.goto(`${BASE}/demo/mobility`, { waitUntil: "networkidle0" });
  const press = async (text: string) => (await page.waitForSelector(`xpath/.//button[contains(., "${text}")]`))!.click();
  await page.type('input[type="search"]', "Sample Library");
  await press("Sample Library");
  await page.waitForSelector("#demo-profile");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling at 360px");
  assert.deepEqual(await axeViolations(page), [], "the demo profile passes WCAG 2.2 AA checks");
  await press("See the sample evidence");
  await page.waitForSelector("#demo-ai");
  const buttons = await page.$$('xpath/.//div[contains(@class,"flow-actions")]//button[contains(., "Confirm")]');
  await buttons[0].click();
  const rejects = await page.$$('xpath/.//div[contains(@class,"flow-actions")]//button[contains(., "Reject")]');
  await rejects[1].click();
  await page.waitForFunction(() => /Confirmed by reporter/.test(document.querySelector(".demo-candidates")?.textContent ?? ""));
  await press("See what happens next");
  await page.waitForSelector("#demo-verify");
  assert.match(await page.$eval("#demo-verify ~ .empty-state", (e) => e.textContent ?? ""), /has not been shown to have no barriers/, "not on the place until approved");
  await press("Approve this sample");
  await page.waitForFunction(() => /Confirmed by reporter/.test(document.querySelector(".demo-features")?.textContent ?? ""));
  await press("Record a sample check");
  await page.waitForFunction(() => /Independently verified/.test(document.querySelector(".demo-features")?.textContent ?? ""));
  await press("Add what you saw");
  await page.waitForSelector("#demo-contribute");
  await press("Add to this demo");
  await page.waitForFunction(() => /Added to this demo only/.test(document.querySelector("#demo-contribute")?.parentElement?.textContent ?? ""));
  assert.deepEqual(writes, [], "nothing was sent");

  // Nothing from the demo is in real data.
  const reports = await (await fetch(`${BASE}/reports`)).text();
  const places = await (await fetch(`${BASE}/places`)).text();
  assert.ok(!reports.includes("Sample Library") && !places.includes("Sample Library"));
  assert.equal((await fetch(`${BASE}/demo/nothing`)).status, 404);
  await page.close();
});

test("responsive: the main pages fit from 360px to a large screen, with no accessibility violations", { skip: !CHROME && "Chrome not found" }, async () => {
  const page = await browser!.newPage();
  page.setDefaultNavigationTimeout(180_000);
  await page.setRequestInterception(true);
  page.on("request", (r) => void (r.url().includes("tile.openstreetmap.org") ? r.abort() : r.continue()));
  mock.replies.placeLookup = { kind: "json", body: [library] };
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewport({ width, height: 900 });
    for (const path of ["/", "/places", LIBRARY_PATH, "/reports", "/needs", "/report", "/privacy"]) {
      await page.goto(BASE + path, { waitUntil: "networkidle0" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} fits at ${width}px`);
      if (width === 360 || width === 1440) assert.deepEqual(await axeViolations(page), [], `${path} at ${width}px`);
    }
  }
  // The phone menu is a real dialog: it opens, moves focus and closes with Escape.
  await page.setViewport({ width: 360, height: 760 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await (await page.waitForSelector('xpath/.//button[contains(., "Open the menu")]'))!.click();
  await page.waitForSelector("dialog[open] .drawer-nav a");
  assert.equal(await page.$$eval("dialog[open] .drawer-nav a", (a) => a.length), 6);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.close();
});

test("field survey, scenarios A to F: draft, resume, spot scope, review, public page and coverage", { skip: !CHROME && "Chrome not found" }, async () => {
  const owner = await ownerPage();
  await owner.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  // A: the owner starts a building survey of Central Library and records one real line, with a photo.
  await owner.goto(`${BASE}/owner/survey`, { waitUntil: "networkidle0" });
  assert.deepEqual(await axeViolations(owner), [], "the surveys page passes WCAG 2.2 AA checks");
  await owner.select(".survey-start select", "way/517026148");
  await Promise.all([owner.waitForNavigation({ waitUntil: "networkidle0" }), owner.click('.survey-start button[type="submit"]')]);
  assert.match(new URL(owner.url()).pathname, /^\/owner\/survey\/[0-9a-f-]{36}$/);
  await owner.select("#attr-step_free", "partial");
  await owner.type('fieldset:has(#attr-step_free) input[type="text"]', "Only the east door");

  // C: saved half done, and still there on coming back.
  await (await owner.waitForSelector('xpath/.//button[normalize-space(.)="Save draft"]'))!.click();
  await owner.waitForFunction(() => /Saved\. You can come back/.test(document.querySelector(".survey")?.textContent ?? ""));
  await owner.reload({ waitUntil: "networkidle0" });
  assert.equal(await owner.$eval("#attr-step_free", (e) => (e as HTMLSelectElement).value), "partial");
  assert.match(await owner.$eval(".survey-progress", (e) => e.textContent ?? ""), /1 of 6 lines assessed/);
  assert.deepEqual(await axeViolations(owner), [], "the survey form passes WCAG 2.2 AA checks");
  assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling on a phone");

  await (await owner.$('.survey input[type="file"]'))!.uploadFile(PHOTO);
  await owner.waitForFunction(() => /Photo added/.test(document.querySelector(".survey")?.textContent ?? ""));
  mock.replies.chat = { kind: "content", content: modelReply([finding("Bins beside the door", {})]) };
  await (await owner.waitForSelector('xpath/.//button[contains(., "Ask the AI what to look at")]'))!.click();
  await owner.waitForFunction(() => /Suggested by AI, not checked by anyone/.test(document.querySelector(".survey")?.textContent ?? ""));
  assert.match(await owner.$eval(".survey", (e) => e.textContent ?? ""), /Bins beside the door/);
  assert.match(await owner.$eval(".survey-progress", (e) => e.textContent ?? ""), /1 of 6 lines assessed/, "a suggestion fills in nothing");
  await owner.waitForSelector(".survey-evidence input");
  await owner.click(".survey-evidence input");
  await (await owner.waitForSelector('xpath/.//button[normalize-space(.)="Submit for review"]'))!.click();
  await owner.waitForFunction(() => /Waiting for review/.test(document.querySelector(".survey")?.textContent ?? ""));
  const buildingId = new URL(owner.url()).pathname.split("/").pop()!;

  // Not public while it waits.
  assert.equal(((await (await fetch(`${BASE}/api/surveys/${buildingId}`)).status)), 401);
  mock.replies.placeLookup = { kind: "json", body: [library] };
  assert.ok(!(await (await fetch(BASE + LIBRARY_PATH)).text()).includes("Only the east door"));

  // B: a specific entrance, recorded without speaking for the whole building.
  const entrance = await owner.evaluate(async () => {
    const post = (url: string, method: string, json: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
    const created = (await (await post("/api/surveys", "POST", { place: { osmType: "way", osmId: 517026148 }, checklistId: "entrance", observedOn: "2026-11-02", sublocation: { type: "entrance", name: "East door (test fixture)" } })).json()) as { id: string };
    await post(`/api/surveys/${created.id}`, "PATCH", { answers: { kept_clear: { value: "obstructed", note: "Bicycles at the door" } } });
    await post(`/api/surveys/${created.id}`, "PATCH", { action: "submit" });
    return created.id;
  });

  // D: an authorized reviewer examines each one, with its evidence, before it becomes public.
  const context = await browser!.createBrowserContext();
  const reviewer = await context.newPage();
  reviewer.setDefaultNavigationTimeout(180_000);
  await reviewer.goto(`${BASE}/owner`, { waitUntil: "networkidle0" });
  await reviewer.type('input[name="key"]', REVIEWER_KEY);
  await Promise.all([reviewer.waitForNavigation({ waitUntil: "networkidle0" }), reviewer.click('button[type="submit"]')]);
  await reviewer.goto(`${BASE}/owner/survey/${buildingId}`, { waitUntil: "networkidle0" });
  const review = await reviewer.$eval(".survey", (e) => (e as HTMLElement).innerText);
  assert.match(review, /Only the east door/);
  assert.match(review, /1 photo\(s\) cited/);
  assert.match(review, /does not verify it/);
  assert.equal(await reviewer.$('.survey input[type="file"]'), null, "reviewers do not edit");
  await (await reviewer.waitForSelector('xpath/.//button[normalize-space(.)="Approve for public use"]'))!.click();
  await reviewer.waitForFunction(() => /Approved\. It is now on the public/.test(document.querySelector(".survey")?.textContent ?? ""));
  await reviewer.goto(`${BASE}/owner/survey/${entrance}`, { waitUntil: "networkidle0" });
  await reviewer.type(".profile-section input", "Went there on 2 Nov");
  await (await reviewer.waitForSelector('xpath/.//button[normalize-space(.)="Record an independent check"]'))!.click();
  await reviewer.waitForFunction(() => /Your check was recorded/.test(document.querySelector(".survey")?.textContent ?? ""));
  await (await reviewer.waitForSelector('xpath/.//button[normalize-space(.)="Approve for public use"]'))!.click();
  await reviewer.waitForFunction(() => /Approved\. It is now on the public/.test(document.querySelector(".survey")?.textContent ?? ""));
  await context.close();

  // E: a visitor sees what was checked, its source and date, and what was not, with their own needs first.
  const visitor = await openAs(["Mobility"]);
  await visitor.goto(BASE + LIBRARY_PATH, { waitUntil: "networkidle0" });
  const checked = await visitor.$eval("#surveyed-title", (h) => (h.parentElement as HTMLElement).innerText);
  assert.match(checked, /Building accessibility: The whole place/);
  assert.match(checked, /Recorded by the project team/, "published, but not called verified");
  assert.match(checked, /Step-free way in \(at least one\): Partly available/);
  assert.match(checked, /Not checked on this survey: .*Lift/s, "what was not assessed is named");
  assert.match(checked, /Entrance accessibility: Entrance: East door \(test fixture\)/);
  assert.match(checked, /Independently verified/, "the checked one says so");
  assert.match(checked, /Checked: Went there on 2 Nov/);
  const overview = await visitor.$eval(".overview", (o) => (o as HTMLElement).innerText);
  assert.match(overview, /Recorded for the place as a whole\. Individual entrances and rooms may differ\./);
  assert.match(overview, /Lift\s+Community reported|Lift\s+Independently verified|Lift\s+Unknown/, "lift is unaffected by the building survey");
  assert.deepEqual(await axeViolations(visitor), [], "a surveyed profile passes WCAG 2.2 AA checks");
  await visitor.close();

  // F: coverage shows what is and is not surveyed, without reading gaps as good news.
  await owner.goto(`${BASE}/owner/coverage`, { waitUntil: "networkidle0" });
  const coverage = await owner.$eval("main", (m) => (m as HTMLElement).innerText);
  assert.match(coverage, /Directory coverage\s+\d+/);
  assert.match(coverage, /Survey coverage\s+1\b/);
  assert.match(coverage, /nothing here says any place is accessible/);
  assert.match(coverage, /Surveyed entrances\s+1\b/);
  assert.match(coverage, /Being low on this list does not mean a place is fine/);
  assert.match(coverage, /No published survey yet/, "unsurveyed places are named as such");
  assert.deepEqual(await axeViolations(owner), [], "the coverage page passes WCAG 2.2 AA checks");
  assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling on a phone");

  // The public export holds the approved records and no private field.
  const exported = await (await fetch(`${BASE}/api/survey-data?scope=public&format=csv`)).text();
  assert.ok(exported.includes(buildingId));
  assert.ok(!/private_notes/.test(exported));
  assert.equal((await fetch(`${BASE}/api/survey-data?scope=full`)).status, 401);
  await owner.close();
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
  assert.equal((await fetch(`${BASE}/api/drafts/${draftId}/image`)).status, 401, "visitors cannot see queued photos");
  assert.equal((await fetch(`${BASE}/api/drafts`)).status, 401, "or the queue summary");

  const page = await browser!.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle0" });
  await page.type('input[name="key"]', REVIEWER_KEY);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  assert.equal(new URL(page.url()).pathname, "/review", "reviewers land on the queue");
  const links = await page.$$eval('nav[aria-label="Reviewer workspace"] a', (a) => a.map((x) => x.textContent));
  assert.deepEqual(links, ["Review queue", "Surveys", "AI evaluation"]);

  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('a[href^="/review/"]')]);
  await page.waitForSelector(".save-panel");
  await page.waitForFunction(() => (document.querySelector(".viewer-stage img") as HTMLImageElement | null)?.naturalWidth, {
    timeout: 30_000,
  });
  await (await page.waitForSelector('xpath/.//label[contains(., "Not a barrier")]'))!.click();
  await page.click(".consent input");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/reports") && r.request().method() === "POST");
  await page.click(".save-actions .button-primary");
  assert.equal((await saved).status(), 201, "the reviewer's report is saved");
  await page.goto(`${BASE}/review`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Nothing is waiting/.test(document.querySelector("main")?.textContent ?? ""));
  assert.match(await page.$eval("main", (m) => m.textContent ?? ""), /Nothing is waiting for review/, "the photo left the queue");

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
    ["Explore campus", "Community reports", "My needs", "See a demo", "Report a barrier"],
    "no owner tools in the public navigation",
  );
  assert.ok(await visitor.$('.action-grid a[href="/report"]'), "the home page leads to reporting");
  assert.ok(await visitor.$('.action-grid a[href="/places"]'), "the home page leads to checking a place");
  assert.equal(await visitor.$eval("h1", (h) => h.textContent), "Explore your campus with confidence.");
  assert.deepEqual(await axeViolations(visitor), [], "home page passes WCAG 2.2 AA checks");

  await visitor.goto(`${BASE}/batch`, { waitUntil: "networkidle0" });
  assert.match(await visitor.$eval("main", (m) => m.textContent ?? ""), /kept for the project owner/);
  await visitor.goto(BASE + savedReportPath, { waitUntil: "networkidle0" });
  const visitorText = await visitor.$eval("main", (m) => m.textContent ?? "");
  assert.ok(!visitorText.includes("Delete report") && !visitorText.includes("Record a status change"), "no moderation for visitors");
  assert.match(visitorText, /Request removal or a correction/);
  await visitor.close();

  const owner = await ownerPage();
  assert.equal(new URL(owner.url()).pathname, "/owner");
  const workspace = await owner.$$eval('nav[aria-label="Owner workspace"] a', (links) => links.map((a) => a.textContent));
  assert.deepEqual(workspace, ["Overview", "Reports", "Approvals", "Review queue", "Surveys", "Coverage", "Batch analyze", "AI evaluation", "AI usage", "Settings and privacy"]);

  await owner.goto(BASE + savedReportPath, { waitUntil: "networkidle0" });
  await owner.select(".status-form select", "under_review");
  await owner.click(".status-form button[type=submit]");
  await owner.waitForFunction(() => /Under review/.test(document.querySelector("#status-heading")?.textContent ?? ""));
  const deleteButton = await owner.waitForSelector('xpath/.//button[contains(., "Delete report")]');
  await deleteButton!.click();
  const confirm = await owner.waitForSelector('xpath/.//dialog[@open]//button[contains(., "Delete for good")]');
  await Promise.all([owner.waitForNavigation({ waitUntil: "networkidle0" }), confirm!.click()]);
  assert.equal((await fetch(BASE + "/api" + savedReportPath)).status, 404, "the report is gone");
  await owner.close();
});
