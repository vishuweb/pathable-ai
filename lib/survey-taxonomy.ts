// What a campus field survey can record: the kinds of sublocation, the typed attributes for each
// kind, and the checklists that group them. Each attribute says what it means, what kind of value it
// takes, and what an observation can and cannot establish. No accessibility standard or compliance
// threshold is applied anywhere: values are recorded as observed or measured.
// Shared by browser and server.
import type { NeedGroup } from "./needs";
import type { PlaceArea } from "./observations";

export const SUBLOCATION_TYPES = ["entrance", "ramp", "staircase", "lift", "corridor", "toilet", "parking", "footpath", "crossing", "emergency_exit"] as const;
export type SublocationType = (typeof SUBLOCATION_TYPES)[number];

export const SUBLOCATION_LABEL: Record<SublocationType, string> = {
  entrance: "Entrance",
  ramp: "Ramp",
  staircase: "Staircase",
  lift: "Lift",
  corridor: "Corridor",
  toilet: "Toilet",
  parking: "Parking or drop-off area",
  footpath: "Footpath",
  crossing: "Pedestrian crossing",
  emergency_exit: "Emergency exit",
};

/** The profile's coarser idea of where something is, for each kind of sublocation. */
export const SUBLOCATION_AREA: Record<SublocationType, PlaceArea> = {
  entrance: "entrance",
  ramp: "steps_ramp",
  staircase: "steps_ramp",
  lift: "steps_ramp",
  corridor: "inside",
  toilet: "toilet",
  parking: "parking",
  footpath: "path",
  crossing: "crossing",
  emergency_exit: "entrance",
};

export const STATUS_VALUES = ["present", "absent", "partial", "not_operational", "obstructed", "unknown", "not_applicable"] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

export const STATUS_LABEL: Record<StatusValue, string> = {
  present: "Present",
  absent: "Absent (looked and did not find it)",
  partial: "Partly available",
  not_operational: "Not working when checked",
  obstructed: "Obstructed when checked",
  unknown: "Could not tell",
  not_applicable: "Does not apply here",
};

