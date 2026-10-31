import { jsonResponse } from "@/lib/http";
import { visibleReport } from "@/lib/moderation-store";
import { roleOf } from "@/lib/owner";
import { reports } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** The report's photo. Photos of reports that are not approved yet are visible only to the owner. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await visibleReport(id, roleOf(request) === "owner"))) return jsonResponse<ApiError>({ error: "Image not found." }, 404);
  const image = await reports.getImage(id);
  if (!image) return jsonResponse<ApiError>({ error: "Image not found." }, 404);
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      // Never stored by shared caches or kept by the browser, so deleting or hiding a report takes
      // effect at once instead of leaving the photo reachable from a cache.
      "Cache-Control": "private, no-store",
    },
  });
}
