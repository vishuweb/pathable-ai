import { findInDirectory } from "@/lib/campus-directory";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { cleanImage, dataUrlBytes, ImageError } from "@/lib/image-sanitize";
import { backlogFull, initialModeration } from "@/lib/moderation-store";
import { requireRole, roleOf } from "@/lib/owner";
import { limitSubmission } from "@/lib/rate-limit";
import { activeRegion } from "@/lib/region";
import type { SaveReportResponse, SavedReport } from "@/lib/report";
import { parseReportSubmission } from "@/lib/report-validate";
import { drafts, reports } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

// Photo (≤8 MB as base64) plus findings, review, and SAM outlines.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

export async function POST(request: Request) {
  // Cheapest checks first: nobody can make the server read and decode big bodies in a loop.
  const limited = await limitSubmission("report", request);
  if (limited) return jsonResponse<ApiError>({ error: limited.error }, limited.status);

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);

  const submission = parseReportSubmission(body.value);
  if ("error" in submission) return jsonResponse<ApiError>({ error: submission.error }, 400);

  const { image, draftId, consent, ...rest } = submission;
  // Queue reviews and batch sources are evaluation labels, so only the owner or a reviewer may add them.
  if (draftId || rest.source) {
    const denied = requireRole(request, "reviewer");
    if (denied) return denied;
  }
  const backlog = await backlogFull(request);
  if (backlog) return jsonResponse<ApiError>({ error: backlog.error }, backlog.status);

  let jpeg: Buffer | undefined;
  if (draftId) {
    // Queued photos were cleaned when they were queued.
    jpeg = await drafts.getImage(draftId);
    if (!jpeg) return jsonResponse<ApiError>({ error: "This photo is no longer in the review queue." }, 404);
  } else {
    // A new photo is re-encoded here, whatever the browser did: this drops GPS and every other piece of metadata.
    try {
      const clean = await cleanImage(dataUrlBytes(image!));
      if (clean.width !== rest.width || clean.height !== rest.height) {
        return jsonResponse<ApiError>({ error: "The photo's size does not match the report." }, 400);
      }
      jpeg = clean.jpeg;
    } catch (error) {
      if (error instanceof ImageError) return jsonResponse<ApiError>({ error: error.message }, 400);
      throw error;
    }
  }

  // A chosen campus place always carries the directory's own name and coordinates, never the browser's.
  const place = rest.location?.place && findInDirectory(activeRegion(), rest.location.place.osmType, rest.location.place.osmId);
  const location =
    rest.location && place
      ? {
          ...rest.location,
          place: { osmType: place.osmType, osmId: place.osmId, name: place.name },
          latitude: place.latitude,
          longitude: place.longitude,
        }
      : rest.location;

  const createdAt = new Date().toISOString();
  const moderation = initialModeration(roleOf(request), createdAt);
  const report: SavedReport = {
    id: crypto.randomUUID(),
    createdAt,
    ...rest,
    location,
    consentedAt: consent ? createdAt : undefined,
    statusHistory: [{ status: "submitted", at: createdAt, note: "" }],
    moderation,
  };
  try {
    await reports.save(report, jpeg);
    if (draftId) await drafts.remove(draftId);
  } catch (error) {
    console.error("[reports] save failed", error);
    return jsonResponse<ApiError>({ error: "The report could not be saved. Please try again." }, 500);
  }
  return jsonResponse<SaveReportResponse>({ id: report.id, moderation: moderation.state }, 201);
}
