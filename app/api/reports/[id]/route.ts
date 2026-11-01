import { findInDirectory } from "@/lib/campus-directory";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { visibleReport } from "@/lib/moderation-store";
import { MODERATION_STATES } from "@/lib/moderation";
import { requireRole, roleOf } from "@/lib/owner";
import { OSM_TYPES } from "@/lib/place";
import { activeRegion } from "@/lib/region";
import { REPORT_STATUSES, STATUS_INFO, currentStatus, statusHistory, type StatusEvent } from "@/lib/report-status";
import { isStoreId, reports } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** The full report as a JSON download. Reports that are not approved yet are visible only to the owner. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await visibleReport(id, roleOf(request) === "owner");
  if (!report) return jsonResponse<ApiError>({ error: "Report not found." }, 404);
  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pathable-report-${id.slice(0, 8)}.json"`,
    },
  });
}

/** Removes a saved report, e.g. spam or a photo that shows an identifiable person. Owner only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const { id } = await params;
  if (!(await reports.get(id))) return jsonResponse<ApiError>({ error: "Report not found." }, 404);
  await reports.remove(id);
  return new Response(null, { status: 204 });
}

/**
 * Owner only. Either records a status change such as "verified" or "resolved" ({ status, note }),
 * or approves or rejects a submission waiting for moderation ({ moderation, note }).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const { id } = await params;
  const report = await reports.get(id);
  if (!report) return jsonResponse<ApiError>({ error: "Report not found." }, 404);

  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 1000) return jsonResponse<ApiError>({ error: "The note is longer than 1000 characters." }, 400);

  if (input.moderation !== undefined) {
    const state = MODERATION_STATES.find((s) => s === input.moderation);
    if (!state) return jsonResponse<ApiError>({ error: "Choose approved or rejected." }, 400);
    const updated = { ...report, moderation: { state, at: new Date().toISOString(), ...(note ? { note } : {}) } };
    await reports.update(updated);
    return jsonResponse({ moderation: updated.moderation });
  }

  if ("place" in input) {
    // The owner ties a report to a campus place, or takes the link off. Reports are never matched to a place by guesswork.
    const at = new Date().toISOString();
    if (input.place === null) {
      const location = { ...(report.location ?? { label: "" }) };
      delete location.place;
      delete location.placeCoordinates;
      const rest = { ...report };
      delete rest.placeAssociation;
      await reports.update({ ...rest, location: location.label || location.latitude !== undefined ? location : undefined });
      return jsonResponse({ place: null });
    }
    const wanted = (input.place ?? {}) as Record<string, unknown>;
    const osmType = OSM_TYPES.find((t) => t === wanted.osmType);
    const place = osmType && findInDirectory(activeRegion(), osmType, Number(wanted.osmId));
    if (!place) return jsonResponse<ApiError>({ error: "Choose a place from the campus directory." }, 400);
    const base = report.location ?? { label: place.name };
    const location = {
      ...base,
      place: { osmType: place.osmType, osmId: place.osmId, name: place.name },
      placeCoordinates: { latitude: place.latitude, longitude: place.longitude },
      latitude: base.latitude ?? place.latitude,
      longitude: base.longitude ?? place.longitude,
    };
    const updated = { ...report, location, placeAssociation: { by: "owner" as const, at, ...(note ? { note } : {}) } };
    await reports.update(updated);
    return jsonResponse({ place: location.place, placeAssociation: updated.placeAssociation });
  }

  const status = REPORT_STATUSES.find((s) => s === input.status);
  if (!status) return jsonResponse<ApiError>({ error: "Choose a valid status." }, 400);
  if (STATUS_INFO[status].needsNote && !note) {
    return jsonResponse<ApiError>({ error: `Add a note saying what "${STATUS_INFO[status].label}" is based on.` }, 400);
  }
  if (status === currentStatus(report).status && !note) {
    return jsonResponse<ApiError>({ error: "Choose a different status, or add a note to record an update." }, 400);
  }

  const event: StatusEvent = { status, at: new Date().toISOString(), note };
  if (input.duplicateOf != null && input.duplicateOf !== "") {
    const duplicateOf = String(input.duplicateOf).trim();
    if (status !== "closed") return jsonResponse<ApiError>({ error: "Only a closed report can be a duplicate." }, 400);
    if (!isStoreId(duplicateOf) || duplicateOf === id || !(await reports.get(duplicateOf))) {
      return jsonResponse<ApiError>({ error: "The duplicate must be the id of another saved report." }, 400);
    }
    event.duplicateOf = duplicateOf;
  }

  const updated = { ...report, statusHistory: [...statusHistory(report), event] };
  await reports.update(updated);
  return jsonResponse({ status: event.status, statusHistory: updated.statusHistory });
}
