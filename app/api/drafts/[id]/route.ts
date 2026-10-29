import { jsonResponse } from "@/lib/http";
import { isOwner } from "@/lib/owner";
import { drafts } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** Removes a photo from the review queue without saving a report (e.g. an unusable photo). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) {
    return jsonResponse<ApiError>({ error: "Only the project owner can change the review queue." }, 403);
  }
  const { id } = await params;
  if (!(await drafts.get(id))) return jsonResponse<ApiError>({ error: "Draft not found." }, 404);
  await drafts.remove(id);
  return new Response(null, { status: 204 });
}
