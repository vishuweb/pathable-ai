import { jsonResponse, readJsonBody } from "@/lib/http";
import { cleanImage, dataUrlBytes, ImageError } from "@/lib/image-sanitize";
import { backlogFull, initialModeration, publicObservations } from "@/lib/moderation-store";
import { parseObservationSubmission } from "@/lib/observation-validate";
import type { Observation } from "@/lib/observations";
import { requireRole, roleOf } from "@/lib/owner";
import { OSM_TYPES } from "@/lib/place";
import { limitSubmission } from "@/lib/rate-limit";
import { observations } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

// A photo (≤8 MB as base64) plus a few short fields.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/**
 * Observations about one place: ?osmType=way&osmId=123. Only approved ones are public;
 * the owner can ask for the ones still waiting too with &pending=1.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const osmType = OSM_TYPES.find((t) => t === url.searchParams.get("osmType"));
  const osmId = Number(url.searchParams.get("osmId"));
  if (!osmType || !Number.isSafeInteger(osmId)) return jsonResponse<ApiError>({ error: "Give a place." }, 400);

  let all;
  if (url.searchParams.get("pending") === "1") {
    const denied = requireRole(request, "owner");
    if (denied) return denied;
    all = await observations.list();
  } else {
    all = await publicObservations();
  }
  return jsonResponse({ observations: all.filter((o) => o.place.osmType === osmType && o.place.osmId === osmId) });
}

/** A visitor's observation about a feature of a campus place. It waits for the owner's approval. */
export async function POST(request: Request) {
  const limited = await limitSubmission("observation", request);
  if (limited) return jsonResponse<ApiError>({ error: limited.error }, limited.status);
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const submission = parseObservationSubmission(body.value);
  if ("error" in submission) return jsonResponse<ApiError>(submission, 400);
  const backlog = await backlogFull(request);
  if (backlog) return jsonResponse<ApiError>({ error: backlog.error }, backlog.status);

  const { photo, ...rest } = submission;
  let jpeg: Buffer | undefined;
  if (photo) {
    // Re-encoded here, whatever the browser did: this drops GPS and every other piece of metadata.
    try {
      jpeg = (await cleanImage(dataUrlBytes(photo))).jpeg;
    } catch (error) {
      if (error instanceof ImageError) return jsonResponse<ApiError>({ error: error.message }, 400);
      throw error;
    }
  }

  const createdAt = new Date().toISOString();
  const moderation = initialModeration(roleOf(request), createdAt);
  const observation: Observation = {
    id: crypto.randomUUID(),
    createdAt,
    ...rest,
    hasPhoto: Boolean(jpeg),
    consentedAt: createdAt,
    statusHistory: [{ status: "community", at: createdAt, note: "" }],
    moderation,
  };
  try {
    if (jpeg) await observations.save(observation, jpeg);
    else await observations.update(observation);
  } catch (error) {
    console.error("[observations] save failed", error);
    return jsonResponse<ApiError>({ error: "The observation could not be saved. Please try again." }, 500);
  }
  return jsonResponse({ id: observation.id, moderation: moderation.state }, 201);
}
