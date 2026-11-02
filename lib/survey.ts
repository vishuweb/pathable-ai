// Field surveys: what the project team recorded about one place, or one spot at it, using one
// checklist. A survey starts as a private draft, can be saved half done, and becomes public only
// when an authorized person approves it. Approval does not verify it: "Independently verified" needs
// a recorded check by someone in a different role from whoever recorded it. Shared by browser and server.
import { isStale } from "./place-attributes";
import type { Coordinates } from "./observations";
import type { PlaceRef } from "./place";
import type { Provenance } from "./provenance";
import {
  STATUS_LABEL,
  SUBLOCATION_LABEL,
  UNIT_LABEL,
  findChecklist,
  type Checklist,
  type StatusValue,
  type SublocationType,
  type SurveyAttribute,
  type Unit,
} from "./survey-taxonomy";

export const SURVEY_STATES = ["draft", "submitted", "returned", "approved", "rejected"] as const;
export type SurveyState = (typeof SURVEY_STATES)[number];

export const SURVEY_STATE_LABEL: Record<SurveyState, string> = {
  draft: "Draft",
  submitted: "Waiting for review",
  returned: "Returned for changes",
  approved: "Public",
  rejected: "Rejected",
};

export type StaffRole = "owner" | "reviewer";

/** A specific spot at a place, such as one entrance. Only ever created by staff, for something they found there. */
export interface Sublocation {
  id: string;
  createdAt: string;
  place: PlaceRef;
  type: SublocationType;
  /** How to tell it from others, e.g. "North entrance, by the bicycle stand". */
  name: string;
  coordinates?: Coordinates;
}

export interface SurveyAnswer {
  /** A status or choice id, a number for a measurement, or free text. */
  value: string | number;
  unit?: Unit;
  /** How a measurement was taken. */
  method?: string;
  note?: string;
  /** Photos that show this particular attribute. A photo elsewhere on the survey proves nothing about it. */
  photoIds?: string[];
}

/** Where a record came from. "verified" is not a source: it can only be earned by a recorded check. */
export const SOURCE_KINDS = ["owner_recorded", "community", "reporter_confirmed", "osm", "ai"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SurveySource {
  kind: SourceKind;
  /** Where it came from, for an imported record. */
  reference?: string;
}

export interface SurveyEvent {
  state: SurveyState;
  at: string;
  by: StaffRole;
  note: string;
}

export interface SurveyCheck {
  by: StaffRole;
  at: string;
  /** What the check was based on, e.g. "Went there on 3 Nov with the tape measure". */
  note: string;
}

export interface Survey {
  id: string;
  createdAt: string;
  updatedAt: string;
  place: PlaceRef;
  /** Absent when the survey is about the whole place. */
  sublocationId?: string;
  checklistId: string;
  /** The day the things recorded were seen (YYYY-MM-DD). */
  observedOn: string;
  observer: StaffRole;
  source: SurveySource;
  state: SurveyState;
  answers: Record<string, SurveyAnswer>;
  /** Published with the survey when it is approved. */
  notes: string;
  /** For the team only. Never shown publicly or exported publicly. */
  privateNotes: string;
  coordinates?: Coordinates;
  photoIds: string[];
  history: SurveyEvent[];
  checks: SurveyCheck[];
  /** An earlier survey this one replaces. The earlier one stays in the history. */
  supersedes?: string;
}

export interface SurveyPhoto {
  id: string;
  createdAt: string;
  surveyId: string;
  caption: string;
}

export const PRIORITY_LEVELS = ["high", "normal", "hold"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

/** The owner's own priority for surveying a place. "hold" is for places not safe or practical to survey now. */
export interface SurveyPriority {
  id: string;
  createdAt: string;
  place: PlaceRef;
  level: PriorityLevel;
  note: string;
}

// ------------------------------------------------------------------ answers

/** Checks one raw answer against what its attribute allows; returns the clean answer, or a message. */
export function parseAnswer(attribute: SurveyAttribute, raw: unknown): SurveyAnswer | { error: string } {
  const bad = (why: string) => ({ error: `${attribute.label}: ${why}` });
  if (typeof raw !== "object" || raw === null) return bad("the answer is not readable.");
  const r = raw as Record<string, unknown>;
  const note = typeof r.note === "string" ? r.note.trim().slice(0, 500) : "";
  const photoIds = Array.isArray(r.photoIds) ? r.photoIds.filter((p): p is string => typeof p === "string") : [];
  const base = { ...(note ? { note } : {}), ...(photoIds.length ? { photoIds } : {}) };
  const spec = attribute.value;
  switch (spec.kind) {
    case "status": {
      const value = spec.options.find((o) => o === r.value);
      if (!value) return bad("choose one of the listed options.");
      return { value, ...base };
    }
    case "choice": {
      const value = spec.options.find((o) => o.id === r.value)?.id;
      if (!value) return bad("choose one of the listed options.");
      return { value, ...base };
    }
    case "text": {
      const value = typeof r.value === "string" ? r.value.trim() : "";
      if (!value) return bad("write something, or leave it unanswered.");
      if (value.length > 500) return bad("keep it under 500 characters.");
      return { value, ...base };
    }
    case "measure": {
      const value = typeof r.value === "number" ? r.value : typeof r.value === "string" && r.value.trim() ? Number(r.value) : NaN;
      if (!Number.isFinite(value)) return bad("enter a number.");
      if (value < spec.min || value > spec.max) return bad(`a measurement must be between ${spec.min} and ${spec.max}.`);
      const unit = spec.units.find((u) => u === r.unit) ?? (r.unit == null && spec.units.length === 1 ? spec.units[0] : undefined);
      if (!unit) return bad(`choose a unit (${spec.units.map((u) => u).join(" or ")}).`);
      const method = typeof r.method === "string" ? r.method.trim().slice(0, 200) : "";
      return { value, unit, ...(method ? { method } : {}), ...base };
    }
  }
}

/** Clean answers for a checklist, or the first thing wrong with them. Unknown attributes are refused, not dropped. */
export function parseAnswers(checklist: Checklist, raw: unknown): Record<string, SurveyAnswer> | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: "The answers are not readable." };
  const answers: Record<string, SurveyAnswer> = {};
  for (const [id, value] of Object.entries(raw)) {
    const attribute = checklist.attributes.find((a) => a.id === id);
    if (!attribute) return { error: `"${id}" is not on the ${checklist.label} checklist.` };
    const answer = parseAnswer(attribute, value);
    if ("error" in answer) return answer;
    answers[id] = answer;
  }
  return answers;
}

