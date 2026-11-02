import { findInDirectory } from "@/lib/campus-directory";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { checkSpot } from "@/lib/location-check";
import type { Coordinates } from "@/lib/observations";
import { requireRole } from "@/lib/owner";
import { OSM_TYPES } from "@/lib/place";
import { activeRegion, inRegion } from "@/lib/region";
import { sublocations, surveys } from "@/lib/store";
import type { Sublocation, Survey } from "@/lib/survey";
import { SUBLOCATION_TYPES, findChecklist } from "@/lib/survey-taxonomy";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** Every survey, for the team: owner and reviewers. Never public. */
export async function GET(request: Request) {
  const denied = requireRole(request, "reviewer");
  if (denied) return denied;
  return jsonResponse({ surveys: await surveys.list() });
}

/** Owner only: starts a draft survey of a place, or of a sublocation at it (an existing one, or a new one). */
export async function POST(request: Request) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;

  const p = (input.place ?? {}) as Record<string, unknown>;
  const osmType = OSM_TYPES.find((t) => t === p.osmType);
  const region = activeRegion();
  const place = osmType && findInDirectory(region, osmType, Number(p.osmId));
  if (!place) return jsonResponse<ApiError>({ error: "Choose a place from the campus directory." }, 400);
  const ref = { osmType: place.osmType, osmId: place.osmId, name: place.name };

  const checklist = findChecklist(String(input.checklistId));
  if (!checklist) return jsonResponse<ApiError>({ error: "Choose a checklist." }, 400);

  const observedOn = typeof input.observedOn === "string" ? input.observedOn : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn) || Number.isNaN(Date.parse(observedOn))) {
    return jsonResponse<ApiError>({ error: "Give the day you were there." }, 400);
  }
  if (Date.parse(observedOn) > Date.now() + 24 * 60 * 60 * 1000) return jsonResponse<ApiError>({ error: "The date cannot be in the future." }, 400);

  // Where it was, if given: inside the campus, and plausibly at this place.
  let coordinates: Coordinates | undefined;
  if (input.latitude != null || input.longitude != null) {
    const claimed = { latitude: Number(input.latitude), longitude: Number(input.longitude), accuracyM: input.accuracyM == null ? undefined : Number(input.accuracyM) };
    if (!inRegion(region, claimed.latitude, claimed.longitude)) return jsonResponse<ApiError>({ error: `This location is outside the ${region.name} pilot area.` }, 400);
    const spot = checkSpot(place, claimed);
    if (!spot.ok) return jsonResponse<ApiError>({ error: spot.error }, 400);
    coordinates = spot.observation;
  }

  // The sublocation: an existing one at this same place, or a new one that fits the checklist.
  const now = new Date().toISOString();
  let sublocationId: string | undefined;
  let created: Sublocation | undefined;
  if (typeof input.sublocationId === "string" && input.sublocationId) {
    const existing = await sublocations.get(input.sublocationId);
    if (!existing || existing.place.osmType !== ref.osmType || existing.place.osmId !== ref.osmId) {
      return jsonResponse<ApiError>({ error: "That sublocation is not at this place." }, 400);
    }
    if (!checklist.targets.includes(existing.type)) return jsonResponse<ApiError>({ error: `The ${checklist.label} checklist does not apply to this kind of spot.` }, 400);
    sublocationId = existing.id;
  } else if (input.sublocation != null) {
    const s = input.sublocation as Record<string, unknown>;
    const type = SUBLOCATION_TYPES.find((t) => t === s.type);
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!type) return jsonResponse<ApiError>({ error: "Choose what kind of spot this is." }, 400);
    if (!name || name.length > 120) return jsonResponse<ApiError>({ error: "Name the spot so it can be told apart, for example “North entrance”." }, 400);
    if (!checklist.targets.includes(type)) return jsonResponse<ApiError>({ error: `The ${checklist.label} checklist does not apply to this kind of spot.` }, 400);
    created = { id: crypto.randomUUID(), createdAt: now, place: ref, type, name, ...(coordinates ? { coordinates } : {}) };
    sublocationId = created.id;
  } else if (!checklist.targets.includes("place")) {
    return jsonResponse<ApiError>({ error: `The ${checklist.label} checklist is for one specific spot. Choose or name it.` }, 400);
  }

  let supersedes: string | undefined;
  if (typeof input.supersedes === "string" && input.supersedes) {
    const earlier = await surveys.get(input.supersedes);
    if (!earlier || earlier.place.osmType !== ref.osmType || earlier.place.osmId !== ref.osmId || earlier.checklistId !== checklist.id || earlier.sublocationId !== sublocationId) {
      return jsonResponse<ApiError>({ error: "A new survey can only replace an earlier one of the same spot and checklist." }, 400);
    }
    supersedes = earlier.id;
  }

  const survey: Survey = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    place: ref,
    ...(sublocationId ? { sublocationId } : {}),
    checklistId: checklist.id,
    observedOn,
    observer: "owner",
    source: { kind: "owner_recorded" },
    state: "draft",
    answers: {},
    notes: "",
    privateNotes: "",
    ...(coordinates ? { coordinates } : {}),
    photoIds: [],
    history: [{ state: "draft", at: now, by: "owner", note: "" }],
    checks: [],
    ...(supersedes ? { supersedes } : {}),
  };

  // A likely repeat is reported, not blocked: the owner may really be surveying the same spot twice.
  const similar = (await surveys.list()).find(
    (s) =>
      s.state !== "rejected" &&
      s.place.osmType === ref.osmType &&
      s.place.osmId === ref.osmId &&
      s.checklistId === checklist.id &&
      s.sublocationId === sublocationId &&
      Math.abs(Date.parse(s.observedOn) - Date.parse(observedOn)) <= 14 * 24 * 60 * 60 * 1000,
  );

  if (created) await sublocations.update(created);
  await surveys.update(survey);
  return jsonResponse({ id: survey.id, sublocationId, ...(similar ? { similarTo: similar.id } : {}) }, 201);
}
