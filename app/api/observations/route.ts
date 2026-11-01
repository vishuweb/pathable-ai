import { jsonResponse, readJsonBody } from "@/lib/http";
import { cleanImage, dataUrlBytes, ImageError } from "@/lib/image-sanitize";
import { isPublic } from "@/lib/moderation";
import { backlogFull, initialModeration, publicObservations } from "@/lib/moderation-store";
import { parseObservationSubmission } from "@/lib/observation-validate";
import type { Observation } from "@/lib/observations";
import { requireRole, roleOf } from "@/lib/owner";
import { OSM_TYPES } from "@/lib/place";
import { DUPLICATE_WINDOW_DAYS } from "@/lib/place-intelligence";
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

  const { photo, ...submitted } = submission;
  let rest = submitted;

  // Answering an earlier observation: it must be public and be about this same feature at this same place.
  if (rest.respondsTo) {
    const target = await observations.get(rest.respondsTo.id);
    if (!target || !isPublic(target) || target.place.osmType !== rest.place.osmType || target.place.osmId !== rest.place.osmId || target.featureId !== rest.featureId) {
      return jsonResponse<ApiError>({ error: "That observation could not be answered." }, 400);
    }
    const { kind } = rest.respondsTo;
    if (kind === "confirm" || kind === "evidence") {
      // Agreeing with it or adding to it means saying what it says, about the same spot.
      rest = { ...rest, finding: target.finding, area: target.area };
    } else if (kind === "dispute" && rest.finding === target.finding) {
      return jsonResponse<ApiError>({ error: "That matches the earlier observation. Choose “I saw the same” instead." }, 400);
    } else if (kind === "update" && rest.finding === target.finding && rest.area === target.area) {
      return jsonResponse<ApiError>({ error: "That is what was already recorded. Tell us what has changed." }, 400);
    }
  }
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
  // The same thing seen before is counted together with it on the place page, however it is worded.
  const similar = rest.respondsTo ? undefined : await findSimilar(observation);
  try {
    if (jpeg) await observations.save(observation, jpeg);
    else await observations.update(observation);
  } catch (error) {
    console.error("[observations] save failed", error);
    return jsonResponse<ApiError>({ error: "The observation could not be saved. Please try again." }, 500);
  }
  return jsonResponse({ id: observation.id, moderation: moderation.state, ...(similar ? { similarTo: similar } : {}) }, 201);
}

/** An approved observation of the same feature, spot and finding from around the same time. */
async function findSimilar(created: Observation): Promise<string | undefined> {
  const day = 24 * 60 * 60 * 1000;
  const near = (await publicObservations()).find(
    (o) =>
      o.id !== created.id &&
      o.place.osmType === created.place.osmType &&
      o.place.osmId === created.place.osmId &&
      o.featureId === created.featureId &&
      o.area === created.area &&
      o.finding === created.finding &&
      Math.abs(Date.parse(o.observedOn) - Date.parse(created.observedOn)) <= DUPLICATE_WINDOW_DAYS * day,
  );
  return near?.id;
}
