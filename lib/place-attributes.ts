// Turns OpenStreetMap tags into accessibility attributes, one per question a person might ask.
// Each attribute stands alone: there is deliberately no overall score, and a missing tag is shown
// as unknown rather than read as good or bad news.
import type { NeedGroup } from "./needs";

export type AttributeState = "community" | "unknown";

export interface PlaceAttribute {
  id: string;
  group: NeedGroup;
  /** Preference ids (see lib/needs.ts) this attribute answers. */
  needIds: string[];
  label: string;
  state: AttributeState;
  /** What OpenStreetMap contributors recorded, in plain words; absent when unknown. */
  value?: string;
  /** Contributors' extra description, if any. */
  detail?: string;
  /** Date this tag was last checked on site, if contributors recorded one (check_date). */
  checked?: string;
}

interface Rule {
  id: string;
  group: NeedGroup;
  needIds: string[];
  label: string;
  keys: string[];
  /** Maps a tag value to plain words; unrecognised values are shown as recorded. */
  read: (value: string, tags: Record<string, string>) => string;
  detailKey?: string;
  /** Shown only for places where the question makes sense. */
  appliesTo?: (tags: Record<string, string>) => boolean;
}

const yesNo = (yes: string, no: string, other: Record<string, string> = {}) => (value: string) =>
  ({ yes, designated: yes, no, ...other })[value] ?? `Recorded as "${value}"`;

const isCrossing = (tags: Record<string, string>) =>
  tags.highway === "crossing" || tags.highway === "traffic_signals" || tags.footway === "crossing" || "crossing" in tags;

const RULES: Rule[] = [
  {
    id: "wheelchair",
    group: "mobility",
    needIds: ["step_free", "wheelchair_paths", "accessible_entrance"],
    label: "Wheelchair access",
    keys: ["wheelchair"],
    read: yesNo("Fully accessible", "Not accessible", { limited: "Partly accessible" }),
    detailKey: "wheelchair:description",
  },
  {
    id: "steps",
    group: "mobility",
    needIds: ["step_free", "accessible_entrance"],
    label: "Steps at the entrance or way in",
    keys: ["step_count"],
    read: (v) => (v === "0" ? "No steps" : `${v} ${v === "1" ? "step" : "steps"}`),
  },
  {
    id: "ramp",
    group: "mobility",
    needIds: ["ramps_lifts", "step_free"],
    label: "Ramp",
    keys: ["ramp:wheelchair", "ramp"],
    read: yesNo("Ramp available", "No ramp"),
  },
  {
    id: "lift",
    group: "mobility",
    needIds: ["ramps_lifts"],
    label: "Lift",
    keys: ["elevator"],
    read: yesNo("Lift recorded (whether it works now is unknown)", "No lift"),
  },
  {
    id: "kerb",
    group: "mobility",
    needIds: ["step_free", "wheelchair_paths"],
    label: "Kerb at the crossing",
    keys: ["kerb"],
    read: (v) => ({ lowered: "Lowered kerb", flush: "Flush, no kerb", raised: "Raised kerb", no: "No kerb" })[v] ?? `Recorded as "${v}"`,
    appliesTo: isCrossing,
  },
  {
    id: "surface",
    group: "mobility",
    needIds: ["smooth_surface"],
    label: "Surface",
    keys: ["surface"],
    read: (v, tags) => (tags.smoothness ? `${v.replaceAll("_", " ")}, ${tags.smoothness.replaceAll("_", " ")} smoothness` : v.replaceAll("_", " ")),
  },
  {
    id: "incline",
    group: "mobility",
    needIds: ["gentle_slopes"],
    label: "Slope",
    keys: ["incline"],
    read: (v) => (v === "0" || v === "0%" ? "Flat" : `Incline ${v}`),
  },
  {
    id: "toilets_wheelchair",
    group: "mobility",
    needIds: ["accessible_toilet_mobility", "accessible_toilets"],
    label: "Wheelchair-accessible toilet",
    keys: ["toilets:wheelchair"],
    read: yesNo("Available", "Not available"),
  },
  {
    id: "tactile_paving",
    group: "vision",
    needIds: ["tactile_paving"],
    label: "Tactile paving",
    keys: ["tactile_paving"],
    read: yesNo("Present", "None", { incorrect: "Present but laid incorrectly", partial: "Only partly present" }),
  },
  {
    id: "audible_signal",
    group: "vision",
    needIds: ["audible_signals", "accessible_crossings"],
    label: "Audible crossing signal",
    keys: ["traffic_signals:sound"],
    read: yesNo("Present", "None", { locate: "Locator tone only", walk: "Sounds when it is safe to cross" }),
    appliesTo: isCrossing,
  },
  {
    id: "lighting",
    group: "vision",
    needIds: ["good_lighting"],
    label: "Lighting",
    keys: ["lit"],
    read: yesNo("Lit", "Not lit", { automatic: "Lit when needed", "24/7": "Lit at all times" }),
  },
  {
    id: "visual_signal",
    group: "hearing",
    needIds: ["visual_signals"],
    label: "Pedestrian traffic lights",
    keys: ["crossing"],
    read: (v) =>
      v === "traffic_signals"
        ? "Traffic lights for pedestrians"
        : ({ uncontrolled: "No traffic lights", marked: "No traffic lights", zebra: "No traffic lights (zebra crossing)", unmarked: "No traffic lights" })[v] ?? `Recorded as "${v}"`,
    appliesTo: isCrossing,
  },
  {
    id: "vibration_signal",
    group: "hearing",
    needIds: ["vibration_alerts"],
    label: "Vibrating crossing signal",
    keys: ["traffic_signals:vibration"],
    read: yesNo("Present", "None"),
    appliesTo: isCrossing,
  },
  {
    id: "written_information",
    group: "hearing",
    needIds: ["text_information"],
    label: "Written departure information",
    keys: ["passenger_information_display", "departures_board"],
    read: yesNo("Display present", "No display", { realtime: "Live display", timetable: "Printed timetable" }),
    appliesTo: (tags) => tags.public_transport === "platform" || tags.highway === "bus_stop" || tags.railway === "platform",
  },
  {
    id: "hearing_loop",
    group: "hearing",
    needIds: ["communication_support"],
    label: "Hearing loop",
    keys: ["hearing_loop", "induction_loop"],
    read: yesNo("Available", "Not available"),
  },
  {
    id: "seating",
    group: "general",
    needIds: ["seating", "rest_areas"],
    label: "Seating",
    keys: ["bench"],
    read: yesNo("Seating available", "No seating"),
  },
  {
    id: "shelter",
    group: "general",
    needIds: ["environment"],
    label: "Shelter from the weather",
    keys: ["shelter"],
    read: yesNo("Sheltered", "No shelter"),
  },
  {
    id: "toilets",
    group: "general",
    needIds: ["accessible_toilets"],
    label: "Public toilets",
    keys: ["toilets"],
    read: yesNo("Available", "Not available"),
  },
  {
    id: "parking_dropoff",
    group: "mobility",
    needIds: ["parking_dropoff"],
    label: "Accessible parking or drop-off",
    keys: ["capacity:disabled"],
    read: (v) => (v === "0" || v === "no" ? "No accessible spaces" : v === "yes" ? "Accessible spaces available" : `${v} accessible spaces`),
  },
  // OpenStreetMap has no reliable tags for the features below, so they are known only from
  // observations people contribute; until then they are unknown.
  {
    id: "obstacles",
    group: "vision",
    needIds: ["detectable_obstacles"],
    label: "Obstacles a cane may miss on the way in",
    keys: [],
    read: (v) => v,
  },
  {
    id: "contrast_signs",
    group: "vision",
    needIds: ["high_contrast_signs", "audio_guidance"],
    label: "High-contrast or audio guidance signs",
    keys: [],
    read: (v) => v,
  },
  {
    id: "visual_alarms",
    group: "hearing",
    needIds: ["visual_alarms", "text_information"],
    label: "Visual emergency alarms and written notices",
    keys: [],
    read: (v) => v,
  },
  {
    id: "signage",
    group: "cognitive",
    needIds: ["clear_signage", "simple_directions", "plain_instructions"],
    label: "Clear signs and directions",
    keys: [],
    read: (v) => v,
  },
  {
    id: "landmarks",
    group: "cognitive",
    needIds: ["landmarks", "less_complex_routes", "warn_confusing_transitions"],
    label: "Recognisable landmarks and a simple way in",
    keys: [],
    read: (v) => v,
  },
];

