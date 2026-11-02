import "server-only";
import { findInDirectory } from "./campus-directory";
import { checkSpot } from "./location-check";
import type { Coordinates } from "./observations";
import { OSM_TYPES, type PlaceRef } from "./place";
import { activeRegion, inRegion } from "./region";
import { sublocations, surveys } from "./store";
import { SOURCE_KINDS, parseAnswer, type SourceKind, type Sublocation, type Survey, type SurveyAnswer } from "./survey";
import { SUBLOCATION_TYPES, findChecklist, type SublocationType } from "./survey-taxonomy";

// Importing survey rows. Validation is the same for a preview and a commit, and a commit refuses any
// file with errors. Imported records never replace anything and are never public or verified on
// arrival: each becomes a new survey waiting for review, keeping the source it says it came from.

export const MAX_IMPORT_ROWS = 2000;

export interface PlannedSurvey {
  key: string;
  place: PlaceRef;
  sublocation?: { type: SublocationType; name: string };
  checklistId: string;
  observedOn: string;
  source: SourceKind;
  reference: string;
  coordinates?: Coordinates;
  answers: Record<string, SurveyAnswer>;
  /** An existing survey saying exactly the same: skipped. */
  duplicateOf?: string;
  /** An existing survey of the same spot and day that says something different: both are kept. */
  conflictsWith?: string;
}

export interface ImportPlan {
  rows: number;
  errors: { row: number; error: string }[];
  surveys: PlannedSurvey[];
}

const text = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  return value === undefined || value === null ? "" : String(value).trim();
};

const sameAnswers = (a: Record<string, SurveyAnswer>, b: Record<string, SurveyAnswer>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => b[k] && String(a[k].value) === String(b[k].value));
};

/** Checks every row. Row numbers count data rows from 1, as a person sees them after the header. */
export async function planImport(rawRows: Record<string, unknown>[]): Promise<ImportPlan> {
  const region = activeRegion();
  const errors: ImportPlan["errors"] = [];
  const groups = new Map<string, PlannedSurvey>();
  const [existing, spots] = await Promise.all([surveys.list(), sublocations.list()]);

  rawRows.forEach((row, index) => {
    const number = index + 1;
    const fail = (error: string) => errors.push({ row: number, error });
    const osmType = OSM_TYPES.find((t) => t === text(row, "place_osm_type"));
    const osmId = Number(text(row, "place_osm_id"));
    const place = osmType && Number.isSafeInteger(osmId) ? findInDirectory(region, osmType, osmId) : undefined;
    if (!place) return fail("The place is not in the campus directory. Use its OpenStreetMap type and id.");

    const checklist = findChecklist(text(row, "checklist"));
    if (!checklist) return fail(`"${text(row, "checklist")}" is not a checklist.`);
    const attribute = checklist.attributes.find((a) => a.id === text(row, "attribute"));
    if (!attribute) return fail(`"${text(row, "attribute")}" is not on the ${checklist.label} checklist.`);

    const answer = parseAnswer(attribute, {
      value: text(row, "value"),
      unit: text(row, "unit") || undefined,
      method: text(row, "method"),
      note: text(row, "note"),
    });
    if ("error" in answer) return fail(answer.error);
    if (attribute.value.kind === "measure" && !answer.method) return fail(`${attribute.label}: say how it was measured.`);

    const observedOn = text(row, "observed_on");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn) || Number.isNaN(Date.parse(observedOn))) return fail("observed_on must be a date like 2026-11-03.");
    if (Date.parse(observedOn) > Date.now() + 24 * 60 * 60 * 1000) return fail("observed_on cannot be in the future.");

    // Verification is earned here, with a recorded check. A spreadsheet cannot claim it.
    const claimed = text(row, "verification_state").toLowerCase();
    if (claimed && claimed !== "unverified") return fail("verification_state cannot be imported. Verify the record after it arrives.");
    const sourceText = text(row, "source") || "owner_recorded";
    const source = SOURCE_KINDS.find((s) => s === sourceText);
    if (!source) return fail(`source must be one of: ${SOURCE_KINDS.join(", ")}.`);

    const typeText = text(row, "sublocation_type");
    const name = text(row, "sublocation_name");
    let sublocation: PlannedSurvey["sublocation"];
    if (typeText || name) {
      const type = SUBLOCATION_TYPES.find((t) => t === typeText);
      if (!type) return fail(`"${typeText}" is not a kind of spot.`);
      if (!name || name.length > 120) return fail("Name the spot in sublocation_name (up to 120 characters).");
      if (!checklist.targets.includes(type)) return fail(`The ${checklist.label} checklist does not apply to a ${type}.`);
      sublocation = { type, name };
    } else if (!checklist.targets.includes("place")) {
      return fail(`The ${checklist.label} checklist is for one specific spot. Fill in sublocation_type and sublocation_name.`);
    }

    let coordinates: Coordinates | undefined;
    if (text(row, "latitude") || text(row, "longitude")) {
      const claimedSpot = { latitude: Number(text(row, "latitude")), longitude: Number(text(row, "longitude")) };
      if (!inRegion(region, claimedSpot.latitude, claimedSpot.longitude)) return fail(`The position is outside the ${region.name} boundary.`);
      const spot = checkSpot(place, claimedSpot);
      if (!spot.ok) return fail(spot.error);
      coordinates = spot.observation;
    }

    const ref: PlaceRef = { osmType: place.osmType, osmId: place.osmId, name: place.name };
    const key = [ref.osmType, ref.osmId, sublocation?.type ?? "", (sublocation?.name ?? "").toLowerCase(), checklist.id, observedOn, source].join("|");
    const group = groups.get(key) ?? { key, place: ref, sublocation, checklistId: checklist.id, observedOn, source, reference: text(row, "source_reference").slice(0, 300), coordinates, answers: {} };
    if (group.answers[attribute.id]) return fail(`${attribute.label} appears twice for the same survey.`);
    group.answers[attribute.id] = answer;
    groups.set(key, group);
  });

  // Against what is already stored: the same statement is skipped, a different one is kept beside it.
  const planned = [...groups.values()];
  for (const group of planned) {
    const spot = group.sublocation && spots.find((s) => s.place.osmType === group.place.osmType && s.place.osmId === group.place.osmId && s.type === group.sublocation!.type && s.name.toLowerCase() === group.sublocation!.name.toLowerCase());
    const sameSpot = existing.filter(
      (s) =>
        s.state !== "rejected" &&
        s.place.osmType === group.place.osmType &&
        s.place.osmId === group.place.osmId &&
        s.checklistId === group.checklistId &&
        s.observedOn === group.observedOn &&
        (group.sublocation ? s.sublocationId === spot?.id && Boolean(spot) : !s.sublocationId),
    );
    const duplicate = sameSpot.find((s) => sameAnswers(s.answers, group.answers));
    if (duplicate) group.duplicateOf = duplicate.id;
    else if (sameSpot[0]) group.conflictsWith = sameSpot[0].id;
  }
  return { rows: rawRows.length, errors, surveys: planned };
}

