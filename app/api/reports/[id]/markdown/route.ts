import { jsonResponse } from "@/lib/http";
import { visibleReport } from "@/lib/moderation-store";
import { roleOf } from "@/lib/owner";
import { reportToMarkdown } from "@/lib/report-markdown";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** The report as a Markdown maintenance request. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await visibleReport(id, roleOf(request) === "owner");
  if (!report) return jsonResponse<ApiError>({ error: "Report not found." }, 404);
  const reportUrl = new URL(`/reports/${id}`, request.url).toString();
  return new Response(reportToMarkdown(report, reportUrl), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="pathable-report-${id.slice(0, 8)}.md"`,
    },
  });
}
