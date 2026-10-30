// Places: reading OpenStreetMap tags, the campus boundary and directory, and the server's use of
// Nominatim and the OSM API (mocked).
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { distanceMeters, formatDistance } from "../lib/place";
import { isStale, placeAttributes } from "../lib/place-attributes";
import { startMockMeta } from "./mock-meta";

const mock = await startMockMeta();
Object.assign(process.env, { NOMINATIM_URL: mock.nominatimUrl, OSM_API_URL: mock.osmApiUrl });
for (const name of ["OWNER_KEY", "VERCEL", "ANALYZE_LIMIT_PER_HOUR"]) delete process.env[name];
const { PlaceServiceError, lookupPlace, searchPlaces } = await import("../lib/places");
const { activeRegion, inRegion } = await import("../lib/region");
const { directory, normalize, searchDirectory } = await import("../lib/campus-directory");
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
  const library = { latitude: 23.8145, longitude: 86.4412 };
  const postOffice = { latitude: 23.8116, longitude: 86.4422 };
  const d = distanceMeters(library, postOffice);
  assert.ok(d > 250 && d < 400, String(d));
  assert.equal(formatDistance(184), "180 m");
  assert.equal(formatDistance(1530), "1.5 km");
});

const campus = activeRegion();
const names = (results: { name: string }[]) => results.map((r) => r.name);

// Real coordinates: the campus post office, Madrid's National Auditorium of Music, Dhanbad railway station.
const POST_OFFICE = { lat: 23.8116363, lon: 86.4421556 };
const MADRID = { lat: 40.4459, lon: -3.6774 };
const DHANBAD_STATION = { lat: 23.7915, lon: 86.4273 };

test("the campus is the active region, with OpenStreetMap's real boundary", () => {
  assert.equal(campus.id, "iit-ism-dhanbad");
  assert.equal(campus.source.osm, "way/133882752");
  assert.ok(campus.boundary.length > 50);
  assert.deepEqual(campus.boundary[0], campus.boundary.at(-1), "the ring is closed");
});

test("point-in-polygon: on campus inside, the rest of the world outside", () => {
  assert.equal(inRegion(campus, POST_OFFICE.lat, POST_OFFICE.lon), true);
  assert.equal(inRegion(campus, MADRID.lat, MADRID.lon), false);
  assert.equal(inRegion(campus, DHANBAD_STATION.lat, DHANBAD_STATION.lon), false, "nearby in town is still outside");
  assert.equal(inRegion(campus, Number.NaN, 86.44), false);
});

test("every directory place lies inside the campus", () => {
  const all = directory(campus);
  assert.ok(all.length > 50);
  assert.ok(all.every((p) => inRegion(campus, p.latitude, p.longitude)));
});

test("names are compared without case, accents or punctuation", () => {
  assert.equal(normalize("Rosaline Girl's  Hostel"), "rosaline girls hostel");
  assert.equal(normalize("Fuel, Mineral & Metallurgical"), "fuel mineral and metallurgical");
});

test("known campus places are found, with common variations", () => {
  assert.equal(searchDirectory(campus, "central library")[0]?.name, "Central Library");
  assert.equal(searchDirectory(campus, "CENTRAL LIBRARY")[0]?.name, "Central Library");
  assert.equal(searchDirectory(campus, "nlhc")[0]?.name, "New Lecture Hall Complex", "initials");
  assert.equal(searchDirectory(campus, "penman auditorium")[0]?.name, "Penman Auditoriam", "small misspellings");
  assert.deepEqual(names(searchDirectory(campus, "jasp")), ["Jasper garden", "Jasper Hostel"], "prefixes");
  assert.ok(names(searchDirectory(campus, "hostel")).includes("Topaz Hostel"));
  assert.ok(searchDirectory(campus, "library", "library").every((p) => p.category === "library"));
});

test("campus places get sensible categories", () => {
  const category = (name: string) => directory(campus).find((p) => p.name === name)?.category;
  assert.equal(category("Faculty Quarters Block A"), "residential");
  assert.equal(category("Basket Ball Court (Amber hostel)"), "sports");
  assert.equal(category("Topaz Hostel"), "hostel");
  assert.equal(category("Central Library"), "library");
  assert.equal(category("New Lecture Hall Complex"), "lecture");
  assert.equal(category("ISM Health Center"), "health");
  assert.equal(category("Department of Mechanical Engineering"), "academic");
});

test("every word must match, so NAC Auditorium does not land on another auditorium", () => {
  assert.deepEqual(searchDirectory(campus, "NAC Auditorium"), []);
  assert.deepEqual(searchDirectory(campus, "National Auditorium of Music"), []);
});

