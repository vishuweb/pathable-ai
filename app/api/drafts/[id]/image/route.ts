import { jsonResponse } from "@/lib/http";
import { requireRole } from "@/lib/owner";
import { drafts } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireRole(request, "reviewer");
  if (denied) return denied;
  const { id } = await params;
  const image = await drafts.getImage(id);
  if (!image) return jsonResponse<ApiError>({ error: "Image not found." }, 404);
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
