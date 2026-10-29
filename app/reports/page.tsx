import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { summarizeReport } from "@/lib/report";
import { STATUS_INFO, currentStatus } from "@/lib/report-status";
import { reports as reportStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved reports · PathAble AI" };

export default async function ReportsPage() {
  const reports = (await reportStore.list()).reverse();

  return (
    <section aria-labelledby="reports-title">
      <div className="page-heading">
        <h1 id="reports-title">Saved reports</h1>
        <Link className="button-primary" href="/">
          New report
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="empty-state">
          No saved reports yet. <Link href="/">Analyze a photo</Link> and save your review to create one.
        </p>
      ) : (
        <ul className="report-list">
          {reports.map((report) => {
            const s = summarizeReport(report);
            const created = formatDateTime(report.createdAt);
            return (
              <li key={report.id} className="report-item">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
                <img src={`/api/reports/${report.id}/image`} alt="" width={128} height={96} loading="lazy" />
                <div>
                  <h2>
                    <Link href={`/reports/${report.id}`}>{report.location?.label || `Report from ${created}`}</Link>
                  </h2>
                  <p className="muted">
                    {created} · Status:{" "}
                    <span className={`chip status-${currentStatus(report).status}`}>
                      {STATUS_INFO[currentStatus(report).status].label}
                    </span>
                  </p>
                  <p>
                    <strong>
                      {s.verified} verified {s.verified === 1 ? "barrier" : "barriers"}
                    </strong>{" "}
                    · {s.findings} AI {s.findings === 1 ? "finding" : "findings"} ({s.confirmed} confirmed,{" "}
                    {s.corrected} corrected, {s.rejected} rejected) · {s.missed} missed by AI
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
