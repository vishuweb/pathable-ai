import { jsonResponse } from "@/lib/http";
import { PLACE_CATEGORIES } from "@/lib/place-categories";
import { PlaceServiceError, searchPlaces } from "@/lib/places";
import { activeRegion } from "@/lib/region";
import { allowRequest } from "@/lib/rate-limit";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** Searches for places inside the active region (the campus), e.g. a hostel, a library or a gate. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const category = PLACE_CATEGORIES.find((c) => c === url.searchParams.get("category")) ?? undefined;
  if (query.length < 2 || query.length > 120) {
    return jsonResponse<ApiError>({ error: "Type between 2 and 120 characters to search." }, 400);
  }
  if (!(await allowRequest("places", request))) {
    return jsonResponse<ApiError>({ error: "Too many searches. Please try again later." }, 429);
  }
  try {
    const region = activeRegion();
    return jsonResponse({ region: { id: region.id, name: region.name }, places: await searchPlaces(region, query, category) });
  } catch (error) {
    if (error instanceof PlaceServiceError) return jsonResponse<ApiError>({ error: error.message }, 503);
    console.error("[places] search failed", error);
    return jsonResponse<ApiError>({ error: "The place search failed. Please try again." }, 502);
  }
}
