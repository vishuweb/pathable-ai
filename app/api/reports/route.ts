import { jsonResponse, readJsonBody } from "@/lib/http";
import type { SaveReportResponse, SavedReport } from "@/lib/report";
import { parseReportDraft } from "@/lib/report-validate";
import { saveReport } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

// Photo (≤8 MB as base64) plus findings, review, and SAM outlines.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

export async function POST(request: Request) {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);

  const draft = parseReportDraft(body.value);
  if ("error" in draft) return jsonResponse<ApiError>({ error: draft.error }, 400);

  const { image, ...rest } = draft;
  const report: SavedReport = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...rest };
  const jpeg = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");

  try {
    await saveReport(report, jpeg);
  } catch (error) {
    console.error("[reports] save failed", error);
    return jsonResponse<ApiError>({ error: "The report could not be saved. Please try again." }, 500);
  }
  return jsonResponse<SaveReportResponse>({ id: report.id }, 201);
}
