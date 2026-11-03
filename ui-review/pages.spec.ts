import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_OWNER_KEY } from "../playwright.config";

// Looks at every main page at several widths: takes a full-page screenshot for a person (or Claude)
// to review, and fails on sideways scrolling, page errors, broken requests, small touch targets or
// accessibility violations. Screenshots go to ui-review/output/, which is not committed.

const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const WIDTHS = [360, 390, 768, 1280, 1920];
const PUBLIC = ["/", "/places", "/places/way/517026148", "/reports", "/needs", "/report", "/privacy", "/results", "/demo", "/demo/mobility", "/no-such-page"];
const OWNER = ["/owner", "/owner/moderation", "/owner/survey", "/owner/coverage", "/owner/ai-usage", "/owner/settings", "/review", "/batch"];

const fileName = (path: string, width: number) => `ui-review/output/${path === "/" ? "home" : path.slice(1).replace(/[^a-z0-9]+/gi, "-")}-${width}.png`;

/** No map tiles, and nothing that could call a model, whatever a page tries. */
async function guard(page: Page) {
  await page.route(/tile\.openstreetmap\.org|\/api\/(analyze|segment|transcribe)/, (route) => route.abort());
}

async function inspect(page: Page, path: string, width: number) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/tile\.openstreetmap|ERR_FAILED|404/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path, { waitUntil: "networkidle" });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);

  await page.screenshot({ path: fileName(path, width), fullPage: true });

  await page.evaluate(AXE);
  const violations = await page.evaluate(async () => {
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    const axe = (window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: tags } })).violations.map((v) => `${v.id} at ${v.nodes.map((n) => String(n.target)).join(", ")}`);
  });
  expect(violations, `${path} at ${width}px`).toEqual([]);

  // WCAG 2.5.8 asks for at least 24px. Links inside sentences are exempt.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, select, input:not([type=hidden]):not(.visually-hidden), a")]
      .filter((e) => {
        const box = e.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        if (e.tagName === "A" && e.parentElement && e.parentElement.textContent!.trim().length > (e.textContent ?? "").trim().length) return false;
        return box.height < 24 || box.width < 24;
      })
      .map((e) => `${e.tagName} "${(e.textContent ?? "").trim().slice(0, 30)}"`),
  );
  expect(small, `${path} at ${width}px has small targets`).toEqual([]);
  expect(problems, `${path} at ${width}px`).toEqual([]);
}

for (const width of WIDTHS) {
  for (const path of PUBLIC) {
    test(`${path} at ${width}px`, async ({ page }) => {
      await guard(page);
      await inspect(page, path, width);
    });
  }

  test.describe(`signed in at ${width}px`, () => {
    for (const path of OWNER) {
      test(`${path} at ${width}px`, async ({ page }) => {
        await guard(page);
        await page.goto("/owner");
        await page.fill('input[name="key"]', LOCAL_OWNER_KEY);
        await Promise.all([page.waitForURL("**/owner"), page.click('button[type="submit"]')]);
        await inspect(page, path, width);
      });
    }
  });
}

test("the phone menu works by keyboard", async ({ page }) => {
  await guard(page);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open the menu" }).click();
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open the menu" })).toBeFocused();
});

test("keyboard focus is always visible and never hidden under the sticky header", async ({ page }) => {
  await guard(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/places/way/517026148", { waitUntil: "networkidle" });
  const hidden: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return undefined;
      const box = e.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      // What actually sits at the focused element's position: it, or something inside it, or a label for it.
      const visible = Boolean(top) && (top === e || e.contains(top) || top!.contains(e));
      return { label: `${(e.textContent ?? e.tagName).trim().slice(0, 30)} covered by ${top?.tagName}.${top?.className} at ${Math.round(box.x)},${Math.round(box.y)}`, covered: !visible };
    });
    if (state?.covered) hidden.push(state.label);
  }
  expect(hidden).toEqual([]);
});
