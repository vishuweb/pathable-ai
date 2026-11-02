import { jsonResponse, readJsonBody } from "@/lib/http";
import { validateImageDataUrl } from "@/lib/image-input";
import { ImageError, cleanImage, dataUrlBytes } from "@/lib/image-sanitize";
import { requireRole } from "@/lib/owner";
import { surveyPhotos, surveys } from "@/lib/store";
import type { SurveyPhoto } from "@/lib/survey";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_PHOTOS = 20;

/** Owner only: adds a photo to a draft survey. It is cleaned on the server like every other photo. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const survey = await surveys.get((await params).id);
  if (!survey) return jsonResponse<ApiError>({ error: "Survey not found." }, 404);
  if (survey.state !== "draft" && survey.state !== "returned") return jsonResponse<ApiError>({ error: "This survey can no longer be changed." }, 400);
  if (survey.photoIds.length >= MAX_PHOTOS) return jsonResponse<ApiError>({ error: `A survey can hold ${MAX_PHOTOS} photos.` }, 400);

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const image = validateImageDataUrl(input.image);
  if (typeof image !== "string") return jsonResponse<ApiError>(image, 400);

  let jpeg: Buffer;
  try {
    jpeg = (await cleanImage(dataUrlBytes(image))).jpeg;
  } catch (error) {
    if (error instanceof ImageError) return jsonResponse<ApiError>({ error: error.message }, 400);
    throw error;
  }
  const at = new Date().toISOString();
  const photo: SurveyPhoto = {
    id: crypto.randomUUID(),
    createdAt: at,
    surveyId: survey.id,
    caption: typeof input.caption === "string" ? input.caption.trim().slice(0, 200) : "",
  };
  await surveyPhotos.save(photo, jpeg);
  await surveys.update({ ...survey, photoIds: [...survey.photoIds, photo.id], updatedAt: at });
  return jsonResponse({ id: photo.id }, 201);
}
