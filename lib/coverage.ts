// How much of the campus has been looked at, for the owner's dashboard. Every number has a stated
// definition, and none of them says a place is accessible: a place with no records is unknown, and a
// place with no reported barriers has not been shown to have none. Pure, so it is tested directly.
import { NEED_GROUPS, type NeedGroup } from "./needs";
import { isPublic, moderationState } from "./moderation";
import { observationStatus, type Observation } from "./observations";
import { isStale } from "./place-attributes";
import type { PlaceCategory } from "./place-categories";
import { isStaffSubmitted } from "./place-intelligence";
import type { OsmType } from "./place";
import type { SavedReport } from "./report";
import { currentStatus } from "./report-status";
import { isAssessed, surveyProvenance, type Sublocation, type Survey, type SurveyPriority } from "./survey";
import { findChecklist, type SublocationType } from "./survey-taxonomy";

export interface CoveragePlace {
  osmType: OsmType;
  osmId: number;
  name: string;
  category: PlaceCategory;
}

export interface CoverageInput {
  places: CoveragePlace[];
  surveys: Survey[];
  sublocations: Sublocation[];
  observations: Observation[];
  reports: SavedReport[];
  priorities: SurveyPriority[];
  now?: Date;
}

export interface QueueEntry {
  place: CoveragePlace;
  level: "high" | "normal" | "hold";
  note: string;
  score: number;
  reasons: string[];
  openBarriers: number;
  approvedSurveys: number;
  draftSurveys: number;
}

export interface Coverage {
  directory: { places: number };
  survey: { placesWithApprovedSurvey: number; placesWithAnyDraft: number };
  attributes: { assessed: number; onStartedChecklists: number };
  verified: { places: number; surveyAnswers: number };
  placesWithAnyRecord: number;
  placesAwaitingReview: number;
  placesWithOutdatedRecord: number;
  /** Places with some record and at least one approved checklist line not assessed, or with no approved survey. */
  placesIncomplete: number;
  surveyedSpots: { entrances: number; pathsAndCrossings: number; total: number };
  byNeedGroup: Record<NeedGroup, number>;
  queue: QueueEntry[];
  unsurveyed: CoveragePlace[];
}

const key = (p: { osmType: string; osmId: number }) => `${p.osmType}/${p.osmId}`;

/** Kinds of place most visitors are likely to need first. A starting judgement, not measured use: no usage data exists yet. */
const CATEGORY_WEIGHT: Partial<Record<PlaceCategory, { weight: number; why: string }>> = {
  library: { weight: 30, why: "a library" },
  health: { weight: 30, why: "a healthcare facility" },
  academic: { weight: 25, why: "an academic building" },
  lecture: { weight: 25, why: "a lecture hall" },
  admin: { weight: 20, why: "an administrative office" },
  hostel: { weight: 20, why: "a hostel" },
  food: { weight: 15, why: "a food facility" },
  entrance: { weight: 15, why: "a campus entrance" },
  path: { weight: 10, why: "a path or crossing" },
};

