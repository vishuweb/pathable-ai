import type { Metadata } from "next";
import Link from "next/link";
import { ReportList, type ReportListItem } from "@/components/ReportList";
import { formatDateTime } from "@/lib/format";
import { AREA_LABEL } from "@/lib/observations";
import { placePath } from "@/lib/place";
import { summarizeReport, verifiedNeeds } from "@/lib/report";
import { STATUS_INFO, currentStatus } from "@/lib/report-status";
import { reports as reportStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community reports · PathAble AI" };

export default async function ReportsPage() {
  const reports = (await reportStore.list()).reverse();
  const items: ReportListItem[] = reports.map((report) => {
    const s = summarizeReport(report);
    const created = formatDateTime(report.createdAt);
    const status = currentStatus(report).status;
    return {
      id: report.id,
      title: report.location?.place?.name || report.location?.label || `Report from ${created}`,
      placeHref: report.location?.place ? placePath(report.location.place) : undefined,
      locationLabel: report.location?.place
        ? `At ${report.location.place.name}`
        : report.location?.latitude !== undefined
          ? "Location on campus map, no named place"
          : report.location?.label
            ? `Described as “${report.location.label}”, no map location`
            : "No location given",
      area: report.area ? AREA_LABEL[report.area] : undefined,
      createdLabel: created,
      statusKey: status,
      statusLabel: STATUS_INFO[status].label,
      summary: `${s.verified} ${s.verified === 1 ? "barrier" : "barriers"} confirmed by the reporter${s.missed ? `, including ${s.missed} they added` : ""}`,
      needs: verifiedNeeds(report),
      latitude: report.location?.latitude,
      longitude: report.location?.longitude,
    };
  });

  return (
    <section aria-labelledby="reports-title">
      <div className="page-heading">
        <h1 id="reports-title">Community reports</h1>
        <Link className="button-primary" href="/report">
          Report a barrier
        </Link>
      </div>
      <p className="intro">
        Barriers people have photographed and checked. Each report shows its status, so you can see whether anyone
        has looked at it since.
      </p>
      {reports.length === 0 ? (
        <p className="empty-state">
          No shared reports yet. <Link href="/report">Report a barrier</Link> to create the first one.
        </p>
      ) : (
        <ReportList items={items} />
      )}
    </section>
  );
}
