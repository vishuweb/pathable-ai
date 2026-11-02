// Survey records as flat rows, for export and import: one row per recorded attribute.
// Public rows hold only what an approved survey already shows on the site. Shared by browser and server.
import { surveyProvenance, type Sublocation, type Survey } from "./survey";

export const PUBLIC_COLUMNS = [
  "survey_id",
  "place_osm_type",
  "place_osm_id",
  "place_name",
  "sublocation_type",
  "sublocation_name",
  "checklist",
  "attribute",
  "value",
  "unit",
  "method",
  "note",
  "observed_on",
  "latitude",
  "longitude",
  "source",
  "source_reference",
  "provenance",
] as const;

export const FULL_COLUMNS = [...PUBLIC_COLUMNS, "state", "observer", "survey_notes", "private_notes", "updated_at"] as const;

/** Rows for export. `full` is for the owner's backup; the public form is approved surveys and public fields only. */
export function surveyRows(surveys: Survey[], sublocations: Sublocation[], scope: "public" | "full"): Record<string, unknown>[] {
  const spotById = new Map(sublocations.map((s) => [s.id, s]));
  return surveys
    .filter((s) => scope === "full" || s.state === "approved")
    .flatMap((survey) => {
      const spot = survey.sublocationId ? spotById.get(survey.sublocationId) : undefined;
      return Object.entries(survey.answers).map(([attribute, answer]) => ({
        survey_id: survey.id,
        place_osm_type: survey.place.osmType,
        place_osm_id: survey.place.osmId,
        place_name: survey.place.name,
        sublocation_type: spot?.type ?? "",
        sublocation_name: spot?.name ?? "",
        checklist: survey.checklistId,
        attribute,
        value: answer.value,
        unit: answer.unit ?? "",
        method: answer.method ?? "",
        note: answer.note ?? "",
        observed_on: survey.observedOn,
        latitude: survey.coordinates?.latitude ?? "",
        longitude: survey.coordinates?.longitude ?? "",
        source: survey.source.kind,
        source_reference: survey.source.reference ?? "",
        provenance: surveyProvenance(survey),
        ...(scope === "full"
          ? { state: survey.state, observer: survey.observer, survey_notes: survey.notes, private_notes: survey.privateNotes, updated_at: survey.updatedAt }
          : {}),
      }));
    });
}
