import { jsonResponse, readJsonBody } from "@/lib/http";
import { MODERATION_STATES } from "@/lib/moderation";
import { OBSERVATION_STATUSES, observationStatus } from "@/lib/observations";
import { requireRole } from "@/lib/owner";
import { observations } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Owner only. Either approves or rejects an observation waiting for moderation ({ moderation, note }),
 * or marks it independently verified, with a reason, or back to community reported ({ status, note }).
 */
export async function PATCH(request: Request, { params }: Params) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const { id } = await params;
  const observation = await observations.get(id);
  if (!observation) return jsonResponse<ApiError>({ error: "Observation not found." }, 404);
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";

  if (input.moderation !== undefined) {
    const state = MODERATION_STATES.find((s) => s === input.moderation);
    if (!state) return jsonResponse<ApiError>({ error: "Choose approved or rejected." }, 400);
    const updated = { ...observation, moderation: { state, at: new Date().toISOString(), ...(note ? { note } : {}) } };
    await observations.update(updated);
    return jsonResponse({ moderation: updated.moderation });
  }

  const status = OBSERVATION_STATUSES.find((s) => s === input.status);
  if (!status) return jsonResponse<ApiError>({ error: "Choose a valid status." }, 400);
  if (status === "verified" && !note) {
    return jsonResponse<ApiError>({ error: "Say how it was verified, for example a site visit on a given date." }, 400);
  }
  if (status === observationStatus(observation) && !note) return jsonResponse<ApiError>({ error: "Nothing changed." }, 400);
  const updated = { ...observation, statusHistory: [...observation.statusHistory, { status, at: new Date().toISOString(), note }] };
  await observations.update(updated);
  return jsonResponse({ statusHistory: updated.statusHistory });
}

/** Owner only: remove an observation and its photo, e.g. spam or a photo showing a person. */
export async function DELETE(request: Request, { params }: Params) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const { id } = await params;
  if (!(await observations.get(id))) return jsonResponse<ApiError>({ error: "Observation not found." }, 404);
  await observations.remove(id);
  return new Response(null, { status: 204 });
}
