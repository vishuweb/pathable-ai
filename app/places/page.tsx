import type { Metadata } from "next";
import { PlaceExplorer } from "@/components/PlaceExplorer";

export const metadata: Metadata = { title: "Explore places · PathAble AI" };

export default function PlacesPage() {
  return (
    <section aria-labelledby="places-title">
      <h1 id="places-title">Explore places</h1>
      <p className="intro">
        Look up a station, shop, crossing or building to see the accessibility information OpenStreetMap contributors
        have recorded, item by item, alongside any barriers reported on PathAble AI nearby.
      </p>
      <p className="callout">
        Place information covers the whole world but is only as complete as OpenStreetMap: much of it is often
        missing, and none of it has been verified by PathAble AI. Missing information is always shown as unknown, never
        as accessible.
      </p>
      <PlaceExplorer />
    </section>
  );
}
