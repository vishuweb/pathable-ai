// Place profiles: where each fact comes from and which source stands. Pure logic, no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseObservationSubmission } from "../lib/observation-validate";
import type { Observation } from "../lib/observations";
import { PLACE_FEATURES } from "../lib/place-attributes";
import { featureStatuses, featuresForNeeds } from "../lib/place-profile";

const place = { osmType: "way" as const, osmId: 517026148, name: "Central Library" };
const observation = (over: Partial<Observation>): Observation => ({
  id: "o1",
  createdAt: "2026-10-30T10:00:00Z",
  place,
  latitude: 23.8158,
  longitude: 86.4422,
  featureId: "ramp",
  finding: "present",
  area: "entrance",
  note: "",
  observedOn: "2026-10-30",
  hasPhoto: false,
  consentedAt: "2026-10-30T10:00:00Z",
  statusHistory: [{ status: "community", at: "2026-10-30T10:00:00Z", note: "" }],
  ...over,
});
const status = (features: ReturnType<typeof featureStatuses>, id: string) => features.find((f) => f.id === id)!;
const NOW = new Date("2026-10-31");

test("with nothing recorded, every feature is unknown, and none is described as accessible", () => {
  const features = featureStatuses({}, [], { now: NOW });
  assert.ok(features.length >= 15, "crossing-only questions are left out of a non-crossing place");
  assert.ok(features.every((f) => f.current === "unknown" && f.sources.length === 0 && !f.outdated));
});

test("an OpenStreetMap tag is shown as recorded in OpenStreetMap, with its date", () => {
  const f = status(featureStatuses({ wheelchair: "limited", check_date: "2025-06-01" }, [], { now: NOW }), "wheelchair");
  assert.equal(f.current, "osm");
  assert.equal(f.sources[0].value, "Partly accessible");
  assert.equal(f.sources[0].date, "2025-06-01");
  assert.equal(f.outdated, false);
});

test("old information is flagged outdated, from its own date", () => {
  const f = status(featureStatuses({ wheelchair: "yes", check_date: "2022-01-01" }, [], { now: NOW }), "wheelchair");
  assert.equal(f.current, "osm");
  assert.equal(f.outdated, true);
  const fromEdit = status(featureStatuses({ wheelchair: "yes" }, [], { now: NOW, lastEdited: "2023-01-01T00:00:00Z" }), "wheelchair");
  assert.equal(fromEdit.outdated, true, "falls back to the last edit date");
});

test("features that OpenStreetMap cannot hold are unknown until a visitor adds an observation", () => {
  const before = status(featureStatuses({}, [], { now: NOW }), "visual_alarms");
  assert.equal(before.current, "unknown");
  const after = status(featureStatuses({}, [observation({ featureId: "visual_alarms", note: "Flashing lights by the main stairs" })], { now: NOW }), "visual_alarms");
  assert.equal(after.current, "community");
  assert.equal(after.sources[0].detail, "Flashing lights by the main stairs");
});

test("a visitor's observation does not replace the other sources, and verified outranks community outranks OpenStreetMap", () => {
  const tags = { ramp: "yes" };
  const community = observation({ finding: "blocked", observedOn: "2026-10-30" });
  const verified = observation({
    id: "o2",
    finding: "damaged",
    statusHistory: [
      { status: "community", at: "2026-10-30T10:00:00Z", note: "" },
      { status: "verified", at: "2026-10-31T09:00:00Z", note: "Site visit 31 Oct" },
    ],
  });
  const both = status(featureStatuses(tags, [community, verified], { now: NOW }), "ramp");
  assert.deepEqual(both.sources.map((s) => s.provenance), ["verified", "community", "osm"]);
  assert.equal(both.current, "verified");
  const onlyCommunity = status(featureStatuses(tags, [community], { now: NOW }), "ramp");
  assert.deepEqual(onlyCommunity.sources.map((s) => s.provenance), ["community", "osm"]);
});

test("needs pick out the features that answer them", () => {
  const features = featureStatuses({}, [], { now: NOW });
  const visual = featuresForNeeds(features, ["tactile_paving", "detectable_obstacles"]).map((f) => f.id);
  assert.deepEqual(visual.sort(), ["obstacles", "tactile_paving"]);
  const hearing = featuresForNeeds(features, ["visual_alarms", "communication_support"]).map((f) => f.id);
  assert.ok(hearing.includes("visual_alarms") && hearing.includes("hearing_loop"));
  const mobility = featuresForNeeds(features, ["step_free", "ramps_lifts", "accessible_toilet_mobility"]).map((f) => f.id);
  for (const id of ["wheelchair", "steps", "ramp", "lift", "toilets_wheelchair"]) assert.ok(mobility.includes(id), id);
  assert.ok(PLACE_FEATURES.every((f) => f.needIds.length > 0), "every feature serves at least one need");
});

const base = {
  place,
  latitude: 23.8158145,
  longitude: 86.4421811,
  featureId: "ramp",
  finding: "present",
  area: "entrance",
  note: "North door",
  observedOn: "2026-10-30",
  consent: true,
};

test("observations need consent, a campus location, a known feature and a sensible date", () => {
  const ok = parseObservationSubmission(base, NOW);
  assert.ok(!("error" in ok));
  const error = (change: Record<string, unknown>) => {
    const result = parseObservationSubmission({ ...base, ...change }, NOW);
    return "error" in result ? result.error : "accepted";
  };
  assert.match(error({ consent: false }), /sharing statement/);
  assert.match(error({ latitude: 40.4459, longitude: -3.6774 }), /outside the IIT \(ISM\) Dhanbad pilot area/);
  assert.match(error({ featureId: "made_up" }), /what the observation is about/);
  assert.match(error({ finding: "great" }), /what you found/);
  assert.match(error({ observedOn: "2030-01-01" }), /future/);
  assert.match(error({ observedOn: "yesterday" }), /date/);
  assert.match(error({ note: "x".repeat(501) }), /500 characters/);
  assert.match(error({ place: { osmType: "area", osmId: 1, name: "X" } }), /Choose the place/);
  assert.match(error({ photo: "data:image/png;base64,iVBORw0KGgo=" }), /JPEG/);
});
