import { jsonResponse } from "@/lib/http";
import { PlaceServiceError, searchPlaces } from "@/lib/places";
import { allowRequest } from "@/lib/rate-limit";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** Searches OpenStreetMap for places, e.g. a station, a street corner or a building. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 120) {
    return jsonResponse<ApiError>({ error: "Type between 3 and 120 characters to search." }, 400);
  }
  if (!(await allowRequest("places", request))) {
    return jsonResponse<ApiError>({ error: "Too many searches. Please try again later." }, 429);
  }
  try {
    return jsonResponse({ places: await searchPlaces(query) });
  } catch (error) {
    if (error instanceof PlaceServiceError) return jsonResponse<ApiError>({ error: error.message }, 503);
    console.error("[places] search failed", error);
    return jsonResponse<ApiError>({ error: "The place search failed. Please try again." }, 502);
  }
}
