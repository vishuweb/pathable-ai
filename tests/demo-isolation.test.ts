// The demo's sample data must never reach real records. This checks the code boundary, and that the
// fixtures describe fictional places that are not in the campus directory.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { directory } from "../lib/campus-directory";
import { DEMO_NOTICE, DEMO_SCENARIOS, demoReport } from "../lib/demo/fixtures";
import { buildPlaceIntelligence } from "../lib/place-intelligence";
import { activeRegion } from "../lib/region";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

test("only the demo imports the sample data", () => {
  const users = ["app", "components", "lib"]
    .flatMap(files)
    .filter((file) => /demo\/fixtures/.test(readFileSync(file, "utf8")))
    .map((file) => file.replaceAll("\\", "/"));
  assert.ok(users.length > 0);
  for (const file of users) assert.match(file, /^(app\/demo\/|components\/demo\/)/, `${file} must not import the demo data`);
});

test("the demo sends nothing: its component has no network or storage calls", () => {
  const source = readFileSync("components/demo/DemoScenario.tsx", "utf8");
  assert.ok(!/\bfetch\(|localStorage|usePreferences/.test(source));
});

test("sample places are fictional, labelled as samples, and not in the campus directory", () => {
  const real = directory(activeRegion());
  for (const scenario of DEMO_SCENARIOS) {
    assert.ok(scenario.place.name.startsWith("Sample "), scenario.place.name);
    assert.ok(!real.some((p) => p.osmId === scenario.place.osmId), "no directory id is reused");
    assert.ok(!real.some((p) => p.name === scenario.place.name), "no directory name is reused");
    for (const other of scenario.otherPlaces) assert.ok(other.startsWith("Sample "), other);
  }
  assert.equal(DEMO_NOTICE, "Illustrative demo — not verified campus data.");
  assert.equal(new Set(DEMO_SCENARIOS.map((s) => s.need)).size, 4, "four different kinds of need");
});

test("the demo runs the real rules: approval does not verify, a reason does, and conflicts stay", () => {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === "mobility")!;
  const submitted = { status: "submitted" as const, at: "2026-10-22T09:00:00Z", note: "" };
  const now = new Date("2026-11-01T00:00:00Z");
  const run = (history: (typeof submitted)[] | { status: "verified"; at: string; note: string }[]) =>
    buildPlaceIntelligence({ place: scenario.place, tags: scenario.tags, observations: [], reports: [demoReport(scenario, ["a"], history as never)], now });
  assert.equal(run([submitted]).barriers[0].provenance, "reporter_confirmed");
  assert.equal(run([submitted, { status: "verified", at: "2026-10-25T09:00:00Z", note: "Went and looked" }] as never).barriers[0].provenance, "verified");

  const wayfinding = DEMO_SCENARIOS.find((s) => s.id === "wayfinding")!;
  const intel = buildPlaceIntelligence({ place: wayfinding.place, tags: wayfinding.tags, observations: wayfinding.observations, reports: [], now });
  assert.ok(intel.features.find((f) => f.id === "signage")!.conflict, "the sample conflict is really detected");
  const hearing = DEMO_SCENARIOS.find((s) => s.id === "hearing")!;
  const gap = buildPlaceIntelligence({ place: hearing.place, tags: hearing.tags, observations: [], reports: [], now });
  assert.equal(gap.features.find((f) => f.id === "visual_alarms")!.current, "unknown", "the sample gap stays unknown");
});
