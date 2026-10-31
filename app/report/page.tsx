import type { Metadata } from "next";
import Link from "next/link";
import { AuditWorkspace } from "@/components/AuditWorkspace";
import { OSM_TYPES, placePath } from "@/lib/place";
import { activeRegion, inRegion } from "@/lib/region";
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
  if (!inRegion(activeRegion(), latitude, longitude)) return undefined;
  return { label: name, latitude, longitude, place: { osmType, osmId, name } };
}

export default async function ReportBarrierPage({ searchParams }: { searchParams: SearchParams }) {
  const initialLocation = placeFromQuery(await searchParams);
  return (
    <>
      <section className="intro">
        <h1>Report a barrier</h1>
        <ol className="flow-steps" aria-label="The three steps">
          <li>
            <strong>Add a photo</strong>
            <span>of the barrier</span>
          </li>
          <li>
            <strong>Check the AI&apos;s suggestions</strong>
            <span>confirm, correct or reject each</span>
          </li>
          <li>
            <strong>Share the report</strong>
            <span>nothing is public until you do</span>
          </li>
        </ol>
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
