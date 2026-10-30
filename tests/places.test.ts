// Places: reading OpenStreetMap tags, and the server's use of Nominatim and the OSM API (mocked).
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { distanceMeters, formatDistance } from "../lib/place";
import { isStale, placeAttributes } from "../lib/place-attributes";
import { startMockMeta } from "./mock-meta";

const mock = await startMockMeta();
Object.assign(process.env, { NOMINATIM_URL: mock.nominatimUrl, OSM_API_URL: mock.osmApiUrl });
for (const name of ["OWNER_KEY", "VERCEL", "ANALYZE_LIMIT_PER_HOUR"]) delete process.env[name];
const { PlaceServiceError, lookupPlace, searchPlaces } = await import("../lib/places");
const placesRoute = await import("../app/api/places/route");
after(mock.close);

const attribute = (tags: Record<string, string>, id: string) => placeAttributes(tags).find((a) => a.id === id);

test("recorded tags become plain-language community data", () => {
  const tags = { wheelchair: "limited", "wheelchair:description": "One step at the door", tactile_paving: "no", bench: "yes" };
  assert.deepEqual(
    { ...attribute(tags, "wheelchair") },
    {
      id: "wheelchair",
      group: "mobility",
      needIds: ["step_free", "wheelchair_paths", "accessible_entrance"],
      label: "Wheelchair access",
      state: "community",
      value: "Partly accessible",
      detail: "One step at the door",
      checked: undefined,
    },
  );
  assert.equal(attribute(tags, "tactile_paving")?.value, "None");
  assert.equal(attribute(tags, "seating")?.value, "Seating available");
});

test("missing tags are unknown, never good or bad news", () => {
  const ramp = attribute({}, "ramp");
  assert.equal(ramp?.state, "unknown");
  assert.equal(ramp?.value, undefined);
  assert.ok(placeAttributes({}).every((a) => a.state === "unknown"));
});

test("crossing questions appear only for crossings", () => {
  assert.equal(attribute({ amenity: "cafe" }, "audible_signal"), undefined);
  const crossing = { highway: "crossing", crossing: "traffic_signals", "traffic_signals:sound": "yes", kerb: "lowered" };
  assert.equal(attribute(crossing, "audible_signal")?.value, "Present");
  assert.equal(attribute(crossing, "visual_signal")?.value, "Traffic lights for pedestrians");
  assert.equal(attribute(crossing, "kerb")?.value, "Lowered kerb");
  assert.equal(attribute({ highway: "crossing" }, "audible_signal")?.state, "unknown");
});

test("a lift is never claimed to be working", () => {
  assert.match(attribute({ elevator: "yes" }, "lift")!.value!, /whether it works now is unknown/);
});

test("survey dates mark old information as possibly out of date", () => {
  const now = new Date("2026-10-30");
  assert.equal(isStale("2024-09-18", now), true);
  assert.equal(isStale("2025-06-01", now), false);
  assert.equal(isStale(undefined, now), false);
  assert.equal(isStale("not a date", now), false);
  assert.equal(attribute({ wheelchair: "yes", check_date: "2023-01-01" }, "wheelchair")?.checked, "2023-01-01");
  assert.equal(attribute({ wheelchair: "yes", "check_date:wheelchair": "2026-01-01", check_date: "2020-01-01" }, "wheelchair")?.checked, "2026-01-01");
});

test("distances", () => {
  const charingCross = { latitude: 51.5085, longitude: -0.1254 };
  const trafalgar = { latitude: 51.508, longitude: -0.1281 };
  const d = distanceMeters(charingCross, trafalgar);
  assert.ok(d > 150 && d < 250, String(d));
  assert.equal(formatDistance(184), "180 m");
  assert.equal(formatDistance(1530), "1.5 km");
});

const nominatimPlace = {
  osm_type: "node",
  osm_id: 469782067,
  lat: "51.5085185",
  lon: "-0.1254071",
  name: "Charing Cross Station",
  display_name: "Charing Cross Station, Strand, London",
  category: "highway",
  type: "bus_stop",
  extratags: { wheelchair: "limited", tactile_paving: "no" },
};

test("search identifies the app to OpenStreetMap and returns clean results", async () => {
  mock.replies.placeSearch = { kind: "json", body: [nominatimPlace, { osm_type: "bogus", osm_id: 1 }] };
  const results = await searchPlaces("charing cross");
  assert.deepEqual(results, [
    {
      osmType: "node",
      osmId: 469782067,
      name: "Charing Cross Station",
      displayName: "Charing Cross Station, Strand, London",
      latitude: 51.5085185,
      longitude: -0.1254071,
      kind: "highway / bus_stop",
    },
  ]);
  const request = mock.requests.at(-1)!;
  assert.match(String(request.headers["user-agent"]), /^PathAbleAI\/.+github\.com\/vishuweb\/pathable-ai/);
  assert.match(request.path, /^\/search\?format=jsonv2&q=charing\+cross&limit=8$/);
});

test("repeated searches are served from the cache", async () => {
  const before = mock.requests.length;
  await searchPlaces("charing cross");
  assert.equal(mock.requests.length, before);
});

test("identical requests in flight share one call", async () => {
  mock.replies.placeSearch = { kind: "json", body: [] };
  const before = mock.requests.length;
  await Promise.all([searchPlaces("same words"), searchPlaces("same words"), searchPlaces("same words")]);
  assert.equal(mock.requests.length - before, 1);
});

test("calls are spaced at least a second apart", async () => {
  mock.replies.placeSearch = { kind: "json", body: [] };
  const started = Date.now();
  await Promise.all([searchPlaces("first query"), searchPlaces("second query")]);
  assert.ok(Date.now() - started >= 950, "the second call waited");
});

test("lookup merges tags and the last edit date", async () => {
  mock.replies.placeLookup = { kind: "json", body: [nominatimPlace] };
  mock.replies.osmElement = {
    kind: "json",
    body: { elements: [{ timestamp: "2024-02-01T10:00:00Z", tags: { wheelchair: "limited", bench: "yes" } }] },
  };
  const place = await lookupPlace("node", 469782067);
  assert.equal(place?.lastEdited, "2024-02-01T10:00:00Z");
  assert.deepEqual(place?.tags, { wheelchair: "limited", tactile_paving: "no", bench: "yes" });
});

test("a missing place is undefined; a failing service is a clear error", async () => {
  mock.replies.placeLookup = { kind: "json", body: [] };
  assert.equal(await lookupPlace("way", 1), undefined);
  mock.replies.placeSearch = { kind: "status", status: 503 };
  await assert.rejects(searchPlaces("service down"), PlaceServiceError);
});

test("the search route validates the query", async () => {
  const get = (q: string) => placesRoute.GET(new Request(`http://localhost/api/places?q=${encodeURIComponent(q)}`));
  assert.equal((await get("ab")).status, 400);
  assert.equal((await get("x".repeat(121))).status, 400);
  mock.replies.placeSearch = { kind: "json", body: [nominatimPlace] };
  const ok = await get("charing cross station");
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).places[0].name, "Charing Cross Station");
  mock.replies.placeSearch = { kind: "status", status: 500 };
  assert.equal((await get("another place")).status, 503);
});
