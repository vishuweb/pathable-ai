import { jsonResponse } from "@/lib/http";
import { isOwner } from "@/lib/owner";
import { reports } from "@/lib/store";
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
