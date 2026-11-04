import type { Metadata } from "next";
import { PlaceExplorer, type PlaceSignals, type RecentItem } from "@/components/PlaceExplorer";
import { directory, directoryRetrieved } from "@/lib/campus-directory";
import { AREA_LABEL, FINDING_LABEL, observationStatus } from "@/lib/observations";
import { placePath } from "@/lib/place";
import { PLACE_CATEGORIES, SHOW_FILTERS } from "@/lib/place-categories";
import { PLACE_FEATURES } from "@/lib/place-attributes";
import { activeRegion } from "@/lib/region";
import { publicObservations, publicReports } from "@/lib/moderation-store";
import { buildPlaceIntelligence } from "@/lib/place-intelligence";
import { publicSurveys } from "@/lib/survey-store";
import type { Provenance } from "@/lib/provenance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore places · PathAble AI" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlacesPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const region = activeRegion();
  const list = directory(region);
  const now = new Date();
  const [all, reports, surveys] = await Promise.all([publicObservations(), publicReports(), publicSurveys(now)]);

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
  const signals: Record<string, PlaceSignals> = {};
  for (const p of list) {
    const key = `${p.osmType}${p.osmId}`;
    const intel = buildPlaceIntelligence({ place: p, tags: p.tags, lastEdited: p.lastEdited, observations: all, reports, surveys, now });
    featureIndex[key] = intel.features.map((f) => [f.id, f.current]);
    signals[key] = {
      openBarriers: intel.summary.openBarriers,
      surveyed: intel.surveys.some((s) => !s.supersededBy),
      conflicts: intel.summary.conflicts,
      outdated: intel.summary.outdated,
    };
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
  const show = SHOW_FILTERS.find((f) => f === query.show);

  return (
    <section aria-labelledby="places-title">
      <h1 id="places-title">Explore {region.name}</h1>
      <p className="intro">
        See what is known about a place for your needs, what is still unknown, and barriers reported there.
      </p>
      <PlaceExplorer
        regionName={region.name}
        boundary={region.boundary}
        places={places}
        initialQuery={q}
        initialCategory={category}
        featureIndex={featureIndex}
        featureNeeds={featureNeeds}
        signals={signals}
        focusSearch={query.focus === "search"}
        initialShow={show}
        recent={recent}
      />
      <div className="explorer-note">
      <p>
        {places.length} places from OpenStreetMap (saved {directoryRetrieved(region)}). Many campus places are missing and
        almost none has accessibility details recorded yet; missing details show as unknown, never as accessible. Search
        only shows places inside the campus.
      </p>
      <p>
        Map data and place names © OpenStreetMap contributors (ODbL). Campus boundary: OpenStreetMap {region.source.osm}.
      </p>
      </div>
    </section>
  );
}