const madridAuditorium = {
  osm_type: "way",
  osm_id: 24489652,
  lat: String(MADRID.lat),
  lon: String(MADRID.lon),
  name: "Auditorio Nacional de Musica",
  display_name: "Auditorio Nacional de Musica, Madrid, Spain",
  category: "amenity",
  type: "theatre",
};
const campusPostOffice = {
  osm_type: "node",
  osm_id: 4640533400,
  lat: String(POST_OFFICE.lat),
  lon: String(POST_OFFICE.lon),
  name: "India Post (IIT ISM)",
  display_name: "India Post (IIT ISM), ISM Main Gate Road, Dhanbad",
  category: "amenity",
  type: "post_office",
};

test("NAC Auditorium never returns Madrid, even if the geocoder does", async () => {
  mock.replies.placeSearch = { kind: "json", body: [madridAuditorium] };
  assert.deepEqual(await searchPlaces(campus, "NAC Auditorium"), []);
  const request = mock.requests.at(-1)!;
  const params = new URL(`http://x${request.path}`).searchParams;
  assert.equal(params.get("bounded"), "1", "the geocoder is held to the campus box");
  assert.equal(params.get("viewbox"), `${campus.bbox.minLon},${campus.bbox.maxLat},${campus.bbox.maxLon},${campus.bbox.minLat}`);
  assert.equal(params.get("q"), "NAC Auditorium", "the query is not padded with the campus name");
  assert.match(String(request.headers["user-agent"]), /^PathAbleAI\/.+github\.com\/vishuweb\/pathable-ai/);
});

test("geocoder results are kept only when inside the campus polygon", async () => {
  mock.replies.placeSearch = { kind: "json", body: [madridAuditorium, campusPostOffice] };
  assert.deepEqual(names(await searchPlaces(campus, "post office near gate")), ["India Post (IIT ISM)"]);
});

test("the directory answers first and its results are not duplicated", async () => {
  mock.replies.placeSearch = { kind: "json", body: [] };
  const results = await searchPlaces(campus, "central library");
  assert.equal(results[0].name, "Central Library");
  assert.equal(new Set(results.map((r) => `${r.osmType}${r.osmId}`)).size, results.length);
});

test("a geocoder failure still returns directory results, and fails clearly when there are none", async () => {
  mock.replies.placeSearch = { kind: "status", status: 503 };
  assert.equal((await searchPlaces(campus, "central library"))[0].name, "Central Library");
  await assert.rejects(searchPlaces(campus, "zzqx nothing here"), PlaceServiceError);
});

test("repeated searches are cached, and identical requests share one call", async () => {
  mock.replies.placeSearch = { kind: "json", body: [] };
  const before = mock.requests.length;
  await Promise.all([searchPlaces(campus, "same words"), searchPlaces(campus, "same words"), searchPlaces(campus, "same words")]);
  await searchPlaces(campus, "same words");
  assert.equal(mock.requests.length - before, 1);
});

test("calls are spaced at least a second apart", async () => {
  mock.replies.placeSearch = { kind: "json", body: [] };
  const started = Date.now();
  await Promise.all([searchPlaces(campus, "first query"), searchPlaces(campus, "second query")]);
  assert.ok(Date.now() - started >= 950, "the second call waited");
});

test("lookup merges tags and the last edit date", async () => {
  mock.replies.placeLookup = { kind: "json", body: [{ ...campusPostOffice, extratags: { wheelchair: "limited" } }] };
  mock.replies.osmElement = { kind: "json", body: { elements: [{ timestamp: "2024-02-01T10:00:00Z", tags: { bench: "yes" } }] } };
  const place = await lookupPlace("node", 4640533400);
  assert.equal(place?.lastEdited, "2024-02-01T10:00:00Z");
  assert.deepEqual(place?.tags, { wheelchair: "limited", bench: "yes" });
  mock.replies.placeLookup = { kind: "json", body: [] };
  assert.equal(await lookupPlace("way", 1), undefined);
});

test("the search route validates the query and returns nothing from outside the campus", async () => {
  const get = (q: string) => placesRoute.GET(new Request(`http://localhost/api/places?q=${encodeURIComponent(q)}`));
  assert.equal((await get("a")).status, 400);
  assert.equal((await get("x".repeat(121))).status, 400);
  mock.replies.placeSearch = { kind: "json", body: [madridAuditorium] };
  const none = await get("NAC Auditorium");
  assert.equal(none.status, 200);
  assert.deepEqual((await none.json()).places, [], "Madrid is filtered out");
  const ok = await (await get("topaz")).json();
  assert.equal(ok.region.name, "IIT (ISM) Dhanbad");
  assert.ok(ok.places.some((p: { name: string }) => p.name === "Topaz Hostel"));
});
