import "server-only";
import { findInDirectory } from "./campus-directory";
import { validateImageDataUrl } from "./image-input";
import { OBSERVATION_FINDINGS, PLACE_AREAS, type ObservationFinding, type PlaceArea } from "./observations";
import { OSM_TYPES, distanceMeters, type PlaceRef } from "./place";
import { PLACE_FEATURES } from "./place-attributes";
import { activeRegion, inRegion } from "./region";

export interface ObservationSubmission {
  place: PlaceRef;
  latitude: number;
  longitude: number;
  featureId: string;
  finding: ObservationFinding;
  area: PlaceArea;
  note: string;
  observedOn: string;
  photo?: string;
}

const FEATURE_IDS = new Set(PLACE_FEATURES.map((f) => f.id));
/** How far the coordinates sent by the browser may be from the place's own position. */
const COORDINATE_TOLERANCE_METERS = 300;

/** Checks an observation sent by the browser; returns it cleaned, or a message for the visitor. */
export function parseObservationSubmission(value: unknown, today = new Date()): ObservationSubmission | { error: string } {
  if (typeof value !== "object" || value === null) return { error: "The observation is missing." };
  const body = value as Record<string, unknown>;
  if (body.consent !== true) return { error: "Confirm the sharing statement before submitting." };

  const p = (body.place ?? {}) as Record<string, unknown>;
  const osmType = OSM_TYPES.find((t) => t === p.osmType);
  const osmId = Number(p.osmId);
  if (!osmType || !Number.isSafeInteger(osmId) || osmId <= 0) return { error: "Choose the place this is about." };

  const region = activeRegion();
  const claimedLatitude = Number(body.latitude);
  const claimedLongitude = Number(body.longitude);
  if (!inRegion(region, claimedLatitude, claimedLongitude)) {
    return { error: `This place is outside the ${region.name} pilot area.` };
  }
  // The place must be one of the campus directory's own records, and what is stored is the directory's
  // name and position, never the browser's: nobody can attach an observation to a place that is not
  // there, under another name, or at another spot.
  const canonical = findInDirectory(region, osmType, osmId);
  if (!canonical) return { error: "Choose a place from the campus directory." };
  if (distanceMeters(canonical, { latitude: claimedLatitude, longitude: claimedLongitude }) > COORDINATE_TOLERANCE_METERS) {
    return { error: "The location does not match the place." };
  }
  const place: PlaceRef = { osmType, osmId, name: canonical.name };
  const { latitude, longitude } = canonical;

  const featureId = typeof body.featureId === "string" && FEATURE_IDS.has(body.featureId) ? body.featureId : undefined;
  if (!featureId) return { error: "Choose what the observation is about." };
  const finding = OBSERVATION_FINDINGS.find((f) => f === body.finding);
  if (!finding) return { error: "Choose what you found." };
  const area = PLACE_AREAS.find((a) => a === body.area) ?? "other";

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 500) return { error: "Keep the description under 500 characters." };

  const observedOn = typeof body.observedOn === "string" ? body.observedOn : "";
  const observed = Date.parse(`${observedOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn) || Number.isNaN(observed)) return { error: "Give the date you saw this." };
  if (observed > today.getTime() + 24 * 60 * 60 * 1000) return { error: "The date cannot be in the future." };
  if (observed < Date.parse("2000-01-01T00:00:00Z")) return { error: "The date is too far in the past." };

  let photo: string | undefined;
  if (body.photo != null) {
    const image = validateImageDataUrl(body.photo);
    if (typeof image !== "string") return image;
    if (!image.startsWith("data:image/jpeg;base64,")) return { error: "The photo must be a JPEG." };
    photo = image;
  }

  return { place, latitude, longitude, featureId, finding, area, note, observedOn, photo };
}
