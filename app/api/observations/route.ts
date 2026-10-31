import { jsonResponse, readJsonBody } from "@/lib/http";
import { parseObservationSubmission } from "@/lib/observation-validate";
import type { Observation } from "@/lib/observations";
import { OSM_TYPES } from "@/lib/place";
import { allowRequest } from "@/lib/rate-limit";
import { observations } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

// A photo (≤8 MB as base64) plus a few short fields.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/** Observations about one place: ?osmType=way&osmId=123. Public, like the place page they appear on. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const osmType = OSM_TYPES.find((t) => t === url.searchParams.get("osmType"));
  const osmId = Number(url.searchParams.get("osmId"));
  if (!osmType || !Number.isSafeInteger(osmId)) return jsonResponse<ApiError>({ error: "Give a place." }, 400);
  const all = await observations.list();
  return jsonResponse({ observations: all.filter((o) => o.place.osmType === osmType && o.place.osmId === osmId) });
}

/** A visitor's observation about a feature of a campus place. Starts as community reported. */
export async function POST(request: Request) {
  if (!(await allowRequest("observe", request))) {
    return jsonResponse<ApiError>({ error: "Too many observations from here. Please try again later." }, 429);
  }
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const submission = parseObservationSubmission(body.value);
  if ("error" in submission) return jsonResponse<ApiError>(submission, 400);

  const { photo, ...rest } = submission;
  const createdAt = new Date().toISOString();
  const observation: Observation = {
    id: crypto.randomUUID(),
    createdAt,
    ...rest,
    hasPhoto: Boolean(photo),
    consentedAt: createdAt,
    statusHistory: [{ status: "community", at: createdAt, note: "" }],
  };
  try {
    if (photo) await observations.save(observation, Buffer.from(photo.slice(photo.indexOf(",") + 1), "base64"));
    else await observations.update(observation);
  } catch (error) {
    console.error("[observations] save failed", error);
    return jsonResponse<ApiError>({ error: "The observation could not be saved. Please try again." }, 500);
  }
  return jsonResponse({ id: observation.id }, 201);
}
