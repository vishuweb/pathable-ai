import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SavedReportView } from "@/components/SavedReportView";
import { formatDateTime } from "@/lib/format";
import { reports } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const report = await reports.get((await params).id);
  return { title: report ? `Report ${report.location?.label ?? report.id.slice(0, 8)} · PathAble AI` : "Report not found" };
}

export default async function ReportPage({ params }: Params) {
  const report = await reports.get((await params).id);
  if (!report) notFound();

  return (
    <>
      <p className="back-link">
        <Link href="/reports">← All reports</Link>
      </p>
      <SavedReportView report={report} createdLabel={formatDateTime(report.createdAt)} />
    </>
  );
}
