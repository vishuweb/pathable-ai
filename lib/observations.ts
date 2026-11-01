// Observations: what a visitor saw about one feature of one place, such as "the ramp at the main
// entrance is present" or "the lift is not working". They fill the gaps OpenStreetMap leaves, and
// each one keeps its source and status. Shared by browser and server.
import type { ModerationRecord } from "./moderation";
import type { PlaceRef } from "./place";

export const OBSERVATION_FINDINGS = ["present", "absent", "damaged", "blocked"] as const;
export type ObservationFinding = (typeof OBSERVATION_FINDINGS)[number];

export const FINDING_LABEL: Record<ObservationFinding, string> = {
  present: "Present and usable",
  absent: "Not there",
  damaged: "There, but damaged or not working",
  blocked: "There, but blocked",
};

/** The part of a place an observation or report is about. */
export const PLACE_AREAS = ["entrance", "inside", "path", "crossing", "steps_ramp", "toilet", "parking", "signage", "other"] as const;
export type PlaceArea = (typeof PLACE_AREAS)[number];

export const AREA_LABEL: Record<PlaceArea, string> = {
  entrance: "An entrance",
  inside: "Inside the building",
  path: "A path or footpath",
  crossing: "A crossing",
  steps_ramp: "Steps, a ramp or a lift",
  toilet: "A toilet",
  parking: "Parking or drop-off",
  signage: "Signs or information",
  other: "Somewhere else",
};

export const OBSERVATION_STATUSES = ["community", "verified"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

/** How a new observation relates to one already shown on the place page. */
export const RESPONSE_KINDS = ["confirm", "dispute", "update", "evidence"] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

export const RESPONSE_LABEL: Record<ResponseKind, string> = {
  confirm: "I saw the same",
  dispute: "I saw something different",
  update: "It has changed since",
  evidence: "Adding more evidence",
};

export interface ObservationResponse {
  /** The observation being responded to. */
  id: string;
  kind: ResponseKind;
}

/** An actual spot, as opposed to the place's own position. */
export interface Coordinates {
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres, as reported by the device. */
  accuracyM?: number;
}

export interface ObservationEvent {
  status: ObservationStatus;
  at: string;
  note: string;
}

export interface Observation {
  id: string;
  createdAt: string;
  place: PlaceRef;
  /** The campus place's own position, from the directory (never the visitor's). */
  latitude: number;
  longitude: number;
  /** Where the visitor actually was, when they said so and it is plausibly at this place. */
  observationCoordinates?: Coordinates;
  /** Set when this observation answers one already shown: confirms, disputes, updates or adds evidence to it. */
  respondsTo?: ObservationResponse;
  /** A feature id from lib/place-attributes.ts, e.g. "ramp" or "visual_alarms". */
  featureId: string;
  finding: ObservationFinding;
  area: PlaceArea;
  /** What the visitor saw, in their words. */
  note: string;
  /** The day the visitor saw it (YYYY-MM-DD). */
  observedOn: string;
  hasPhoto: boolean;
  consentedAt: string;
  statusHistory: ObservationEvent[];
  /** Whether the observation is public. Absent on any made before moderation, which count as approved. */
  moderation?: ModerationRecord;
}

export function observationStatus(o: Pick<Observation, "statusHistory">): ObservationStatus {
  return o.statusHistory.at(-1)?.status ?? "community";
}