export const UNITS = ["cm", "mm", "percent", "degrees", "count"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABEL: Record<Unit, string> = { cm: "cm", mm: "mm", percent: "%", degrees: "degrees", count: "" };

export type AttributeValue =
  | { kind: "status"; options: StatusValue[]; labels?: Partial<Record<StatusValue, string>> }
  | { kind: "measure"; units: Unit[]; min: number; max: number }
  | { kind: "choice"; options: { id: string; label: string }[] }
  | { kind: "text" };

export interface SurveyAttribute {
  id: string;
  label: string;
  /** What this attribute means, in plain words. */
  definition: string;
  value: AttributeValue;
  group: NeedGroup;
  /** Preference ids (see lib/needs.ts) this answers. */
  needIds: string[];
  /** The place-profile feature this answers. Only attributes that answer that feature's question directly have one. */
  featureId?: string;
  /** Needed for the checklist to count as covering its core. Never required to save or to submit. */
  core?: boolean;
}

export interface Checklist {
  id: string;
  label: string;
  /** What this survey may be about: the whole place, or a kind of sublocation. */
  targets: ("place" | SublocationType)[];
  inspect: string;
  record: string;
  evidence: string;
  /** What this checklist cannot establish without specialist equipment or further inspection. */
  limits: string;
  attributes: SurveyAttribute[];
}

const COMMON = ["present", "absent", "partial", "not_operational", "obstructed", "unknown", "not_applicable"] as StatusValue[];
const PRESENCE = ["present", "absent", "partial", "unknown", "not_applicable"] as StatusValue[];
const CLEAR_LABELS = { present: "Clear", partial: "Partly clear", obstructed: "Obstructed when checked" };
const CLEAR = ["present", "partial", "obstructed", "unknown", "not_applicable"] as StatusValue[];
const SURFACES = {
  kind: "choice" as const,
  options: [
    { id: "smooth", label: "Smooth and even" },
    { id: "uneven", label: "Uneven" },
    { id: "damaged", label: "Damaged or broken" },
    { id: "loose", label: "Loose (gravel, sand, soil)" },
  ],
};
const WIDTH = { kind: "measure" as const, units: ["cm"] as Unit[], min: 1, max: 2000 };
const SLOPE = { kind: "measure" as const, units: ["percent", "degrees"] as Unit[], min: 0, max: 100 };

const status = (options: StatusValue[], labels?: Partial<Record<StatusValue, string>>): AttributeValue => ({ kind: "status", options, labels });

const entranceAttributes: SurveyAttribute[] = [
  { id: "step_free", label: "Step-free way in", definition: "Whether this way in can be used without any steps.", value: status(COMMON), group: "mobility", needIds: ["step_free", "accessible_entrance"], featureId: "step_free_entrance", core: true },
  { id: "threshold", label: "Threshold height", definition: "Height of the lip or sill at the door, where measured.", value: { kind: "measure", units: ["mm"], min: 0, max: 1000 }, group: "mobility", needIds: ["step_free"] },
  { id: "door_width", label: "Door clear width", definition: "Clear opening of the door, where measured.", value: WIDTH, group: "mobility", needIds: ["accessible_entrance", "wheelchair_paths"], core: true },
  { id: "door_operation", label: "How the door opens", definition: "How the door is operated.", value: { kind: "choice", options: [{ id: "automatic", label: "Automatic" }, { id: "manual", label: "By hand" }, { id: "open", label: "No door, or kept open" }] }, group: "mobility", needIds: ["accessible_entrance"] },
  { id: "kept_clear", label: "Way in kept clear", definition: "Whether anything was in the way at this entrance when it was checked.", value: status(CLEAR, CLEAR_LABELS), group: "mobility", needIds: ["wheelchair_paths"], core: true },
];

export const CHECKLISTS: Checklist[] = [
  {
    id: "building",
    label: "Building accessibility",
    targets: ["place"],
    inspect: "Walk from the nearest path to the main way in, then look for the facilities below.",
    record: "What you saw for each line, and where. Leave a line blank if you did not check it.",
    evidence: "A photo of the way in, and of any facility you record as present.",
    limits: "A walk-through does not show that every floor or door is usable. Record entrances, lifts and toilets separately for detail.",
    attributes: [
      { id: "step_free", label: "Step-free way in (at least one)", definition: "Whether at least one way into the building has no steps.", value: status(COMMON), group: "mobility", needIds: ["step_free", "accessible_entrance"], featureId: "step_free_entrance", core: true },
      { id: "lift", label: "Lift", definition: "Whether the building has a lift, and whether it worked when checked.", value: status(COMMON), group: "mobility", needIds: ["ramps_lifts"], featureId: "lift", core: true },
      { id: "accessible_toilet", label: "Wheelchair-accessible toilet", definition: "Whether the building has a toilet meant for wheelchair users.", value: status(COMMON), group: "mobility", needIds: ["accessible_toilet_mobility", "accessible_toilets"], featureId: "toilets_wheelchair", core: true },
      { id: "signage", label: "Clear signs and directions", definition: "Whether signs tell a newcomer where to go.", value: status(PRESENCE), group: "cognitive", needIds: ["clear_signage", "simple_directions"], featureId: "signage" },
      { id: "visual_alarms", label: "Visual emergency alarms", definition: "Flashing or other visual alarms, seen in place.", value: status(COMMON), group: "hearing", needIds: ["visual_alarms"], featureId: "visual_alarms" },
      { id: "seating", label: "Seating", definition: "Somewhere to sit near the way in or inside.", value: status(PRESENCE), group: "general", needIds: ["seating", "rest_areas"], featureId: "seating" },
    ],
  },
  {
    id: "entrance",
    label: "Entrance accessibility",
    targets: ["entrance", "emergency_exit"],
    inspect: "This one entrance only: the approach, the threshold and the door.",
    record: "Whether it is step-free and clear, and any measurements you took.",
    evidence: "A photo showing the threshold and the door.",
    limits: "An observation of one entrance says nothing about the others. Widths and heights need a tape measure; do not estimate them here.",
    attributes: entranceAttributes,
  },
  {
    id: "ramp",
    label: "Ramp accessibility",
    targets: ["ramp"],
    inspect: "This one ramp: its surface, handrails, width and anything in the way.",
    record: "Its condition now, and measurements only if you took them.",
    evidence: "A photo along the ramp, and one of any obstruction.",
    limits: "A ramp looking gentle does not establish its slope, or that it meets any standard. Slope needs a measured rise and run, or an inclinometer, and the method recorded.",
    attributes: [
      { id: "ramp", label: "Ramp, and whether it was usable", definition: "Whether this ramp exists and could be used when checked.", value: status(COMMON), group: "mobility", needIds: ["ramps_lifts", "step_free"], featureId: "ramp", core: true },
      { id: "slope", label: "Slope, where measured", definition: "Measured slope. Record how it was measured.", value: SLOPE, group: "mobility", needIds: ["gentle_slopes"] },
      { id: "surface", label: "Surface condition", definition: "The condition of the ramp's surface.", value: SURFACES, group: "mobility", needIds: ["smooth_surface"], core: true },
      { id: "handrails", label: "Handrails", definition: "Handrails on the ramp.", value: status(PRESENCE), group: "mobility", needIds: ["ramps_lifts"], core: true },
      { id: "width", label: "Clear width, where measured", definition: "Narrowest clear width, measured.", value: WIDTH, group: "mobility", needIds: ["wheelchair_paths"] },
    ],
  },
  {
    id: "stairs",
    label: "Stairs and handrails",
    targets: ["staircase"],
    inspect: "This one staircase: the steps, handrails, and edge markings.",
    record: "The number of steps if counted, and what you saw.",
    evidence: "A photo from the bottom of the stairs.",
    limits: "Stairs existing does not show that there is no lift or ramp elsewhere.",
    attributes: [
      { id: "step_count", label: "Number of steps, where counted", definition: "Steps counted on site.", value: { kind: "measure", units: ["count"], min: 0, max: 500 }, group: "mobility", needIds: ["step_free"], core: true },
      { id: "handrails", label: "Handrails", definition: "Handrails on the stairs.", value: status(PRESENCE), group: "mobility", needIds: ["step_free"], core: true },
      { id: "edge_markings", label: "Contrasting step edges", definition: "Step edges marked so they can be seen.", value: status(PRESENCE), group: "vision", needIds: ["high_contrast_signs"] },
    ],
  },
  {
    id: "lift",
    label: "Lift accessibility",
    targets: ["lift"],
    inspect: "This one lift: try it if you can, and look at the controls.",
    record: "Whether it worked at the time, the floors it reaches, and the controls.",
    evidence: "A photo of the controls and of any out-of-order notice.",
    limits: "A lift working once says nothing about tomorrow. Record what you saw and when. Announcements can only be recorded if you heard or saw them.",
    attributes: [
      { id: "lift", label: "Lift, and whether it worked", definition: "Whether this lift exists and worked when checked.", value: status(COMMON), group: "mobility", needIds: ["ramps_lifts"], featureId: "lift", core: true },
      { id: "floors", label: "Floors reached", definition: "The floors you saw it serve.", value: { kind: "text" }, group: "mobility", needIds: ["ramps_lifts"], core: true },
      { id: "controls", label: "Controls within reach", definition: "Whether the buttons can be reached from a wheelchair.", value: status(PRESENCE), group: "mobility", needIds: ["ramps_lifts"] },
      { id: "announcements", label: "Floor announcements", definition: "Spoken or visible floor announcements, heard or seen.", value: status(COMMON), group: "vision", needIds: ["audio_guidance", "text_information"] },
    ],
  },
  {
    id: "footpath",
    label: "Footpath accessibility",
    targets: ["footpath", "corridor"],
    inspect: "This one stretch: walk it and note the surface, width and anything in the way.",
    record: "Where it starts and ends in the notes, and what you saw along it.",
    evidence: "A photo along the path, and one of any obstacle or break.",
    limits: "One stretch says nothing about the rest of the route. Width and slope need measuring; a visual estimate is not a measurement.",
    attributes: [
      { id: "kept_clear", label: "Path kept clear", definition: "Whether the path was clear along its length when checked.", value: status(CLEAR, CLEAR_LABELS), group: "mobility", needIds: ["wheelchair_paths"], featureId: "clear_path", core: true },
      { id: "surface", label: "Surface", definition: "The condition of the surface.", value: SURFACES, group: "mobility", needIds: ["smooth_surface"], core: true },
      { id: "width", label: "Narrowest width, where measured", definition: "Narrowest clear width, measured.", value: WIDTH, group: "mobility", needIds: ["wheelchair_paths"] },
      { id: "slope", label: "Slope, where measured", definition: "Steepest measured slope. Record how it was measured.", value: SLOPE, group: "mobility", needIds: ["gentle_slopes"] },
      { id: "tactile", label: "Tactile paving", definition: "Tactile paving along this stretch.", value: status(COMMON), group: "vision", needIds: ["tactile_paving"], featureId: "tactile_paving" },
      { id: "obstacles", label: "Free of obstacles a cane may miss", definition: "Whether anything overhangs or protrudes at head or chest height.", value: status(CLEAR, CLEAR_LABELS), group: "vision", needIds: ["detectable_obstacles"], featureId: "obstacles" },
      { id: "continuity", label: "Continuous along its length", definition: "Whether the path continues without gaps.", value: status(PRESENCE), group: "mobility", needIds: ["wheelchair_paths"] },
      { id: "connections", label: "Crossing connections", definition: "The crossings this stretch connects to.", value: { kind: "text" }, group: "cognitive", needIds: ["less_complex_routes"] },
    ],
  },
  {
    id: "crossing",
    label: "Pedestrian crossing accessibility",
    targets: ["crossing"],
    inspect: "This one crossing, from both sides if you can.",
    record: "Kerbs, markings and signals as you saw and heard them.",
    evidence: "A photo of each kerb and of the signal head.",
    limits: "A photo cannot show whether a signal is audible. Record signals only if you were there and heard or saw them work.",
    attributes: [
      { id: "kerb", label: "Lowered kerb on both sides", definition: "Whether the kerb is lowered on both sides.", value: status(COMMON), group: "mobility", needIds: ["step_free", "wheelchair_paths"], featureId: "kerb", core: true },
      { id: "markings", label: "Visible crossing markings", definition: "Whether the crossing markings can be seen.", value: status(PRESENCE), group: "vision", needIds: ["accessible_crossings"], core: true },
      { id: "tactile", label: "Tactile paving", definition: "Tactile paving at the crossing point.", value: status(COMMON), group: "vision", needIds: ["tactile_paving", "accessible_crossings"], featureId: "tactile_paving" },
      { id: "audible", label: "Audible signal, heard working", definition: "An audible signal, heard on site.", value: status(COMMON), group: "vision", needIds: ["audible_signals"], featureId: "audible_signal" },
      { id: "visual", label: "Visual signal, seen working", definition: "A pedestrian light, seen on site.", value: status(COMMON), group: "hearing", needIds: ["visual_signals"], featureId: "visual_signal" },
    ],
  },
  {
    id: "toilet",
    label: "Accessible toilet facilities",
    targets: ["toilet"],
    inspect: "This one toilet: the way in, the door, the space and the rails.",
    record: "What is there, and any measurements you took.",
    evidence: "A photo of the door and, only when nobody is inside, of the interior. Never photograph people.",
    limits: "Turning space and door width need a tape measure. Whether it is locked or kept clean can change daily.",
    attributes: [
      { id: "accessible_toilet", label: "Wheelchair-accessible toilet", definition: "Whether this toilet is meant for wheelchair users and could be used.", value: status(COMMON), group: "mobility", needIds: ["accessible_toilet_mobility", "accessible_toilets"], featureId: "toilets_wheelchair", core: true },
      { id: "door_width", label: "Door clear width, where measured", definition: "Clear opening, measured.", value: WIDTH, group: "mobility", needIds: ["accessible_toilet_mobility"] },
      { id: "turning", label: "Turning space, where measured", definition: "Clear floor space, measured across the narrowest side.", value: WIDTH, group: "mobility", needIds: ["accessible_toilet_mobility"] },
      { id: "grab_rails", label: "Grab rails", definition: "Rails beside the toilet.", value: status(COMMON), group: "mobility", needIds: ["accessible_toilet_mobility"], core: true },
    ],
  },
  {
    id: "parking",
    label: "Parking and drop-off",
    targets: ["parking"],
    inspect: "This one area: marked spaces, the kerb and the way to the entrance.",
    record: "What is marked and whether the way onward is clear.",
    evidence: "A photo of any marked space. Avoid number plates.",
    limits: "A marked space does not show that it is kept free.",
    attributes: [
      { id: "accessible_parking", label: "Marked accessible spaces or drop-off", definition: "Spaces or a drop-off point marked for disabled people.", value: status(COMMON), group: "mobility", needIds: ["parking_dropoff"], featureId: "parking_dropoff", core: true },
      { id: "spaces", label: "Number of marked spaces, where counted", definition: "Spaces counted on site.", value: { kind: "measure", units: ["count"], min: 0, max: 500 }, group: "mobility", needIds: ["parking_dropoff"] },
      { id: "way_onward", label: "Clear way to the entrance", definition: "Whether the way from here to the entrance was clear.", value: status(CLEAR, CLEAR_LABELS), group: "mobility", needIds: ["wheelchair_paths"], core: true },
    ],
  },
  {
    id: "signage",
    label: "Signage and wayfinding",
    targets: ["place", "entrance", "corridor", "footpath"],
    inspect: "Arrive as a newcomer: can you tell where to go?",
    record: "What the signs say and how readable they are. Note anything confusing.",
    evidence: "A photo of each main sign.",
    limits: "Whether a route feels simple is one person's view; say so in the notes. Contrast is judged by eye here, not measured.",
    attributes: [
      { id: "signage", label: "Clear signs and directions", definition: "Whether signs tell a newcomer where to go.", value: status(PRESENCE), group: "cognitive", needIds: ["clear_signage", "simple_directions"], featureId: "signage", core: true },
      { id: "contrast", label: "High-contrast signs", definition: "Signs that stand out from their background, judged by eye.", value: status(PRESENCE), group: "vision", needIds: ["high_contrast_signs"], featureId: "contrast_signs", core: true },
      { id: "landmarks", label: "Recognisable landmarks", definition: "Landmarks that help a person know where they are.", value: status(PRESENCE), group: "cognitive", needIds: ["landmarks"], featureId: "landmarks" },
      { id: "plain_language", label: "Plain-language instructions", definition: "Instructions in plain words.", value: status(PRESENCE), group: "cognitive", needIds: ["plain_instructions"] },
      { id: "route_changes", label: "Route changes explained", definition: "Whether diversions or closed routes are clearly explained.", value: status(PRESENCE), group: "cognitive", needIds: ["warn_confusing_transitions"] },
      { id: "complex_areas", label: "Hard-to-navigate areas", definition: "Places where people may lose their way, in your words.", value: { kind: "text" }, group: "cognitive", needIds: ["less_complex_routes"] },
    ],
  },
  {
    id: "visual",
    label: "Visual accessibility",
    targets: ["place", "entrance", "corridor", "footpath", "crossing"],
    inspect: "Tactile guidance, obstacles, lighting and orientation information.",
    record: "What you found at this spot, and the time of day for lighting.",
    evidence: "A photo of guidance paths and of any overhanging obstacle.",
    limits: "Lighting depends on the time of day; record it. Only someone who uses the guidance can say how well it works.",
    attributes: [
      { id: "tactile", label: "Tactile paving and guidance paths", definition: "Tactile paving or a guidance path here.", value: status(COMMON), group: "vision", needIds: ["tactile_paving"], featureId: "tactile_paving", core: true },
      { id: "obstacles", label: "Free of obstacles a cane may miss", definition: "Whether anything overhangs or protrudes at head or chest height.", value: status(CLEAR, CLEAR_LABELS), group: "vision", needIds: ["detectable_obstacles"], featureId: "obstacles", core: true },
      { id: "lighting", label: "Lighting", definition: "Whether the area is lit. Note the time of day.", value: status(COMMON), group: "vision", needIds: ["good_lighting"], featureId: "lighting", core: true },
      { id: "audio", label: "Audio guidance", definition: "Spoken or sound guidance, heard on site.", value: status(COMMON), group: "vision", needIds: ["audio_guidance"] },
      { id: "orientation", label: "Orientation information", definition: "Tactile maps, Braille or other orientation information.", value: status(PRESENCE), group: "vision", needIds: ["audio_guidance", "high_contrast_signs"] },
    ],
  },
  {
    id: "hearing",
    label: "Hearing accessibility",
    targets: ["place", "entrance", "corridor"],
    inspect: "Alerts, announcements and how people can ask for help.",
    record: "What is in place, and whether you saw it work.",
    evidence: "A photo of the alarm, notice board or induction loop sign.",
    limits: "A visual alarm can only be recorded as working if you saw it work. A sign for a hearing loop does not show the loop works.",
    attributes: [
      { id: "visual_alarms", label: "Visual emergency alarms", definition: "Flashing or other visual alarms, seen in place.", value: status(COMMON), group: "hearing", needIds: ["visual_alarms"], featureId: "visual_alarms", core: true },
      { id: "written", label: "Written announcements", definition: "Notices or screens giving information in writing.", value: status(COMMON), group: "hearing", needIds: ["text_information"], core: true },
      { id: "hearing_loop", label: "Hearing loop", definition: "A hearing loop or other assistance system.", value: status(COMMON), group: "hearing", needIds: ["communication_support"], featureId: "hearing_loop" },
      { id: "communication", label: "Accessible communication", definition: "Ways to ask for help without speaking, such as a written desk.", value: status(PRESENCE), group: "hearing", needIds: ["communication_support"] },
    ],
  },
  {
    id: "rest",
    label: "Rest and comfort facilities",
    targets: ["place", "entrance", "footpath"],
    inspect: "Places to sit and rest, shelter and toilets nearby.",
    record: "What is there and roughly where, in the notes.",
    evidence: "A photo of seating or shelter.",
    limits: "Comfort depends on the person. Record what is there, not whether it is good enough.",
    attributes: [
      { id: "seating", label: "Seating", definition: "Somewhere to sit.", value: status(COMMON), group: "general", needIds: ["seating", "rest_areas"], featureId: "seating", core: true },
      { id: "shelter", label: "Shelter from the weather", definition: "Cover from sun and rain.", value: status(PRESENCE), group: "general", needIds: ["environment"], featureId: "shelter", core: true },
      { id: "toilets", label: "Toilets nearby", definition: "Public toilets close by.", value: status(COMMON), group: "general", needIds: ["accessible_toilets"], featureId: "toilets" },
      { id: "other", label: "Anything else that helps", definition: "Other needs this place serves, in your words.", value: { kind: "text" }, group: "general", needIds: ["rest_areas"] },
    ],
  },
];

export function findChecklist(id: string): Checklist | undefined {
  return CHECKLISTS.find((c) => c.id === id);
}

export function checklistsFor(target: "place" | SublocationType): Checklist[] {
  return CHECKLISTS.filter((c) => c.targets.includes(target));
}
