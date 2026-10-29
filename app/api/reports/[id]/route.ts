import { jsonResponse, readJsonBody } from "@/lib/http";
import { isOwner } from "@/lib/owner";
import { REPORT_STATUSES, STATUS_INFO, currentStatus, statusHistory, type StatusEvent } from "@/lib/report-status";
import { isStoreId, reports } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** The full report as a JSON download. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await reports.get(id);
  if (!report) return jsonResponse<ApiError>({ error: "Report not found." }, 404);
  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pathable-report-${id.slice(0, 8)}.json"`,
    },
  });
}

/** Removes a saved report, e.g. spam or a photo that shows an identifiable person. Owner only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return jsonResponse<ApiError>({ error: "Only the project owner can delete reports." }, 403);
  const { id } = await params;
  if (!(await reports.get(id))) return jsonResponse<ApiError>({ error: "Report not found." }, 404);
  await reports.remove(id);
  return new Response(null, { status: 204 });
}

/** Records a status change, such as "verified" or "resolved", with a note. Owner only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) {
    return jsonResponse<ApiError>({ error: "Only the project owner can change a report's status." }, 403);
  }
  const { id } = await params;
  const report = await reports.get(id);
  if (!report) return jsonResponse<ApiError>({ error: "Report not found." }, 404);

  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const status = REPORT_STATUSES.find((s) => s === input.status);
  if (!status) return jsonResponse<ApiError>({ error: "Choose a valid status." }, 400);
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 1000) return jsonResponse<ApiError>({ error: "The note is longer than 1000 characters." }, 400);
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
