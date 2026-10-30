import "server-only";
import type { PlaceResult } from "./place";
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

const cache = new Map<string, DirectoryPlace[]>();

/** Every directory place for the region, checked against its boundary. */
export function directory(region: Region): DirectoryPlace[] {
  const hit = cache.get(region.id);
  if (hit) return hit;
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
  cache.set(region.id, places);
  return places;
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

export function findInDirectory(region: Region, osmType: string, osmId: number): DirectoryPlace | undefined {
  return directory(region).find((p) => p.osmType === osmType && p.osmId === osmId);
}
