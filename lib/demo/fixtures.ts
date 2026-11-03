// Illustrative scenarios for the demo at /demo. Everything here is invented to show how the product
// behaves. It describes fictional places, not IIT (ISM) Dhanbad, and lives only in this module: it is
// never written to storage, and nothing outside app/demo and components/demo imports it, so it cannot
// reach public reports, coverage or the AI evaluation. Shared by browser and server.
import type { NeedGroup } from "../needs";
import type { Observation } from "../observations";
import type { PlaceRef } from "../place";
import type { SavedReport } from "../report";
import type { IssueCategory } from "../types";

export const DEMO_NOTICE = "Illustrative demo — not verified campus data.";

export type DemoIllustration = "ramp" | "corridor" | "alarm" | "signpost";

export interface DemoCandidate {
  id: string;
  category: IssueCategory;
  title: string;
  observed: string;
  /** Where the AI's outline sits on the illustration, on its 400 by 260 grid. */
  outline: { x: number; y: number; width: number; height: number };
  /** Whether a careful reporter would agree. Shown only after they decide, to explain the point. */
  correct: boolean;
  lesson: string;
}

export interface DemoScenario {
  id: string;
  need: NeedGroup;
  title: string;
  summary: string;
  place: PlaceRef & { category: string };
  /** Other fictional places, so discovery has something to choose between. */
  otherPlaces: string[];
  tags: Record<string, string>;
  observations: Observation[];
  illustration: DemoIllustration;
  illustrationAlt: string;
  candidates: DemoCandidate[];
  /** The feature a visitor is invited to add something about. */
  contributeFeature: string;
}

const place = (osmId: number, name: string): PlaceRef => ({ osmType: "node", osmId, name });
const AT = "2026-10-20T10:00:00Z";

