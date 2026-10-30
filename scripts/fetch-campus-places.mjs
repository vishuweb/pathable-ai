// Builds the campus place directory from OpenStreetMap, using only features inside the region's
// boundary polygon. Run occasionally to refresh the committed snapshot:
//   node scripts/fetch-campus-places.mjs iit-ism-dhanbad
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
import { readFileSync, writeFileSync } from "node:fs";

const regionId = process.argv[2] ?? "iit-ism-dhanbad";
const region = JSON.parse(readFileSync(new URL(`../lib/regions/${regionId}.json`, import.meta.url), "utf8"));
const poly = region.boundary.map(([lon, lat]) => `${lat} ${lon}`).join(" ");
const USER_AGENT = "PathAbleAI/0.1 (https://github.com/vishuweb/pathable-ai)";

// Named features, plus unnamed ones that matter for access (toilets, entrances, crossings, lifts, parking).
const query = `[out:json][timeout:60];
(
  nwr(poly:"${poly}")[name];
  nwr(poly:"${poly}")[amenity~"^(toilets|parking|bench|drinking_water|atm|clinic|doctors|hospital|pharmacy|library|cafe|restaurant|fast_food|canteen)$"];
  nwr(poly:"${poly}")[entrance];
  nwr(poly:"${poly}")[highway~"^(crossing|elevator|steps)$"];
  nwr(poly:"${poly}")[leisure~"^(sports_centre|pitch|stadium|park|track)$"];
);
out center tags meta;`;

const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
let data;
for (let attempt = 0; attempt < 6 && !data; attempt++) {
  const url = endpoints[attempt % endpoints.length];
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  }).catch(() => undefined);
  if (res?.ok) data = await res.json();
  else {
    console.error(`attempt ${attempt + 1} at ${url}: ${res?.status ?? "network error"}; retrying`);
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
}
if (!data) throw new Error("Overpass did not answer; try again later.");

// Ray casting on the same boundary the app enforces, so the snapshot never holds an outside point.
function inside(lat, lon) {
  let hit = false;
  const ring = region.boundary;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const places = data.elements
  .map((e) => ({
    osmType: e.type,
    osmId: e.id,
    name: e.tags?.name ?? null,
    latitude: e.lat ?? e.center?.lat,
    longitude: e.lon ?? e.center?.lon,
    tags: e.tags ?? {},
    lastEdited: e.timestamp,
  }))
  .filter((p) => Number.isFinite(p.latitude) && inside(p.latitude, p.longitude))
  .filter((p) => !(p.osmType === region.source.osm.split("/")[0] && String(p.osmId) === region.source.osm.split("/")[1]));

writeFileSync(
  new URL(`../lib/regions/${regionId}.places.json`, import.meta.url),
  JSON.stringify(
    { region: regionId, retrieved: new Date().toISOString().slice(0, 10), license: "© OpenStreetMap contributors, ODbL", places },
    null,
    1,
  ) + "\n",
);
console.log(`${places.length} places inside ${region.name} (${data.elements.length} returned before the boundary check)`);