/** "Could not tell" records that someone looked, but it does not answer the question. */
export function isAssessed(answer: SurveyAnswer | undefined): boolean {
  return Boolean(answer) && answer!.value !== "unknown";
}

export interface SurveyProgress {
  assessed: number;
  total: number;
  coreAssessed: number;
  coreTotal: number;
  notAssessed: SurveyAttribute[];
}

export function surveyProgress(survey: Pick<Survey, "checklistId" | "answers">): SurveyProgress {
  const checklist = findChecklist(survey.checklistId);
  const attributes = checklist?.attributes ?? [];
  const core = attributes.filter((a) => a.core);
  return {
    assessed: attributes.filter((a) => isAssessed(survey.answers[a.id])).length,
    total: attributes.length,
    coreAssessed: core.filter((a) => isAssessed(survey.answers[a.id])).length,
    coreTotal: core.length,
    notAssessed: attributes.filter((a) => !isAssessed(survey.answers[a.id])),
  };
}

/** What stops a survey being submitted. Missing lines are fine: a partial survey is honest about what it left out. */
export function submitProblems(survey: Pick<Survey, "checklistId" | "answers">): string[] {
  const checklist = findChecklist(survey.checklistId);
  if (!checklist) return ["This survey's checklist no longer exists."];
  const problems: string[] = [];
  if (!checklist.attributes.some((a) => isAssessed(survey.answers[a.id]))) problems.push("Record at least one thing you saw before submitting.");
  for (const attribute of checklist.attributes) {
    const answer = survey.answers[attribute.id];
    if (!answer) continue;
    if (answer.value === "absent" && !answer.note) problems.push(`${attribute.label}: say where you looked, so "absent" means it was adequately checked.`);
    if (attribute.value.kind === "measure" && !answer.method) problems.push(`${attribute.label}: say how it was measured.`);
  }
  return problems;
}

export function answerLabel(attribute: SurveyAttribute, answer: SurveyAnswer): string {
  const spec = attribute.value;
  switch (spec.kind) {
    case "status":
      return spec.labels?.[answer.value as StatusValue] ?? STATUS_LABEL[answer.value as StatusValue] ?? String(answer.value);
    case "choice":
      return spec.options.find((o) => o.id === answer.value)?.label ?? String(answer.value);
    case "measure": {
      const unit = answer.unit ? UNIT_LABEL[answer.unit] : "";
      return unit ? `${answer.value} ${unit}` : String(answer.value);
    }
    default:
      return String(answer.value);
  }
}

// ------------------------------------------------------------------ the workflow

export const SURVEY_ACTIONS = ["submit", "approve", "return", "reject", "withdraw", "check"] as const;
export type SurveyAction = (typeof SURVEY_ACTIONS)[number];

