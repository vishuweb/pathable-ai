import type { Metadata } from "next";
import Link from "next/link";
import { AuditWorkspace } from "@/components/AuditWorkspace";
import { OSM_TYPES, placePath } from "@/lib/place";
import type { ReportLocation } from "@/lib/report";

export const metadata: Metadata = { title: "Report a barrier · PathAble AI" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A place passed from a place page, checked like any other input; the report is validated again on save. */
function placeFromQuery(query: Record<string, string | string[] | undefined>): ReportLocation | undefined {
  const [type, id] = String(query.osm ?? "").split("/");
  const osmType = OSM_TYPES.find((t) => t === type);
  const osmId = Number(id);
  const name = String(query.name ?? "").trim().slice(0, 200);
  const latitude = Number(query.lat);
  const longitude = Number(query.lon);
  if (!osmType || !Number.isSafeInteger(osmId) || osmId <= 0 || !name) return undefined;
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) return undefined;
  return { label: name, latitude, longitude, place: { osmType, osmId, name } };
}

export default async function ReportBarrierPage({ searchParams }: { searchParams: SearchParams }) {
  const initialLocation = placeFromQuery(await searchParams);
  return (
    <>
      <section className="intro">
        <h1>Report a barrier</h1>
        <p>
          Add a photo of a footpath, curb ramp, crossing or entrance. AI suggests possible barriers and outlines the
          evidence; you check every suggestion before anything is shared.
        </p>
        {initialLocation?.place && (
          <p className="callout">
            Reporting at <Link href={placePath(initialLocation.place)}>{initialLocation.place.name}</Link>. You can change
            the place before sharing.
          </p>
        )}
      </section>
      <AuditWorkspace initialLocation={initialLocation} />
    </>
  );
}
