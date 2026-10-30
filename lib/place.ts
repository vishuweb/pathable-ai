// Places come from OpenStreetMap. Shared between browser and server: no secrets here.
export const OSM_TYPES = ["node", "way", "relation"] as const;
export type OsmType = (typeof OSM_TYPES)[number];

/** A stable reference to an OpenStreetMap feature. */
export interface PlaceRef {
  osmType: OsmType;
  osmId: number;
  name: string;
}

export interface PlaceResult extends PlaceRef {
  /** Full address-style name from OpenStreetMap, for telling similar results apart. */
  displayName: string;
  latitude: number;
  longitude: number;
  /** OpenStreetMap category and type, e.g. "amenity" / "toilets". */
  kind: string;
}

export function osmUrl(ref: Pick<PlaceRef, "osmType" | "osmId">): string {
  return `https://www.openstreetmap.org/${ref.osmType}/${ref.osmId}`;
}

export function placePath(ref: Pick<PlaceRef, "osmType" | "osmId">): string {
  return `/places/${ref.osmType}/${ref.osmId}`;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
