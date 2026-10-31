import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SavedReportView } from "@/components/SavedReportView";
import { formatDateTime } from "@/lib/format";
import { moderationState } from "@/lib/moderation";
import { visibleReport } from "@/lib/moderation-store";
import { isOwner } from "@/lib/owner";
import { statusHistory } from "@/lib/report-status";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const report = await visibleReport((await params).id, await isOwner());
  return { title: report ? `Report ${report.location?.label ?? report.id.slice(0, 8)} · PathAble AI` : "Report not found" };
}

export default async function ReportPage({ params }: Params) {
  const owner = await isOwner();
  // A report that is not approved yet is invisible to everyone but the owner.
  const report = await visibleReport((await params).id, owner);
  if (!report) notFound();
  const state = moderationState(report);

  return (
    <>
      <p className="back-link">
        <Link href="/reports">← All reports</Link>
      </p>
      {state !== "approved" && (
        <p className="error" role="status">
          {state === "pending" ? "Not public yet: this report is waiting for your approval." : "Hidden: this report was rejected."}{" "}
          <Link href="/owner/moderation">Open the moderation list</Link>
        </p>
      )}
      <SavedReportView
        report={report}
        createdLabel={formatDateTime(report.createdAt)}
        statusEvents={statusHistory(report).map((event) => ({ ...event, label: formatDateTime(event.at) }))}
        isOwner={owner}
      />
    </>
  );
}
