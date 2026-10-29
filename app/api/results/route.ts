import { jsonResponse } from "@/lib/http";
import { computeMetrics, evaluationReports } from "@/lib/metrics";
import { ownerKeyRequired } from "@/lib/owner";
import { drafts, reports } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Evaluation metrics as JSON, for the README and offline analysis. */
export async function GET() {
  const [saved, queued] = await Promise.all([reports.list(), drafts.list()]);
  const { included, excluded } = evaluationReports(saved, { publicSite: ownerKeyRequired() });
  return jsonResponse({
    generatedAt: new Date().toISOString(),
    reviewedPhotos: included.length,
    singleUploadsNotCounted: excluded,
    pendingReview: queued.length,
    metrics: computeMetrics(included),
  });
}
