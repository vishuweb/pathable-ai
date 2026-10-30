// Kinds of campus place, worked out from OpenStreetMap tags and names. Shared by browser and server.
export const PLACE_CATEGORIES = [
  "academic",
  "lecture",
  "library",
  "admin",
  "hostel",
  "residential",
  "food",
  "health",
  "sports",
  "parking",
  "entrance",
  "path",
  "facility",
  "other",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_CATEGORY_LABEL: Record<PlaceCategory, string> = {
  academic: "Academic buildings and departments",
  lecture: "Lecture halls and auditoriums",
  library: "Libraries",
  admin: "Administration",
  hostel: "Hostels",
  residential: "Residential buildings",
  food: "Canteens and food",
  health: "Healthcare",
  sports: "Sports",
  parking: "Parking",
  entrance: "Entrances and gates",
  path: "Paths, roads and crossings",
  facility: "Other facilities",
  other: "Other places",
};

/** The best-fitting category for a place; the first rule that matches wins. */
export function categorize(tags: Record<string, string>, name = ""): PlaceCategory {
  const n = name.toLowerCase();
  const t = (key: string, pattern: RegExp) => pattern.test(tags[key] ?? "");
  if (t("amenity", /^library$/) || /\blibrary\b/.test(n)) return "library";
  if (/lecture|auditori|theatre|conference|hall complex/.test(n) || t("amenity", /^conference_centre$/)) return "lecture";
  // Courts named after a hostel, and staff quarters named "Block A", are sports and residential.
  if (t("leisure", /^(pitch|sports_centre|stadium|track|playground)$/) || /\bcourt\b|stadium|\bgym/.test(n)) return "sports";
  if (/quarter|bungalow|residen/.test(n)) return "residential";
  if (t("tourism", /^hostel$/) || /\bhostel\b/.test(n)) return "hostel";
  if (t("amenity", /^(hospital|clinic|doctors|pharmacy|dentist)$/) || /health|hospital|clinic|dispensary/.test(n)) return "health";
  if (t("amenity", /^(restaurant|fast_food|cafe|canteen|food_court)$/) || t("shop", /^(pastry|tea|bakery|convenience)$/) || /canteen|mess|cafe|food|dosa|momos/.test(n))
    return "food";
  if (t("leisure", /^(pitch|sports_centre|stadium|track|playground)$/) || /ground|court|stadium|gym/.test(n)) return "sports";
  if (t("amenity", /^parking$/)) return "parking";
  if (tags.entrance || /\bgate\b/.test(n)) return "entrance";
  if (tags.highway) return "path";
  if (/main building|administrat|director/.test(n) || tags.office) return "admin";
  if (t("building", /^(university|college)$/) || t("amenity", /^(university|college)$/) || /department|academic|block|science|lab|centre|center|museum/.test(n))
    return "academic";
  if (t("building", /^(house|residential|apartments)$/) || /quarter|bungalow|residen/.test(n)) return "residential";
  if (tags.amenity || tags.shop) return "facility";
  return "other";
}
