import { jsonResponse, readJsonBody } from "@/lib/http";
import { OBSERVATION_STATUSES, observationStatus } from "@/lib/observations";
import { isOwner } from "@/lib/owner";
import { observations } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Owner only: mark an observation independently verified (with a reason), or return it to community reported. */
export async function PATCH(request: Request, { params }: Params) {
  if (!(await isOwner())) return jsonResponse<ApiError>({ error: "Only the project owner can verify observations." }, 403);
  const { id } = await params;
  const observation = await observations.get(id);
  if (!observation) return jsonResponse<ApiError>({ error: "Observation not found." }, 404);
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const status = OBSERVATION_STATUSES.find((s) => s === input.status);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  if (!status) return jsonResponse<ApiError>({ error: "Choose a valid status." }, 400);
  if (status === "verified" && !note) {
    return jsonResponse<ApiError>({ error: "Say how it was verified, for example a site visit on a given date." }, 400);
  }
  if (status === observationStatus(observation) && !note) return jsonResponse<ApiError>({ error: "Nothing changed." }, 400);
  const updated = { ...observation, statusHistory: [...observation.statusHistory, { status, at: new Date().toISOString(), note }] };
  await observations.update(updated);
  return jsonResponse({ statusHistory: updated.statusHistory });
}

/** Owner only: remove an observation, e.g. spam or a photo showing a person. */
export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isOwner())) return jsonResponse<ApiError>({ error: "Only the project owner can delete observations." }, 403);
  const { id } = await params;
  if (!(await observations.get(id))) return jsonResponse<ApiError>({ error: "Observation not found." }, 404);
  await observations.remove(id);
  return new Response(null, { status: 204 });
}
