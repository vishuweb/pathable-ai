import { jsonResponse } from "@/lib/http";
import { roleOf } from "@/lib/owner";
import { surveyPhotos, surveys } from "@/lib/store";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** A survey photo: for the team at any time, for everyone else only while its survey is public. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const notFound = () => jsonResponse<ApiError>({ error: "Photo not found." }, 404);
  const photo = await surveyPhotos.get(id);
  if (!photo) return notFound();
  const survey = await surveys.get(photo.surveyId);
  if (!survey) return notFound();
  if (survey.state !== "approved" && !roleOf(request)) return notFound();
  const image = await surveyPhotos.getImage(id);
  if (!image) return notFound();
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
