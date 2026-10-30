import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NeedChips } from "@/components/NeedChips";
import { PlaceNeedsSummary } from "@/components/PlaceNeedsSummary";
import { formatDateTime } from "@/lib/format";
import { NEED_GROUPS, NEED_GROUP_INFO } from "@/lib/needs";
import { OSM_TYPES, distanceMeters, formatDistance, osmUrl, type OsmType } from "@/lib/place";
import { STALE_AFTER_YEARS, isStale, placeAttributes } from "@/lib/place-attributes";
import { directoryRetrieved, findInDirectory } from "@/lib/campus-directory";
import { PlaceServiceError, lookupPlace, type PlaceDetails } from "@/lib/places";
import { activeRegion, inRegion } from "@/lib/region";
import { summarizeReport, verifiedNeeds } from "@/lib/report";
import { STATUS_INFO, currentStatus } from "@/lib/report-status";
import { reports } from "@/lib/store";

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
  const place = ref ? await lookupPlace(ref.type, ref.id).catch(() => undefined) : undefined;
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

  const attributes = placeAttributes(place.tags);
  const known = attributes.filter((a) => a.state === "community").length;
  const editedStale = isStale(place.lastEdited);
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

  const reportHere = `/report?${new URLSearchParams({
    osm: `${place.osmType}/${place.osmId}`,
    name: place.name,
    lat: String(place.latitude),
    lon: String(place.longitude),
  })}`;

  return (
    <article aria-labelledby="place-title" className="place-profile">
      <p className="back-link">
        <Link href="/places">← Explore places</Link>
      </p>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{place.kind}</p>
          <h1 id="place-title">{place.name}</h1>
          <p className="muted">{place.displayName}</p>
        </div>
        <Link className="button-primary" href={reportHere}>
          Report a barrier here
        </Link>
      </header>

      <p className="source-note">
        <strong>Source: recorded in OpenStreetMap.</strong> Not added by PathAble AI users, and not independently
        verified.{" "}
        {offline &&
          `OpenStreetMap could not be reached just now, so this is the saved ${region.name} directory from ${directoryRetrieved(region)}. `}
        The information below was recorded by{" "}
        <a href={osmUrl(place)} target="_blank" rel="noreferrer">
          OpenStreetMap contributors (opens in a new tab)
        </a>
        . PathAble AI has not verified it. {known} of {attributes.length} items are recorded; anything missing is shown
        as unknown. This page never rates a place as accessible overall.{" "}
        {place.lastEdited && (
          <>
            Last edited in OpenStreetMap: <time dateTime={place.lastEdited}>{formatDateTime(place.lastEdited)}</time>.
            {editedStale && ` That is more than ${STALE_AFTER_YEARS} years ago, so it may be out of date.`}
          </>
        )}
      </p>

      <PlaceNeedsSummary attributes={attributes} />

      {NEED_GROUPS.map((group) => {
        const items = attributes.filter((a) => a.group === group);
        if (!items.length) return null;
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="attribute-group">
            <h2 id={`group-${group}`}>{NEED_GROUP_INFO[group].label}</h2>
            <dl className="attributes">
              {items.map((a) => (
                <div key={a.id} className={`attribute state-${a.state}`}>
                  <dt>{a.label}</dt>
                  <dd>
                    {a.state === "community" ? (
                      <>
                        <span className="attribute-value">{a.value}</span>
                        <span className="attribute-source">
                          Community data, not verified
                          {a.checked && `, checked on site ${a.checked}`}
                          {isStale(a.checked) && " (may be out of date)"}
                        </span>
                        {a.detail && <span className="attribute-detail">{a.detail}</span>}
                      </>
                    ) : (
                      <span className="attribute-value">Unknown: not recorded</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <section aria-labelledby="nearby-title" className="attribute-group">
        <h2 id="nearby-title">PathAble reports here</h2>
        {nearby.length === 0 ? (
          <p className="empty-state">
            No barrier has been reported within {formatDistance(NEARBY_METERS)} of this place. That does not mean there
            are none. <Link href={reportHere}>Report one</Link>.
          </p>
        ) : (
          <ul className="report-list">
            {nearby.map(({ report, distance }) => {
              const status = currentStatus(report).status;
              const s = summarizeReport(report);
              return (
                <li key={report.id} className="report-item">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
                  <img src={`/api/reports/${report.id}/image`} alt="" width={128} height={96} loading="lazy" />
                  <div>
                    <h3>
                      <Link href={`/reports/${report.id}`}>
                        {s.verified} confirmed {s.verified === 1 ? "barrier" : "barriers"}
                      </Link>
                    </h3>
                    <p className="muted">
                      {distance === 0 ? "At this place" : `${formatDistance(distance!)} away`} ·{" "}
                      {formatDateTime(report.createdAt)} · Status:{" "}
                      <span className={`chip status-${status}`}>{STATUS_INFO[status].label}</span>
                    </p>
                    <p className="muted">
                      {status === "submitted"
                        ? "Reported by a visitor and checked by them; not yet verified by anyone else."
                        : STATUS_INFO[status].description}
                    </p>
                    <NeedChips needs={verifiedNeeds(report)} label="Confirmed barriers affect" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}
