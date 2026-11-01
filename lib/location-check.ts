import "server-only";
import { distanceMeters } from "./place";
import type { Coordinates } from "./observations";

/** How far from a place's own position a spot may be and still be called "at" that place. */
export const PLACE_RADIUS_METERS = 400;
/** Positions this close to the place's own are taken to be the place itself, not a separate spot. */
const SAME_SPOT_METERS = 5;

export type SpotCheck = { ok: true; observation?: Coordinates } | { ok: false; error: string };

/**
 * Decides what a visitor's claimed position means for a place from the campus directory. A position
 * beyond the radius is refused. One within it is kept as the spot itself, separate from the place's
 * own coordinates, so a building's centre never stands in for where something actually is. A position
 * that is just the place's own is not a separate spot.
 */
export function checkSpot(canonical: { latitude: number; longitude: number }, claimed: Coordinates): SpotCheck {
  const away = distanceMeters(canonical, claimed);
  if (away > PLACE_RADIUS_METERS) return { ok: false, error: "The location does not match the place." };
  if (away <= SAME_SPOT_METERS) return { ok: true };
  const observation: Coordinates = { latitude: claimed.latitude, longitude: claimed.longitude };
  if (claimed.accuracyM !== undefined && Number.isFinite(claimed.accuracyM) && claimed.accuracyM >= 0) {
    observation.accuracyM = Math.round(Math.min(claimed.accuracyM, 100_000));
  }
  return { ok: true, observation };
}