/** Whether someone in this role may take this action on a survey in its present state; otherwise why not. */
export function actionProblem(survey: Pick<Survey, "state" | "observer">, action: SurveyAction, role: StaffRole, note: string): string | undefined {
  const state = survey.state;
  switch (action) {
    case "submit":
      if (role !== "owner") return "Only the project owner can submit a survey.";
      return state === "draft" || state === "returned" ? undefined : "Only a draft can be submitted.";
    case "approve":
      return state === "submitted" ? undefined : "Only a survey waiting for review can be approved.";
    case "return":
      if (state !== "submitted") return "Only a survey waiting for review can be returned.";
      return note ? undefined : "Say what needs changing.";
    case "reject":
      if (state !== "submitted") return "Only a survey waiting for review can be rejected.";
      return note ? undefined : "Say why it is being rejected.";
    case "withdraw":
      if (role !== "owner") return "Only the project owner can take a survey off the public site.";
      if (state !== "approved") return "Only a public survey can be withdrawn.";
      return note ? undefined : "Say why it is being withdrawn.";
    case "check":
      if (state !== "submitted" && state !== "approved") return "Only a submitted or public survey can be checked.";
      if (!note) return "Say what the check was based on.";
      if (role === survey.observer) return "A check by the role that recorded it is not independent. Someone else has to do it.";
      return undefined;
  }
}

const NEXT_STATE: Partial<Record<SurveyAction, SurveyState>> = {
  submit: "submitted",
  approve: "approved",
  return: "returned",
  reject: "rejected",
  withdraw: "returned",
};

/** The survey after an allowed action. */
export function applyAction(survey: Survey, action: SurveyAction, role: StaffRole, note: string, at: string): Survey {
  if (action === "check") return { ...survey, updatedAt: at, checks: [...survey.checks, { by: role, at, note }] };
  const state = NEXT_STATE[action]!;
  return { ...survey, state, updatedAt: at, history: [...survey.history, { state, at, by: role, note }] };
}

/** Only a recorded check by a different role makes a survey independently verified. Approval never does. */
export function surveyProvenance(survey: Pick<Survey, "source" | "observer" | "checks">): Provenance {
  if (survey.checks.some((c) => c.by !== survey.observer && c.note.trim())) return "verified";
  return survey.source.kind;
}

// ------------------------------------------------------------------ what the public sees

export interface PublicAnswer {
  attributeId: string;
  label: string;
  value: string;
  raw: string | number;
  group: SurveyAttribute["group"];
  featureId?: string;
  method?: string;
  note?: string;
  photoIds: string[];
}

export interface PublicSurvey {
  id: string;
  place: Pick<PlaceRef, "osmType" | "osmId">;
  checklistId: string;
  checklistLabel: string;
  /** "The whole place", or the sublocation's own name. */
  target: string;
  sublocationId?: string;
  sublocationType?: SublocationType;
  observedOn: string;
  updatedAt: string;
  provenance: Provenance;
  checkNote?: string;
  notes: string;
  coordinates?: Coordinates;
  assessed: PublicAnswer[];
  /** Looked for, but could not tell. */
  couldNotTell: { label: string; group: SurveyAttribute["group"] }[];
  notAssessed: { label: string; group: SurveyAttribute["group"] }[];
  photoIds: string[];
  supersededBy?: string;
  outdated: boolean;
  limits: string;
}

/**
 * The public face of an approved survey. Built field by field, so nothing added to a survey later is
 * published by accident: no private notes, no observer, no workflow history.
 */
export function publicSurvey(survey: Survey, sublocation: Sublocation | undefined, supersededBy: string | undefined, now = new Date()): PublicSurvey | undefined {
  const checklist = findChecklist(survey.checklistId);
  if (survey.state !== "approved" || !checklist) return undefined;
  const check = survey.checks.find((c) => c.by !== survey.observer && c.note.trim());
  const assessed: PublicAnswer[] = [];
  const couldNotTell: PublicSurvey["couldNotTell"] = [];
  const notAssessed: PublicSurvey["notAssessed"] = [];
  for (const attribute of checklist.attributes) {
    const answer = survey.answers[attribute.id];
    if (!answer) notAssessed.push({ label: attribute.label, group: attribute.group });
    else if (answer.value === "unknown") couldNotTell.push({ label: attribute.label, group: attribute.group });
    else {
      assessed.push({
        attributeId: attribute.id,
        label: attribute.label,
        value: answerLabel(attribute, answer),
        raw: answer.value,
        group: attribute.group,
        featureId: attribute.featureId,
        method: answer.method,
        note: answer.note,
        photoIds: answer.photoIds ?? [],
      });
    }
  }
  return {
    id: survey.id,
    place: { osmType: survey.place.osmType, osmId: survey.place.osmId },
    checklistId: checklist.id,
    checklistLabel: checklist.label,
    target: sublocation ? `${SUBLOCATION_LABEL[sublocation.type]}: ${sublocation.name}` : "The whole place",
    sublocationId: sublocation?.id,
    sublocationType: sublocation?.type,
    observedOn: survey.observedOn,
    updatedAt: survey.updatedAt,
    provenance: surveyProvenance(survey),
    checkNote: check?.note,
    notes: survey.notes,
    coordinates: survey.coordinates,
    assessed,
    couldNotTell,
    notAssessed,
    photoIds: survey.photoIds,
    supersededBy,
    outdated: isStale(survey.observedOn, now),
    limits: checklist.limits,
  };
}
