import { jsonResponse, readJsonBody } from "@/lib/http";
import { isOwner } from "@/lib/owner";
import type { SaveReportResponse, SavedReport } from "@/lib/report";
import { parseReportSubmission } from "@/lib/report-validate";
import { drafts, reports } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

// Photo (≤8 MB as base64) plus findings, review, and SAM outlines.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

export async function POST(request: Request) {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);

  const submission = parseReportSubmission(body.value);
  if ("error" in submission) return jsonResponse<ApiError>({ error: submission.error }, 400);

  const { image, draftId, ...rest } = submission;
  // Queue reviews and batch sources are evaluation labels, so only the owner may add them.
  if ((draftId || rest.source) && !(await isOwner())) {
    return jsonResponse<ApiError>({ error: "Only the project owner can save reviews from the queue." }, 403);
  }
  const jpeg = draftId
    ? await drafts.getImage(draftId)
    : Buffer.from(image!.slice(image!.indexOf(",") + 1), "base64");
  if (!jpeg) return jsonResponse<ApiError>({ error: "This photo is no longer in the review queue." }, 404);

  const report: SavedReport = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...rest };
  try {
    await reports.save(report, jpeg);
    if (draftId) await drafts.remove(draftId);
  } catch (error) {
    console.error("[reports] save failed", error);
    return jsonResponse<ApiError>({ error: "The report could not be saved. Please try again." }, 500);
  }
  return jsonResponse<SaveReportResponse>({ id: report.id }, 201);
}
