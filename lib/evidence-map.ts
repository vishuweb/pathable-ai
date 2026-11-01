// What a piece of evidence may say about a place's accessibility features, and how far it reaches.
// A report is evidence about one condition at one spot, never about a whole feature: a blocked
// ramp is a possible obstruction of that ramp, not proof that no ramp works, and a report about
// one entrance says nothing about the others. Shared by browser and server.
import type { ObservationFinding, PlaceArea } from "./observations";
import type { IssueCategory } from "./types";

/**
 * The features (see lib/place-attributes.ts) a barrier category can bear on. Evidence only ever
 * attaches to these; a category not listed here (for example "other") attaches to none.
 */
export const CATEGORY_FEATURES: Record<IssueCategory, string[]> = {
  blocked_curb_ramp: ["ramp", "kerb"],
  obstructed_footpath: ["clear_path", "obstacles"],
  damaged_surface: ["surface", "clear_path"],
  difficult_entrance: ["step_free_entrance", "steps"],
  tactile_guidance: ["tactile_paving"],
  hard_to_detect_obstacle: ["obstacles"],
  // A photo cannot show whether a signal is audible or visible, so only the kerb is affected.
  crossing_problem: ["kerb"],
  signage_problem: ["signage", "contrast_signs"],
  other: [],
};

/** What an observation says about its feature, in three kinds that can disagree. */
export type Polarity = "yes" | "no" | "problem";

export const FINDING_POLARITY: Record<ObservationFinding, Polarity> = {
  present: "yes",
  absent: "no",
  damaged: "problem",
  blocked: "problem",
};

export const POLARITY_LABEL: Record<Polarity, string> = {
  yes: "present and usable",
  no: "not there",
  problem: "there, but damaged, not working or blocked",
};

/** Where the evidence applies, in words, so a local finding is not read as covering the whole place. */
export function scopeNote(area: PlaceArea | undefined): string {
  if (!area || area === "other") return "Applies to the spot described, not to the whole place.";
  const where: Record<Exclude<PlaceArea, "other">, string> = {
    entrance: "one entrance",
    inside: "one spot inside the building",
    path: "one path",
    crossing: "one crossing",
    steps_ramp: "one set of steps, one ramp or one lift",
    toilet: "one toilet",
    parking: "one parking or drop-off area",
    signage: "one sign or information point",
  };
  return `Applies to ${where[area]}, not to every ${area === "steps_ramp" ? "ramp or lift" : area === "inside" ? "part of the building" : area} at this place.`;
}