export function computeCoverage(input: CoverageInput): Coverage {
  const now = input.now ?? new Date();
  const known = new Set(input.places.map(key));
  const spotById = new Map(input.sublocations.map((s) => [s.id, s]));
  const approved = input.surveys.filter((s) => s.state === "approved");
  const publicObservations = input.observations.filter(isPublic);
  const publicReports = input.reports.filter((r) => isPublic(r) && r.location?.place);

  const with_ = (rows: { osmType: string; osmId: number }[]) => new Set(rows.map(key).filter((k) => known.has(k)));
  const surveyedPlaces = with_(approved.map((s) => s.place));
  const anyRecord = new Set([...surveyedPlaces, ...with_(publicObservations.map((o) => o.place)), ...with_(publicReports.map((r) => r.location!.place!))]);

  // Verified means a recorded check by someone other than whoever made the record, not approval.
  const verifiedSurveys = approved.filter((s) => surveyProvenance(s) === "verified");
  const verifiedObservations = publicObservations.filter((o) => observationStatus(o) === "verified" && o.statusHistory.at(-1)?.note && !isStaffSubmitted(o));
  const verifiedPlaces = new Set([...with_(verifiedSurveys.map((s) => s.place)), ...with_(verifiedObservations.map((o) => o.place))]);

  const awaiting = new Set([
    ...with_(input.surveys.filter((s) => s.state === "submitted").map((s) => s.place)),
    ...with_(input.observations.filter((o) => moderationState(o) === "pending").map((o) => o.place)),
    ...with_(input.reports.filter((r) => moderationState(r) === "pending" && r.location?.place).map((r) => r.location!.place!)),
  ]);
  const outdated = new Set([
    ...with_(approved.filter((s) => isStale(s.observedOn, now)).map((s) => s.place)),
    ...with_(publicObservations.filter((o) => isStale(o.observedOn, now)).map((o) => o.place)),
  ]);

  let assessed = 0;
  let onStarted = 0;
  const byNeedGroup = Object.fromEntries(NEED_GROUPS.map((g) => [g, 0])) as Record<NeedGroup, number>;
  const fullySurveyed = new Set<string>();
  for (const s of approved) {
    const attributes = findChecklist(s.checklistId)?.attributes ?? [];
    onStarted += attributes.length;
    let done = 0;
    for (const attribute of attributes) {
      if (isAssessed(s.answers[attribute.id])) {
        assessed++;
        done++;
        byNeedGroup[attribute.group]++;
      }
    }
    if (done === attributes.length) fullySurveyed.add(key(s.place));
  }
  const verifiedAnswers = verifiedSurveys.reduce((n, s) => n + Object.values(s.answers).filter(isAssessed).length, 0);

  const spots = new Set<string>();
  const countOf = (types: SublocationType[]) => {
    const ids = new Set(approved.flatMap((s) => (s.sublocationId && types.includes(spotById.get(s.sublocationId)?.type as SublocationType) ? [s.sublocationId] : [])));
    ids.forEach((id) => spots.add(id));
    return ids.size;
  };
  const entrances = countOf(["entrance"]);
  const pathsAndCrossings = countOf(["footpath", "crossing"]);
  for (const s of approved) if (s.sublocationId) spots.add(s.sublocationId);

  const priorityOf = new Map(input.priorities.map((p) => [key(p.place), p]));
  const queue: QueueEntry[] = input.places.map((place) => {
    const k = key(place);
    const priority = priorityOf.get(k);
    const level = priority?.level ?? "normal";
    const reasons: string[] = [];
    let score = 0;
    if (level === "high") {
      score += 100;
      reasons.push(priority?.note ? `You marked it a priority: ${priority.note}` : "You marked it a priority");
    }
    const weight = CATEGORY_WEIGHT[place.category];
    if (weight) {
      score += weight.weight;
      reasons.push(`It is ${weight.why}`);
    }
    const open = publicReports.filter((r) => key(r.location!.place!) === k && !["resolved", "closed"].includes(currentStatus(r).status));
    if (open.length) {
      score += 15 * open.length;
      reasons.push(`${open.length} open barrier ${open.length === 1 ? "report" : "reports"}`);
    }
    const placeSurveys = input.surveys.filter((s) => key(s.place) === k);
    const approvedHere = placeSurveys.filter((s) => s.state === "approved").length;
    const drafts = placeSurveys.filter((s) => s.state === "draft" || s.state === "returned").length;
    if (!approvedHere) {
      score += 20;
      reasons.push("No published survey yet");
    } else {
      score -= 30;
    }
    return { place, level, note: priority?.note ?? "", score, reasons, openBarriers: open.length, approvedSurveys: approvedHere, draftSurveys: drafts };
  });
  queue.sort((a, b) => Number(a.level === "hold") - Number(b.level === "hold") || b.score - a.score || a.place.name.localeCompare(b.place.name));

  return {
    directory: { places: input.places.length },
    survey: { placesWithApprovedSurvey: surveyedPlaces.size, placesWithAnyDraft: with_(input.surveys.filter((s) => s.state === "draft" || s.state === "returned").map((s) => s.place)).size },
    attributes: { assessed, onStartedChecklists: onStarted },
    verified: { places: verifiedPlaces.size, surveyAnswers: verifiedAnswers },
    placesWithAnyRecord: anyRecord.size,
    placesAwaitingReview: awaiting.size,
    placesWithOutdatedRecord: outdated.size,
    placesIncomplete: [...anyRecord].filter((k) => !fullySurveyed.has(k)).length,
    surveyedSpots: { entrances, pathsAndCrossings, total: spots.size },
    byNeedGroup,
    queue,
    unsurveyed: input.places.filter((p) => !surveyedPlaces.has(key(p))),
  };
}