/** Creates the planned surveys, waiting for review. Nothing existing is changed. Returns how many were made. */
export async function commitImport(plan: ImportPlan, at = new Date().toISOString()): Promise<number> {
  const spots = await sublocations.list();
  let created = 0;
  for (const group of plan.surveys) {
    if (group.duplicateOf) continue;
    let sublocationId: string | undefined;
    if (group.sublocation) {
      const found = spots.find((s) => s.place.osmType === group.place.osmType && s.place.osmId === group.place.osmId && s.type === group.sublocation!.type && s.name.toLowerCase() === group.sublocation!.name.toLowerCase());
      if (found) sublocationId = found.id;
      else {
        const spot: Sublocation = { id: crypto.randomUUID(), createdAt: at, place: group.place, type: group.sublocation.type, name: group.sublocation.name, ...(group.coordinates ? { coordinates: group.coordinates } : {}) };
        await sublocations.update(spot);
        spots.push(spot);
        sublocationId = spot.id;
      }
    }
    const survey: Survey = {
      id: crypto.randomUUID(),
      createdAt: at,
      updatedAt: at,
      place: group.place,
      ...(sublocationId ? { sublocationId } : {}),
      checklistId: group.checklistId,
      observedOn: group.observedOn,
      observer: "owner",
      source: { kind: group.source, ...(group.reference ? { reference: group.reference } : {}) },
      state: "submitted",
      answers: group.answers,
      notes: "",
      privateNotes: group.conflictsWith ? `Imported. Differs from survey ${group.conflictsWith} of the same spot and day.` : "Imported.",
      ...(group.coordinates ? { coordinates: group.coordinates } : {}),
      photoIds: [],
      history: [{ state: "submitted", at, by: "owner", note: "Imported from a file" }],
      checks: [],
    };
    await surveys.update(survey);
    created++;
  }
  return created;
}
