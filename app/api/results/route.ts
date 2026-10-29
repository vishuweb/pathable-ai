import { jsonResponse } from "@/lib/http";
import { computeMetrics } from "@/lib/metrics";
import { drafts, reports } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Evaluation metrics as JSON, for the README and offline analysis. */
export async function GET() {
  const [saved, queued] = await Promise.all([reports.list(), drafts.list()]);
  return jsonResponse({
    generatedAt: new Date().toISOString(),
    reviewedPhotos: saved.length,
    pendingReview: queued.length,
    metrics: computeMetrics(saved),
  });
}
