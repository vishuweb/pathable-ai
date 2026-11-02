import { findInDirectory } from "@/lib/campus-directory";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { requireRole } from "@/lib/owner";
import { OSM_TYPES } from "@/lib/place";
import { activeRegion } from "@/lib/region";
import { surveyPriorities } from "@/lib/store";
import { PRIORITY_LEVELS } from "@/lib/survey";
import { priorityId } from "@/lib/survey-store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** Owner only: sets how much a place matters to the survey queue. "hold" is for somewhere not safe or practical to survey now. */
export async function POST(request: Request) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const p = (input.place ?? {}) as Record<string, unknown>;
  const osmType = OSM_TYPES.find((t) => t === p.osmType);
  const place = osmType && findInDirectory(activeRegion(), osmType, Number(p.osmId));
  if (!place) return jsonResponse<ApiError>({ error: "Choose a place from the campus directory." }, 400);
  const level = PRIORITY_LEVELS.find((l) => l === input.level);
  if (!level) return jsonResponse<ApiError>({ error: "Choose high, normal or hold." }, 400);
  const record = {
    id: priorityId(place),
    createdAt: new Date().toISOString(),
    place: { osmType: place.osmType, osmId: place.osmId, name: place.name },
    level,
    note: typeof input.note === "string" ? input.note.trim().slice(0, 300) : "",
  };
  await surveyPriorities.update(record);
  return jsonResponse(record);
}
