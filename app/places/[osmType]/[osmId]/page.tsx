import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceProfileView } from "@/components/PlaceProfileView";
import { CampusOutline } from "@/components/ui/CampusOutline";
import { PLACE_CATEGORY_LABEL } from "@/lib/place-categories";
import { directoryRetrieved, findInDirectory } from "@/lib/campus-directory";
import { isOwner } from "@/lib/owner";
import { OSM_TYPES, osmUrl, type OsmType } from "@/lib/place";
import { loadPlaceIntelligence } from "@/lib/place-intelligence-store";
import { PlaceServiceError, lookupPlace, type PlaceDetails } from "@/lib/places";
import { activeRegion, inRegion } from "@/lib/region";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ osmType: string; osmId: string }> };

function parseParams(osmType: string, osmId: string): { type: OsmType; id: number } | undefined {
  const type = OSM_TYPES.find((t) => t === osmType);
  const id = Number(osmId);
  return type && Number.isSafeInteger(id) && id > 0 ? { type, id } : undefined;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { osmType, osmId } = await params;
  const ref = parseParams(osmType, osmId);
  const saved = ref && findInDirectory(activeRegion(), ref.type, ref.id);
  const place = saved || (ref ? await lookupPlace(ref.type, ref.id).catch(() => undefined) : undefined);
  return { title: `${place?.name ?? "Place"} · PathAble AI` };
}

export default async function PlacePage({ params }: Params) {
  const { osmType, osmId } = await params;
  const ref = parseParams(osmType, osmId);
  if (!ref) notFound();

  const region = activeRegion();
  const saved = findInDirectory(region, ref.type, ref.id);
  let place: PlaceDetails | undefined;
  let offline = false;
  try {
    place = await lookupPlace(ref.type, ref.id);
  } catch (error) {
    if (!(error instanceof PlaceServiceError)) throw error;
    if (!saved) {
      return (
        <section aria-labelledby="place-title">
          <h1 id="place-title">Place information unavailable</h1>
          <p className="error" role="alert">
            {error.message}
          </p>
        </section>
      );
    }
    // OpenStreetMap is unreachable: show the saved campus directory copy, and say so.
    place = saved;
    offline = true;
  }
  if (!place) notFound();

  if (!inRegion(region, place.latitude, place.longitude)) {
    return (
      <section aria-labelledby="place-title">
        <h1 id="place-title">{place.name}</h1>
        <p className="empty-state">
          This place is outside the {region.name} pilot area, so PathAble AI does not cover it yet.{" "}
          <Link href="/places">Explore places on campus</Link>.
        </p>
      </section>
    );
  }

  const intelligence = await loadPlaceIntelligence(place, place.tags, place.lastEdited, undefined, { latitude: place.latitude, longitude: place.longitude });

  const reportHere = `/report?${new URLSearchParams({
    osm: `${place.osmType}/${place.osmId}`,
    name: place.name,
    lat: String(place.latitude),
    lon: String(place.longitude),
  })}`;

  const edited = place.lastEdited ? ` Last edited in OpenStreetMap on ${place.lastEdited.slice(0, 10)}.` : "";
  const sourceNote =
    `Details marked “Recorded in OpenStreetMap” were added by volunteers and are not checked by PathAble AI. ` +
    `Visitors’ observations start as “Community reported”. “Independently verified” needs a recorded reason from someone other than the person who made the record; approval to publish is not verification. Reports appear here only when they are linked to this place.${edited}` +
    (offline ? ` OpenStreetMap could not be reached just now, so this uses the saved ${region.name} directory from ${directoryRetrieved(region)}.` : "");

  return (
    <article aria-labelledby="place-title" className="place-profile">
      <p className="back-link">
        <Link href="/places">← Explore places</Link>
      </p>
      <header className="place-header">
        <div>
          <p className="eyebrow">{saved ? PLACE_CATEGORY_LABEL[saved.category] : place.kind}</p>
          <h1 id="place-title">{place.name}</h1>
          <p className="muted">
            {region.name}
            {intelligence.summary.lastUpdatedAt ? ` · Last updated ${intelligence.summary.lastUpdatedAt.slice(0, 10)}` : place.lastEdited ? ` · OpenStreetMap record edited ${place.lastEdited.slice(0, 10)}` : ""} ·{" "}
            <a href={osmUrl(place)} target="_blank" rel="noreferrer">
              OpenStreetMap record (opens in a new tab)
            </a>
          </p>
          <p className="muted">
            {intelligence.summary.withRecord} of {intelligence.summary.features} accessibility details recorded
            {intelligence.summary.openBarriers ? ` · ${intelligence.summary.openBarriers} open barrier ${intelligence.summary.openBarriers === 1 ? "report" : "reports"}` : ""}
          </p>
          <div className="place-header-actions">
            <Link className="button-primary" href={reportHere}>
              Report a barrier here
            </Link>
            <a className="button-secondary" href="#contribute">
              Add what you saw
            </a>
          </div>
        </div>
        <figure>
          <CampusOutline region={region} highlight={place} label={`Where ${place.name} is on the ${region.name} campus`} />
          <figcaption>Position on campus</figcaption>
        </figure>
      </header>

      <PlaceProfileView
        place={{ osmType: place.osmType, osmId: place.osmId, name: place.name, latitude: place.latitude, longitude: place.longitude }}
        intelligence={intelligence}
        reportHref={reportHere}
        sourceNote={sourceNote}
        isOwner={await isOwner()}
        canContribute={Boolean(saved)}
      />
    </article>
  );
}
