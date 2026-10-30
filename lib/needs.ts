// Accessibility needs, grouped by kind. People choose specific needs, never a diagnosis, and a
// place or report is described per need rather than with one overall "accessible" score.
export const NEED_GROUPS = ["mobility", "vision", "hearing", "cognitive", "general"] as const;
export type NeedGroup = (typeof NEED_GROUPS)[number];

export const NEED_GROUP_INFO: Record<NeedGroup, { label: string; short: string; description: string }> = {
  mobility: {
    label: "Moving around",
    short: "Mobility",
    description: "For wheelchair users and people using walkers, crutches, prams or other mobility aids.",
  },
  vision: {
    label: "Seeing",
    short: "Vision",
    description: "For blind and partially sighted people.",
  },
  hearing: {
    label: "Hearing",
    short: "Hearing",
    description: "For Deaf and hard-of-hearing people.",
  },
  cognitive: {
    label: "Understanding and finding the way",
    short: "Cognitive",
    description: "For people who prefer simple, predictable routes and clear information.",
  },
  general: {
    label: "Comfort and other needs",
    short: "Other",
    description: "For older adults, people with temporary conditions, and anyone who needs rest or facilities.",
  },
};

export interface Need {
  id: string;
  group: NeedGroup;
  label: string;
}

export const NEEDS: Need[] = [
  { id: "step_free", group: "mobility", label: "Step-free access" },
  { id: "wheelchair_paths", group: "mobility", label: "Paths wide and clear enough for a wheelchair" },
  { id: "ramps_lifts", group: "mobility", label: "Ramps and working lifts" },
  { id: "smooth_surface", group: "mobility", label: "Smooth, even surfaces" },
  { id: "gentle_slopes", group: "mobility", label: "Warnings about steep slopes" },
  { id: "accessible_entrance", group: "mobility", label: "Accessible entrances" },
  { id: "accessible_toilet_mobility", group: "mobility", label: "Wheelchair-accessible toilets" },

  { id: "tactile_paving", group: "vision", label: "Tactile paving and guidance" },
  { id: "detectable_obstacles", group: "vision", label: "Obstacles a cane can detect" },
  { id: "accessible_crossings", group: "vision", label: "Accessible pedestrian crossings" },
  { id: "audible_signals", group: "vision", label: "Audible crossing signals" },
  { id: "high_contrast_signs", group: "vision", label: "High-contrast signs" },
  { id: "good_lighting", group: "vision", label: "Good lighting" },
  { id: "audio_guidance", group: "vision", label: "Audio guidance" },

  { id: "visual_signals", group: "hearing", label: "Visual crossing signals" },
  { id: "text_information", group: "hearing", label: "Written instructions and alerts" },
  { id: "visual_alarms", group: "hearing", label: "Visual emergency information" },
  { id: "communication_support", group: "hearing", label: "Accessible communication (for example hearing loops)" },
  { id: "vibration_alerts", group: "hearing", label: "Vibrating alerts where available" },

  { id: "simple_directions", group: "cognitive", label: "Simple, predictable directions" },
  { id: "clear_signage", group: "cognitive", label: "Clear signs and landmarks" },
  { id: "less_complex_routes", group: "cognitive", label: "Less complicated routes" },
  { id: "plain_instructions", group: "cognitive", label: "Instructions in plain language" },
  { id: "warn_confusing_transitions", group: "cognitive", label: "Warnings about confusing changes of route" },

  { id: "seating", group: "general", label: "Places to sit and rest" },
  { id: "accessible_toilets", group: "general", label: "Accessible public toilets" },
  { id: "environment", group: "general", label: "Lighting, noise and weather shelter" },
];

const NEED_IDS = new Set(NEEDS.map((n) => n.id));

export function needsInGroup(group: NeedGroup): Need[] {
  return NEEDS.filter((n) => n.group === group);
}

/** The person's chosen needs. Stored only in their own browser; never sent to the server. */
export interface NeedPreferences {
  needs: string[];
  /** Free text for anything not listed. */
  other: string;
}

export const EMPTY_PREFERENCES: NeedPreferences = { needs: [], other: "" };
export const PREFERENCES_KEY = "pathable.needs.v1";

/** Reads stored preferences defensively: unknown ids are dropped and bad data yields none. */
export function parsePreferences(raw: string | null): NeedPreferences {
  if (!raw) return EMPTY_PREFERENCES;
  try {
    const value = JSON.parse(raw) as Partial<NeedPreferences>;
    const needs = Array.isArray(value.needs) ? value.needs.filter((id): id is string => NEED_IDS.has(id as string)) : [];
    const other = typeof value.other === "string" ? value.other.slice(0, 300) : "";
    return { needs: [...new Set(needs)], other };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

/** The groups a person's chosen needs belong to. */
export function groupsOf(preferences: NeedPreferences): NeedGroup[] {
  const chosen = new Set(preferences.needs);
  return NEED_GROUPS.filter((g) => NEEDS.some((n) => n.group === g && chosen.has(n.id)));
}