const observation = (osmId: number, name: string, id: number, over: Partial<Observation>): Observation => ({
  id: `d0000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  createdAt: AT,
  place: place(osmId, name),
  latitude: 0,
  longitude: 0,
  featureId: "ramp",
  finding: "present",
  area: "entrance",
  note: "",
  observedOn: "2026-10-20",
  hasPhoto: false,
  consentedAt: AT,
  statusHistory: [{ status: "community", at: AT, note: "" }],
  ...over,
});

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "mobility",
    need: "mobility",
    title: "A blocked ramp",
    summary: "A wheelchair user checks a building before visiting and finds its ramp may be blocked.",
    place: { ...place(900001, "Sample Library"), category: "Library" },
    otherPlaces: ["Sample Hostel", "Sample Canteen"],
    tags: { wheelchair: "limited" },
    observations: [],
    illustration: "ramp",
    illustrationAlt: "Illustration of a ramp beside steps, with a parked scooter across the bottom of the ramp.",
    candidates: [
      { id: "a", category: "blocked_curb_ramp", title: "Scooter at the foot of the ramp", observed: "A parked scooter sits across the lower landing of the ramp.", outline: { x: 225, y: 165, width: 115, height: 75 }, correct: true, lesson: "This is what the picture shows, so confirming it is right. It is still only a report about this ramp, at this moment." },
      { id: "b", category: "damaged_surface", title: "Possible cracked surface", observed: "A dark line on the ramp may be a crack.", outline: { x: 110, y: 95, width: 90, height: 45 }, correct: false, lesson: "It is a shadow. AI suggestions can be wrong, and rejecting this one keeps it off the place page." },
    ],
    contributeFeature: "ramp",
  },
  {
    id: "visual",
    need: "vision",
    title: "An obstacle a cane may miss",
    summary: "A blind visitor looks for hazards along a corridor that a long cane would not detect.",
    place: { ...place(900002, "Sample Academic Block"), category: "Academic building" },
    otherPlaces: ["Sample Lecture Hall", "Sample Workshop"],
    tags: { tactile_paving: "partial" },
    observations: [observation(900002, "Sample Academic Block", 21, { featureId: "lighting", finding: "present", area: "inside", note: "Corridor lights were on at 7 pm." })],
    illustration: "corridor",
    illustrationAlt: "Illustration of a corridor with a wall-mounted box sticking out at head height above a clear floor.",
    candidates: [
      { id: "a", category: "hard_to_detect_obstacle", title: "Box protruding at head height", observed: "A wall box sticks out above the height a cane sweeps.", outline: { x: 250, y: 60, width: 90, height: 60 }, correct: true, lesson: "A cane would pass underneath this, so it matters. The photo cannot say how far it protrudes: that needs measuring." },
    ],
    contributeFeature: "obstacles",
  },
  {
    id: "hearing",
    need: "hearing",
    title: "A missing piece of information",
    summary: "A Deaf student wants to know how fire alarms are signalled, and nobody has recorded it.",
    place: { ...place(900003, "Sample Hostel Block"), category: "Hostel" },
    otherPlaces: ["Sample Library", "Sample Health Centre"],
    tags: {},
    observations: [],
    illustration: "alarm",
    illustrationAlt: "Illustration of a wall with a fire alarm bell and an empty space where a flashing light could be.",
    candidates: [
      { id: "a", category: "other", title: "Alarm bell, no flashing light seen", observed: "A bell is visible. No visual alarm is visible in this view.", outline: { x: 145, y: 55, width: 110, height: 90 }, correct: false, lesson: "One photo cannot show that a building has no visual alarms, or whether this one works. Rejecting it keeps the answer honest: still unknown." },
    ],
    contributeFeature: "visual_alarms",
  },
  {
    id: "wayfinding",
    need: "cognitive",
    title: "A confusing sign",
    summary: "Someone who relies on clear directions meets a sign that points two ways at once.",
    place: { ...place(900004, "Sample Admin Building"), category: "Administration" },
    otherPlaces: ["Sample Gate", "Sample Canteen"],
    tags: {},
    observations: [
      observation(900004, "Sample Admin Building", 41, { featureId: "signage", finding: "present", area: "signage", note: "Signs were easy to follow from the gate.", observedOn: "2026-10-01" }),
      observation(900004, "Sample Admin Building", 42, { featureId: "signage", finding: "damaged", area: "signage", note: "The office sign points two different ways.", observedOn: "2026-10-18", createdAt: "2026-10-21T10:00:00Z" }),
    ],
    illustration: "signpost",
    illustrationAlt: "Illustration of a signpost with two arrows pointing in opposite directions, both labelled Office.",
    candidates: [
      { id: "a", category: "signage_problem", title: "Sign points two ways", observed: "Two arrows point in opposite directions with the same label.", outline: { x: 110, y: 40, width: 180, height: 100 }, correct: true, lesson: "Confirmed by you, but it does not settle the older record saying signs were clear. Both stay visible until someone updates them." },
    ],
    contributeFeature: "signage",
  },
];

export function findScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

/** A sample barrier report for the aggregation, built from the candidates a visitor confirmed. */
export function demoReport(scenario: DemoScenario, confirmed: string[], history: SavedReport["statusHistory"]): SavedReport {
  const candidates = scenario.candidates.filter((c) => confirmed.includes(c.id));
  return {
    id: `d1000000-0000-4000-8000-${String(scenario.place.osmId).padStart(12, "0")}`,
    createdAt: AT,
    width: 400,
    height: 260,
    area: "entrance",
    location: { label: scenario.place.name, place: scenario.place },
    analysis: {
      scene_type: "illustration",
      scene_summary: "",
      image_quality: "good",
      image_quality_notes: "",
      no_findings_reason: "",
      findings: candidates.map((c) => ({
        id: c.id,
        category: c.category,
        title: c.title,
        observed_condition: c.observed,
        why_it_matters: "",
        evidence_phrase: "",
        evidence_box: { x_min: 0, y_min: 0, x_max: 1, y_max: 1 },
        located: true,
        potential_impact: "medium",
        confidence: "medium",
        uncertainty: "",
        suggested_next_step: "",
      })),
    },
    evidence: [],
    models: { analysis: "illustration" },
    reviews: Object.fromEntries(candidates.map((c) => [c.id, { decision: "confirmed", highlight: "correct", note: "" }])),
    missedIssues: [],
    reviewerNote: "",
    timings: { analysisMs: 0, reviewMs: 0 },
    statusHistory: history,
  } as SavedReport;
}
