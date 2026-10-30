// Working areas ("regions"): where PathAble AI currently operates. Each region is configuration
// (an id, names, a boundary polygon and its source), so another campus or city is a new JSON file
// and an entry below, not new code. Shared by browser and server.
import iitIsmDhanbad from "./regions/iit-ism-dhanbad.json";

export interface Region {
  id: string;
  name: string;
  fullName: string;
  location: string;
  active: boolean;
  source: { osm: string; osmName: string; version: number; lastEdited: string; retrieved: string; license: string };
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  /** Closed ring of [longitude, latitude] points, as in GeoJSON. */
  boundary: [number, number][];
}

export const REGIONS: Region[] = [iitIsmDhanbad as Region];

/** The region the app works in. The first active region; the pilot has exactly one. */
export function activeRegion(): Region {
  const region = REGIONS.find((r) => r.active);
  if (!region) throw new Error("No active region is configured.");
  return region;
}

/** True when the point lies inside the region's boundary (ray casting; boundary points may go either way). */
export function inRegion(region: Region, latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const { bbox } = region;
  if (latitude < bbox.minLat || latitude > bbox.maxLat || longitude < bbox.minLon || longitude > bbox.maxLon) return false;
  let inside = false;
  const ring = region.boundary;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function regionCentre(region: Region): { latitude: number; longitude: number } {
  return {
    latitude: (region.bbox.minLat + region.bbox.maxLat) / 2,
    longitude: (region.bbox.minLon + region.bbox.maxLon) / 2,
  };
}
