import "server-only";
import { searchDirectory } from "./campus-directory";
import { OSM_TYPES, type OsmType, type PlaceResult } from "./place";
import type { PlaceCategory } from "./place-categories";
import { inRegion, type Region } from "./region";

// OpenStreetMap's free services: Nominatim for search and lookup, the main API for edit dates.
// Their usage policies ask for an identifying User-Agent, at most one request per second and
// caching, so all calls go through this module. No key or account is involved, so there is no cost.
const NOMINATIM_URL = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const OSM_API_URL = process.env.OSM_API_URL ?? "https://api.openstreetmap.org/api/0.6";
const USER_AGENT = "PathAbleAI/0.1 (https://github.com/vishuweb/pathable-ai)";
const TIMEOUT_MS = 10_000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED = 500;

export class PlaceServiceError extends Error {}

const cache = new Map<string, { at: number; value: unknown }>();
// Identical requests in flight share one call, e.g. a page and its title looking up the same place.
const inFlight = new Map<string, Promise<unknown>>();
let queue: Promise<void> = Promise.resolve();
let lastCall = 0;

/** Fetches JSON from an OpenStreetMap service, one request per second at most, with caching. */
async function osmJson<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T>;
  const request = fetchOsm<T>(url).finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

async function fetchOsm<T>(url: string): Promise<T> {
  const turn = queue.then(async () => {
    const wait = lastCall + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  });
  queue = turn.catch(() => {});
  await turn;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PlaceServiceError("The place service could not be reached. Please try again.");
  }
  if (response.status === 404 || response.status === 410) return undefined as T;
  if (!response.ok) throw new PlaceServiceError("The place service is busy. Please try again shortly.");
  const value = (await response.json()) as T;
  cache.set(url, { at: Date.now(), value });
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return value;
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  extratags?: Record<string, string> | null;
}

function toPlace(p: NominatimPlace): PlaceResult | undefined {
  const osmType = OSM_TYPES.find((t) => t === p.osm_type);
  const latitude = Number(p.lat);
  const longitude = Number(p.lon);
  if (!osmType || !Number.isInteger(p.osm_id) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const displayName = (p.display_name ?? "").slice(0, 300);
  return {
    osmType,
    osmId: p.osm_id!,
    name: (p.name || displayName.split(",")[0] || "Unnamed place").slice(0, 200),
    displayName,
    latitude,
    longitude,
    kind: [p.category, p.type].filter(Boolean).join(" / "),
  };
}

const MAX_RESULTS = 12;

/**
 * Places in the region matching a search, best first. The saved campus directory answers first;
 * Nominatim is asked only to fill gaps, restricted to the region's bounding box, and every result
 * is checked against the boundary polygon. Nothing outside the region is ever returned.
 */
export async function searchPlaces(region: Region, query: string, category?: PlaceCategory): Promise<PlaceResult[]> {
  const fromDirectory = searchDirectory(region, query, category);
  if (fromDirectory.length >= 5 || category) return fromDirectory.slice(0, MAX_RESULTS);

  const { bbox } = region;
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "10",
    viewbox: `${bbox.minLon},${bbox.maxLat},${bbox.maxLon},${bbox.minLat}`,
    bounded: "1",
  });
  let extra: PlaceResult[] = [];
  try {
    const results = await osmJson<NominatimPlace[]>(`${NOMINATIM_URL}/search?${params}`);
    extra = (Array.isArray(results) ? results : [])
      .flatMap((p) => toPlace(p) ?? [])
      .filter((p) => inRegion(region, p.latitude, p.longitude))
      .filter((p) => !fromDirectory.some((d) => d.osmType === p.osmType && d.osmId === p.osmId));
  } catch (error) {
    // The directory still answers; only fail when there is nothing to show at all.
    if (!fromDirectory.length) throw error;
  }
  return [...fromDirectory, ...extra].slice(0, MAX_RESULTS);
}

export interface PlaceDetails extends PlaceResult {
  /** OpenStreetMap tags, which include contributors' accessibility information. */
  tags: Record<string, string>;
  /** When the feature was last edited in OpenStreetMap, if known. */
  lastEdited?: string;
}

/** One place with its tags and last edit date, or undefined if it does not exist. */
export async function lookupPlace(osmType: OsmType, osmId: number): Promise<PlaceDetails | undefined> {
  const id = `${osmType[0].toUpperCase()}${osmId}`;
  const params = new URLSearchParams({ format: "jsonv2", osm_ids: id, extratags: "1" });
  const [found] = (await osmJson<NominatimPlace[]>(`${NOMINATIM_URL}/lookup?${params}`)) ?? [];
  const place = found && toPlace(found);
  if (!place) return undefined;

  // The main API has the complete tag set and the last edit date; both are helpful but optional.
  let element: { timestamp?: string; tags?: Record<string, string> } | undefined;
  try {
    const result = await osmJson<{ elements?: { timestamp?: string; tags?: Record<string, string> }[] }>(
      `${OSM_API_URL}/${osmType}/${osmId}.json`,
    );
    element = result?.elements?.[0];
  } catch {
    // Show the place with Nominatim's tags only.
  }
  return { ...place, tags: { ...(found.extratags ?? {}), ...(element?.tags ?? {}) }, lastEdited: element?.timestamp };
}
