import { jsonResponse, readJsonBody } from "@/lib/http";
import { sourceKey, type AnalysisDraft, type DraftsSummary, type SaveReportResponse } from "@/lib/report";
import { parseDraftSubmission } from "@/lib/report-validate";
import { drafts, reports } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024 * 1024;

export async function GET() {
  const [queued, saved] = await Promise.all([drafts.list(), reports.list()]);
  const knownSources = [...queued, ...saved].flatMap((item) => (item.source ? [sourceKey(item.source)] : []));
  return jsonResponse<DraftsSummary>({ pending: queued.length, knownSources });
}

/** Adds an analyzed photo to the review queue. */
export async function POST(request: Request) {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);

  const submission = parseDraftSubmission(body.value);
  if ("error" in submission) return jsonResponse<ApiError>({ error: submission.error }, 400);

  const { image, ...rest } = submission;
  const draft: AnalysisDraft = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...rest };
  try {
    await drafts.save(draft, Buffer.from(image.slice(image.indexOf(",") + 1), "base64"));
  } catch (error) {
    console.error("[drafts] save failed", error);
    return jsonResponse<ApiError>({ error: "The photo could not be queued. Please try again." }, 500);
  }
  return jsonResponse<SaveReportResponse>({ id: draft.id }, 201);
}
