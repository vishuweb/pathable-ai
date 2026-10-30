import type { Metadata } from "next";
import { PlaceExplorer } from "@/components/PlaceExplorer";
import { directory, directoryRetrieved } from "@/lib/campus-directory";
import { activeRegion } from "@/lib/region";

export const metadata: Metadata = { title: "Explore places · PathAble AI" };

export default function PlacesPage() {
  const region = activeRegion();
  const places = directory(region).map((p) => ({
    osmType: p.osmType,
    osmId: p.osmId,
    name: p.name,
    displayName: p.displayName,
    latitude: p.latitude,
    longitude: p.longitude,
    kind: p.kind,
    category: p.category,
  }));
  return (
    <section aria-labelledby="places-title">
      <p className="eyebrow">Pilot area</p>
      <h1 id="places-title">Explore places at {region.name}</h1>
      <p className="intro">
        PathAble AI currently works on the {region.fullName} campus. Find a building, hostel, gate or facility to see
        its accessibility information and any barriers reported there.
      </p>
      <p className="callout">
        Places come from OpenStreetMap: {places.length} recorded inside the campus boundary (directory saved{" "}
        {directoryRetrieved(region)}). Many campus places, and most accessibility details, are not recorded yet;
        missing information is always shown as unknown, never as accessible. No place has been independently verified
        by PathAble AI so far. Search only ever shows places inside the campus.
      </p>
      <PlaceExplorer regionName={region.name} boundary={region.boundary} places={places} />
      <p className="muted">
        Map data and place names © OpenStreetMap contributors (ODbL). Campus boundary: OpenStreetMap {region.source.osm}.
      </p>
    </section>
  );
}
