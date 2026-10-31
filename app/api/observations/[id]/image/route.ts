import { jsonResponse } from "@/lib/http";
import { visibleObservation } from "@/lib/moderation-store";
import { roleOf } from "@/lib/owner";
import { observations } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** An observation's photo. Visible to anyone once approved, and to the owner before. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await visibleObservation(id, roleOf(request) === "owner"))) return jsonResponse<ApiError>({ error: "Photo not found." }, 404);
  const image = await observations.getImage(id);
  if (!image) return jsonResponse<ApiError>({ error: "Photo not found." }, 404);
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      // Not stored by shared caches or kept by browsers: a deleted or hidden photo must stop being
      // served at once. (This used to be public and immutable for a year.)
      "Cache-Control": "private, no-store",
    },
  });
}
