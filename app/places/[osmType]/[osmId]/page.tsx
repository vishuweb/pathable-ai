import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NearbyReport, PlaceProfileView } from "@/components/PlaceProfileView";
import { directoryRetrieved, findInDirectory } from "@/lib/campus-directory";
import { formatDateTime } from "@/lib/format";
import { isOwner } from "@/lib/owner";
import { OSM_TYPES, distanceMeters, formatDistance, osmUrl, type OsmType } from "@/lib/place";
import { featureStatuses } from "@/lib/place-profile";
import { PlaceServiceError, lookupPlace, type PlaceDetails } from "@/lib/places";
import { activeRegion, inRegion } from "@/lib/region";
import { summarizeReport, verifiedNeeds } from "@/lib/report";
import { STATUS_INFO, currentStatus } from "@/lib/report-status";
import { observations, reports } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Reports this close to a place are listed on its page. */
const NEARBY_METERS = 150;

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

  const here = (await observations.list()).filter((o) => o.place.osmType === place.osmType && o.place.osmId === place.osmId);
  const features = featureStatuses(place.tags, here, { lastEdited: place.lastEdited });

  const nearby = (await reports.list())
    .map((report) => {
      const loc = report.location;
      const samePlace = loc?.place?.osmType === place.osmType && loc.place.osmId === place.osmId;
      const distance =
        loc?.latitude !== undefined && loc.longitude !== undefined
          ? distanceMeters(place, { latitude: loc.latitude, longitude: loc.longitude })
          : undefined;
      return { report, distance: samePlace ? 0 : distance };
    })
    .filter((x) => x.distance !== undefined && x.distance <= NEARBY_METERS)
    .sort((a, b) => a.distance! - b.distance!);

  const reportItems: NearbyReport[] = nearby.map(({ report, distance }) => {
    const status = currentStatus(report).status;
    const s = summarizeReport(report);
    return {
      id: report.id,
      title: `${s.verified} confirmed ${s.verified === 1 ? "barrier" : "barriers"}`,
      distanceLabel: distance === 0 ? "At this place" : `${formatDistance(distance!)} away`,
      dateLabel: formatDateTime(report.createdAt),
      statusKey: status,
      statusLabel: STATUS_INFO[status].label,
      statusNote:
        status === "submitted"
          ? "Confirmed by the person who reported it. Nobody else has checked it yet."
          : STATUS_INFO[status].description,
      needs: verifiedNeeds(report),
    };
  });

  const reportHere = `/report?${new URLSearchParams({
    osm: `${place.osmType}/${place.osmId}`,
    name: place.name,
    lat: String(place.latitude),
    lon: String(place.longitude),
  })}`;

  const edited = place.lastEdited ? ` Last edited in OpenStreetMap on ${place.lastEdited.slice(0, 10)}.` : "";
  const sourceNote =
    `Details marked “Recorded in OpenStreetMap” were added by volunteers and are not checked by PathAble AI. ` +
    `Visitors’ observations start as “Community reported”. Only the project owner can mark something “Independently verified”.${edited}` +
    (offline ? ` OpenStreetMap could not be reached just now, so this uses the saved ${region.name} directory from ${directoryRetrieved(region)}.` : "");

  return (
    <article aria-labelledby="place-title" className="place-profile">
      <p className="back-link">
        <Link href="/places">← Explore places</Link>
      </p>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{place.kind}</p>
          <h1 id="place-title">{place.name}</h1>
          <p className="muted">
            {region.name} ·{" "}
            <a href={osmUrl(place)} target="_blank" rel="noreferrer">
              OpenStreetMap record (opens in a new tab)
            </a>
          </p>
        </div>
        <Link className="button-primary" href={reportHere}>
          Report a barrier here
        </Link>
      </header>

      <PlaceProfileView
        place={{ osmType: place.osmType, osmId: place.osmId, name: place.name, latitude: place.latitude, longitude: place.longitude }}
        features={features}
        reports={reportItems}
        reportHref={reportHere}
        sourceNote={sourceNote}
        isOwner={await isOwner()}
      />
    </article>
  );
}
