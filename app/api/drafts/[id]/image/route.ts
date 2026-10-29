import { jsonResponse } from "@/lib/http";
import { drafts } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await drafts.getImage(id);
  if (!image) return jsonResponse<ApiError>({ error: "Image not found." }, 404);
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
