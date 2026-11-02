import "server-only";
import { createHash } from "node:crypto";
import type { PlaceRef } from "./place";
import { publicSurvey, type PublicSurvey, type Survey } from "./survey";
import { sublocations, surveyPriorities, surveys } from "./store";

/** Later approved surveys replace earlier ones in the current picture; the earlier ones stay in the history. */
function supersededMap(all: Survey[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of all) if (s.state === "approved" && s.supersedes) map.set(s.supersedes, s.id);
  return map;
}

/** Every approved survey, in its public form. Drafts and anything else never get this far. */
export async function publicSurveys(now = new Date()): Promise<PublicSurvey[]> {
  const [all, spots] = await Promise.all([surveys.list(), sublocations.list()]);
  const spotById = new Map(spots.map((s) => [s.id, s]));
  const replaced = supersededMap(all);
  return all.flatMap((s) => publicSurvey(s, s.sublocationId ? spotById.get(s.sublocationId) : undefined, replaced.get(s.id), now) ?? []);
}

export async function publicSurveysAt(place: Pick<PlaceRef, "osmType" | "osmId">, now = new Date()): Promise<PublicSurvey[]> {
  return (await publicSurveys(now)).filter((s) => s.place.osmType === place.osmType && s.place.osmId === place.osmId);
}

/** A stable id for a place's priority record, in the shape the store requires. */
export function priorityId(place: Pick<PlaceRef, "osmType" | "osmId">): string {
  const h = createHash("sha256").update(`priority:${place.osmType}/${place.osmId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const listPriorities = () => surveyPriorities.list();