/** Every feature a place profile can describe, with its label, group and the needs it serves. */
export const PLACE_FEATURES = RULES.map(({ id, group, needIds, label, appliesTo }) => ({ id, group, needIds, label, crossingOnly: appliesTo === isCrossing }));

/** True for features OpenStreetMap can hold; the rest come only from contributed observations. */
export function osmCanRecord(featureId: string): boolean {
  return (RULES.find((r) => r.id === featureId)?.keys.length ?? 0) > 0;
}

/** The accessibility attributes of a place, known and unknown, in a stable order. */
export function placeAttributes(tags: Record<string, string>): PlaceAttribute[] {
  return RULES.filter((rule) => !rule.appliesTo || rule.appliesTo(tags)).map((rule) => {
    const key = rule.keys.find((k) => tags[k]);
    const base = { id: rule.id, group: rule.group, needIds: rule.needIds, label: rule.label };
    if (!key) return { ...base, state: "unknown" };
    return {
      ...base,
      state: "community",
      value: rule.read(tags[key].trim(), tags),
      detail: rule.detailKey ? tags[rule.detailKey]?.slice(0, 300) : undefined,
      checked: tags[`check_date:${key}`] ?? tags.check_date,
    };
  });
}

/** Information older than this is flagged as possibly out of date. */
export const STALE_AFTER_YEARS = 2;

/** True when a date is missing-safe and older than the staleness limit. */
export function isStale(date: string | undefined, now = new Date()): boolean {
  if (!date) return false;
  const time = Date.parse(date);
  if (Number.isNaN(time)) return false;
  return now.getTime() - time > STALE_AFTER_YEARS * 365.25 * 24 * 60 * 60 * 1000;
}
