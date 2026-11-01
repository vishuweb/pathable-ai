import "server-only";
import { publicObservations, publicReports } from "./moderation-store";
import type { PlaceRef } from "./place";
import { buildPlaceIntelligence, type PlaceIntelligence } from "./place-intelligence";

/**
 * A place's profile from storage. Reads only approved items and builds the profile fresh on every
 * request, so a deleted, rejected or re-opened record is gone from the page at once. Nothing is
 * cached across requests on purpose; if this becomes slow, an index kept in step with writes is the
 * next step (see docs/ROADMAP.md), not a time-based cache that could show a removed photo's text.
 */
export async function loadPlaceIntelligence(
  place: Pick<PlaceRef, "osmType" | "osmId">,
  tags: Record<string, string>,
  lastEdited?: string,
  now?: Date,
): Promise<PlaceIntelligence> {
  const [observations, reports] = await Promise.all([publicObservations(), publicReports()]);
  return buildPlaceIntelligence({ place, tags, lastEdited, observations, reports, now });
}
