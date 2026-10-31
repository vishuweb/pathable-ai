import "server-only";
import { distanceMeters, type PlaceResult } from "./place";
import { PLACE_CATEGORY_LABEL, categorize, type PlaceCategory } from "./place-categories";
import { inRegion, type Region } from "./region";
import iitIsmDhanbadPlaces from "./regions/iit-ism-dhanbad.places.json";

// The campus directory: OpenStreetMap features inside a region's boundary, saved by
// scripts/fetch-campus-places.mjs. Searching it needs no network call, so it keeps working when
// OpenStreetMap's servers are busy, and it can never return a place outside the region.

interface DirectoryFile {
  region: string;
  retrieved: string;
  license: string;
  places: {
    osmType: "node" | "way" | "relation";
    osmId: number;
    name: string | null;
    latitude: number;
    longitude: number;
    tags: Record<string, string>;
    lastEdited?: string;
  }[];
}

const FILES: Record<string, DirectoryFile> = { "iit-ism-dhanbad": iitIsmDhanbadPlaces as unknown as DirectoryFile };

export interface DirectoryPlace extends PlaceResult {
  category: PlaceCategory;
  tags: Record<string, string>;
  lastEdited?: string;
}

const UNNAMED: Partial<Record<string, string>> = {
  toilets: "Toilets",
  parking: "Parking",
  crossing: "Crossing",
  steps: "Steps",
  elevator: "Lift",
  bench: "Bench",
  atm: "ATM",
  drinking_water: "Drinking water",
};

function labelFor(tags: Record<string, string>, name: string | null): string {
  if (name) return name;
  const kind = tags.amenity ?? tags.highway ?? "";
  return UNNAMED[kind] ?? (tags.entrance ? "Entrance" : "Unnamed place");
}

const cache = new Map<string, { all: DirectoryPlace[]; listed: DirectoryPlace[] }>();

/** The same real-world place often appears twice (a point and a building outline); keep the richer one. */
const DUPLICATE_METERS = 60;
/** How close a landmark must be to describe where a generic name such as "Parking" is. */
const LANDMARK_METERS = 250;
const NEVER_LANDMARKS = /^(unnamed place|parking|bungalow|residential quarters|toilets|crossing|steps|entrance|bench|atm|lift)$/i;

function build(region: Region): { all: DirectoryPlace[]; listed: DirectoryPlace[] } {
  const file = FILES[region.id];
  const places = (file?.places ?? [])
    .filter((p) => inRegion(region, p.latitude, p.longitude))
    .map((p) => {
      const name = labelFor(p.tags, p.name);
      const category = categorize(p.tags, p.name ?? "");
      return {
        osmType: p.osmType,
        osmId: p.osmId,
        name,
        displayName: `${name}, ${region.name}`,
        latitude: p.latitude,
        longitude: p.longitude,
        kind: PLACE_CATEGORY_LABEL[category],
        category,
        tags: p.tags,
        lastEdited: p.lastEdited,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Collapse duplicates: same name, same kind, very close together. Prefer the outline (way or
  // relation) and the one with more tags.
  const richness = (p: DirectoryPlace) => Object.keys(p.tags).length + (p.osmType === "node" ? 0 : 5);
  const kept: DirectoryPlace[] = [];
  for (const place of [...places].sort((a, b) => richness(b) - richness(a))) {
    const twin = kept.find(
      (k) => normalize(k.name) === normalize(place.name) && k.category === place.category && distanceMeters(k, place) < DUPLICATE_METERS,
    );
    if (!twin) kept.push(place);
  }

  // Tell repeated generic names apart by the nearest landmark, e.g. "Parking near Lower Ground".
  const counts = new Map<string, number>();
  for (const p of kept) counts.set(normalize(p.name), (counts.get(normalize(p.name)) ?? 0) + 1);
  const landmarks = kept.filter((p) => !NEVER_LANDMARKS.test(p.name) && (counts.get(normalize(p.name)) ?? 0) === 1);
  const unnamed = new Set(kept.filter((p) => p.name === "Unnamed place").map((p) => `${p.osmType}${p.osmId}`));
  const described = kept
    .map((p) => {
      if ((counts.get(normalize(p.name)) ?? 0) < 2) return p;
      const near = landmarks
        .map((l) => ({ l, d: distanceMeters(l, p) }))
        .filter((x) => x.d < LANDMARK_METERS)
        .sort((a, b) => a.d - b.d)[0];
      return near ? { ...p, name: `${p.name} near ${near.l.name}`, displayName: `${p.name} near ${near.l.name}, ${region.name}` } : p;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Names that still collide get "(1 of 2)" so two list entries are never identical.
  const same = new Map<string, number>();
  for (const p of described) same.set(normalize(p.name), (same.get(normalize(p.name)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const all = described.map((p) => {
    const total = same.get(normalize(p.name)) ?? 1;
    if (total < 2) return p;
    const index = (seen.get(normalize(p.name)) ?? 0) + 1;
    seen.set(normalize(p.name), index);
    return { ...p, name: `${p.name} (${index} of ${total})`, displayName: `${p.displayName} (${index} of ${total})` };
  });

  // Unnamed fragments stay reachable by link but are not listed or searched.
  return { all, listed: all.filter((p) => !unnamed.has(`${p.osmType}${p.osmId}`)) };
}

/** Places worth listing for the region: named, de-duplicated, inside its boundary. */
export function directory(region: Region): DirectoryPlace[] {
  let hit = cache.get(region.id);
  if (!hit) cache.set(region.id, (hit = build(region)));
  return hit.listed;
}

export function directoryRetrieved(region: Region): string | undefined {
  return FILES[region.id]?.retrieved;
}

/** Lowercase, no accents or punctuation, "&" as "and", single spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["of", "and", "the", "for", "at", "in"]);

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** A query word matches a name word if it is a prefix of it, or a small misspelling of it. */
function wordMatches(query: string, word: string): boolean {
  if (word.startsWith(query)) return true;
  if (query.length < 4) return false;
  return editDistance(query, word) <= (query.length >= 8 ? 2 : 1);
}

function score(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const qWords = q.split(" ");
  const nWords = n.split(" ");
  // Initials, e.g. "nlhc" for New Lecture Hall Complex.
  const initials = nWords.filter((w) => !STOP_WORDS.has(w)).map((w) => w[0]).join("");
  if (qWords.length === 1 && q.length >= 2 && q.length <= 6 && initials === q) return 70;
  // Every query word must match some word of the name; one unmatched word means no match.
  const matched = qWords.filter((w) => STOP_WORDS.has(w) || nWords.some((nw) => wordMatches(w, nw)));
  if (matched.length !== qWords.length) return 0;
  const exactWords = qWords.filter((w) => nWords.some((nw) => nw.startsWith(w))).length;
  return 40 + Math.round((20 * exactWords) / qWords.length);
}

/** Places in the region whose names match, best first. */
export function searchDirectory(region: Region, query: string, category?: PlaceCategory): DirectoryPlace[] {
  return directory(region)
    .filter((p) => !category || p.category === category)
    .map((p) => ({ p, s: score(query, p.name) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p);
}

/** Any recorded place by its OpenStreetMap id, including ones that are not listed. */
export function findInDirectory(region: Region, osmType: string, osmId: number): DirectoryPlace | undefined {
  directory(region);
  return cache.get(region.id)?.all.find((p) => p.osmType === osmType && p.osmId === osmId);
}
