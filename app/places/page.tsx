import type { Metadata } from "next";
import { PlaceExplorer, type RecentItem } from "@/components/PlaceExplorer";
import { directory, directoryRetrieved } from "@/lib/campus-directory";
import { AREA_LABEL, FINDING_LABEL, observationStatus } from "@/lib/observations";
import { placePath } from "@/lib/place";
import { PLACE_CATEGORIES } from "@/lib/place-categories";
import { PLACE_FEATURES } from "@/lib/place-attributes";
import { featureStatuses } from "@/lib/place-profile";
import { activeRegion } from "@/lib/region";
import { observations } from "@/lib/store";
import type { Provenance } from "@/lib/provenance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore places · PathAble AI" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlacesPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const region = activeRegion();
  const list = directory(region);
  const all = await observations.list();

  const places = list.map((p) => ({
    osmType: p.osmType,
    osmId: p.osmId,
    name: p.name,
    displayName: p.displayName,
    latitude: p.latitude,
    longitude: p.longitude,
    kind: p.kind,
    category: p.category,
  }));

  // What is currently known about each place's features, so the list can show how much is recorded
  // for the visitor's own needs without fetching anything per place.
  const featureIndex: Record<string, [string, Provenance][]> = {};
  for (const p of list) {
    const mine = all.filter((o) => o.place.osmType === p.osmType && o.place.osmId === p.osmId);
    featureIndex[`${p.osmType}${p.osmId}`] = featureStatuses(p.tags, mine, { lastEdited: p.lastEdited }).map((f) => [f.id, f.current]);
  }
  const featureNeeds = Object.fromEntries(PLACE_FEATURES.map((f) => [f.id, f.needIds]));

  const labels = Object.fromEntries(PLACE_FEATURES.map((f) => [f.id, f.label]));
  const recent: RecentItem[] = all
    .slice(-5)
    .reverse()
    .map((o) => ({
      id: o.id,
      placeName: o.place.name,
      placeHref: placePath(o.place),
      text: `${labels[o.featureId] ?? "Feature"}: ${FINDING_LABEL[o.finding].toLowerCase()} (${AREA_LABEL[o.area].toLowerCase()})`,
      date: o.observedOn,
      provenance: observationStatus(o) === "verified" ? ("verified" as const) : ("community" as const),
    }));

  const q = typeof query.q === "string" ? query.q.slice(0, 120) : "";
  const category = PLACE_CATEGORIES.find((c) => c === query.category);

  return (
    <section aria-labelledby="places-title">
      <p className="eyebrow">Pilot area</p>
      <h1 id="places-title">Check a place at {region.name}</h1>
      <p className="intro">
        Search a building, hostel, gate or facility to see what is known about it for your needs, what is still unknown,
        and barriers reported there.
      </p>
      <p className="callout">
        {places.length} places from OpenStreetMap (directory saved {directoryRetrieved(region)}). Many campus places are
        missing, and almost none has accessibility details recorded yet; missing details are shown as unknown, never as
        accessible. Search only shows places inside the campus.
      </p>
      <PlaceExplorer
        regionName={region.name}
        boundary={region.boundary}
        places={places}
        initialQuery={q}
        initialCategory={category}
        featureIndex={featureIndex}
        featureNeeds={featureNeeds}
        recent={recent}
      />
      <p className="muted">
        Map data and place names © OpenStreetMap contributors (ODbL). Campus boundary: OpenStreetMap {region.source.osm}.
      </p>
    </section>
  );
}
