"use client";

import { useRouter } from "next/navigation";
import { placePath } from "@/lib/place";
import { PlaceSearch } from "./PlaceSearch";

/** Search for a place and open its profile. */
export function PlaceExplorer() {
  const router = useRouter();
  return <PlaceSearch label="Search for a place" onChoose={(place) => router.push(placePath(place))} />;
}
