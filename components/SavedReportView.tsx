"use client";

import { useState } from "react";
import { CATEGORY_INFO, LEVEL_LABEL } from "@/lib/categories";
import { findingColor, findingTextColor } from "@/lib/colors";
import { formatCoordinates, formatDuration, mapUrl } from "@/lib/format";
import { placePath } from "@/lib/place";
import {
  summarizeReport,
  type FindingReview,
  type HighlightRating,
  type ReviewDecision,
  type SavedReport,
} from "@/lib/report";
import type { Finding } from "@/lib/types";
import { DeleteReportButton } from "./DeleteReportButton";
import { EvidenceViewer } from "./EvidenceViewer";
import { NeedChips } from "./NeedChips";
import { ReportStatusPanel, type LabelledEvent } from "./ReportStatusPanel";

const DECISION_LABEL: Record<ReviewDecision, string> = {
  confirmed: "Confirmed by reviewer",
  corrected: "Confirmed · category corrected",
  rejected: "Rejected · not a barrier",
};

const HIGHLIGHT_LABEL: Record<HighlightRating, string> = {
  correct: "Highlight correct",
  partial: "Highlight partly correct",
  wrong: "Highlight wrong",
};

interface Props {
  report: SavedReport;
  /** Formatted on the server so server and client render the same text. */
  createdLabel: string;
  /** Status history with dates formatted on the server. */
  statusEvents: LabelledEvent[];
  /** Shows the owner-only actions: status changes and deletion. */
  isOwner?: boolean;
}

export function SavedReportView({ report, createdLabel, statusEvents, isOwner }: Props) {
  const [selectedId, setSelectedId] = useState<string>();
  const [showOverlay, setShowOverlay] = useState(true);
  const summary = summarizeReport(report);
  const evidence = Object.fromEntries(report.evidence.map((e) => [e.findingId, e]));
  const image = { dataUrl: `/api/reports/${report.id}/image`, width: report.width, height: report.height };
  const coordinates = report.location && formatCoordinates(report.location);
  const map = report.location && mapUrl(report.location);
  const toggle = (findingId: string) => setSelectedId((current) => (current === findingId ? undefined : findingId));

  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-header">
        <p className="eyebrow">Accessibility barrier report</p>
        <h1 id="report-title">
          {summary.verified === 0
            ? "No verified barriers"
            : `${summary.verified} verified ${summary.verified === 1 ? "barrier" : "barriers"}`}
        </h1>
        <dl className="report-meta">
          <div>
            <dt>Saved</dt>
            <dd>{createdLabel}</dd>
          </div>
          {report.location?.place && (
            <div>
              <dt>Place</dt>
              <dd>
                <a href={placePath(report.location.place)}>{report.location.place.name}</a>
              </dd>
            </div>
          )}
          {report.location?.label && report.location.label !== report.location.place?.name && (
            <div>
              <dt>Location</dt>
              <dd>{report.location.label}</dd>
            </div>
          )}
          {coordinates && (
            <div>
              <dt>Coordinates</dt>
              <dd>
                {map ? (
                  <a href={map} target="_blank" rel="noreferrer">
                    {coordinates}
                    <span className="visually-hidden"> (opens a map in a new tab)</span>
                  </a>
                ) : (
                  coordinates
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>AI findings</dt>
            <dd>
              {summary.findings} ({summary.confirmed} confirmed, {summary.corrected} corrected,{" "}
              {summary.rejected} rejected)
            </dd>
          </div>
          <div>
            <dt>Missed by AI</dt>
            <dd>{summary.missed}</dd>
          </div>
          <div>
            <dt>Review time</dt>
            <dd>{formatDuration(report.timings.reviewMs)}</dd>
          </div>
        </dl>
        <div className="report-actions">
          <a className="button-primary" href={`/api/reports/${report.id}/markdown`} download>
            Download report (Markdown)
          </a>
          <a className="button-secondary" href={`/api/reports/${report.id}`} download>
            Download data (JSON)
          </a>
          <button type="button" className="button-secondary" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          {isOwner && <DeleteReportButton reportId={report.id} />}
        </div>
      </header>

      <ReportStatusPanel reportId={report.id} events={statusEvents} canEdit={Boolean(isOwner)} />

      <p className="scene-text">{report.analysis.scene_summary}</p>

      <section className="results" aria-label="Photo and review">
        <div className="viewer-column">
          <EvidenceViewer
            image={image}
            findings={report.analysis.findings}
            evidence={evidence}
            selectedId={selectedId}
            showOverlay={showOverlay}
            onSelect={toggle}
            alt="The photo this report is based on"
          />
          <div className="viewer-controls">
            <label>
              <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />{" "}
              Show highlights
            </label>
          </div>
        </div>

        <div className="findings-column">
          <h2>AI findings and review</h2>
          {report.analysis.findings.length ? (
            <ol className="finding-list">
              {report.analysis.findings.map((finding, index) => (
                <li key={finding.id}>
                  <SavedFinding
                    finding={finding}
                    index={index}
                    review={report.reviews[finding.id]}
                    selected={selectedId === finding.id}
                    onSelect={toggle}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">
              The AI reported no potential barriers. {report.analysis.no_findings_reason}
            </p>
          )}

          {report.missedIssues.length > 0 && (
            <>
              <h2>Missed by the AI</h2>
              <ul className="missed-list">
                {report.missedIssues.map((issue) => (
                  <li key={issue.id}>
                    <span>
                      <strong>{CATEGORY_INFO[issue.category].label}:</strong> {issue.description}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.reviewerNote && (
            <>
              <h2>Reviewer note</h2>
              <p className="reviewer-note">{report.reviewerNote}</p>
            </>
          )}
        </div>
      </section>

      <p className="removal-request">
        Are you in this photo, or is something wrong in this report?{" "}
        <a href={removalRequestUrl(report.id)}>Request removal or a correction</a> (opens a public GitHub issue; please
        do not include personal details).
      </p>

      <p className="disclaimer">
        Prepared with PathAble AI. Each AI finding was confirmed, corrected or rejected by whoever saved this report;
        nobody else has checked it unless the status above says so. This report documents potential barriers; it is
        not an accessibility compliance assessment, and a photo with no barrier found does not mean a place is
        accessible.
      </p>
    </article>
  );
}

interface SavedFindingProps {
  finding: Finding;
  index: number;
  review?: FindingReview;
  selected: boolean;
  onSelect: (findingId: string) => void;
}

function SavedFinding({ finding, index, review, selected, onSelect }: SavedFindingProps) {
  const color = findingColor(index);
  const headingId = `saved-finding-${finding.id}`;
  const category =
    review?.decision === "corrected" && review.correctedCategory
      ? `${CATEGORY_INFO[review.correctedCategory].label} (AI said ${CATEGORY_INFO[finding.category].label})`
      : CATEGORY_INFO[finding.category].label;

  return (
    <article
      className={`finding-card${selected ? " is-selected" : ""}${review?.decision === "rejected" ? " is-rejected" : ""}`}
      style={{ borderLeftColor: color }}
      aria-labelledby={headingId}
    >
      <header className="finding-header">
        <span
          className="finding-badge"
          style={{ background: color, color: findingTextColor(index) }}
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <div>
          <p className="finding-category">{category}</p>
          <h3 id={headingId}>
            <span className="visually-hidden">Finding {index + 1}: </span>
            {finding.title}
          </h3>
          <NeedChips
            needs={
              CATEGORY_INFO[review?.decision === "corrected" && review.correctedCategory ? review.correctedCategory : finding.category]
                .needs
            }
          />
        </div>
      </header>

      <ul className="chips" aria-label="Review outcome">
        {review?.decision && <li className={`chip decision-${review.decision}`}>{DECISION_LABEL[review.decision]}</li>}
        {review?.highlight && <li className="chip">{HIGHLIGHT_LABEL[review.highlight]}</li>}
        <li className={`chip impact-${finding.potential_impact}`}>
          Potential impact: {LEVEL_LABEL[finding.potential_impact]}
        </li>
      </ul>

      <dl className="finding-details">
        <dt>What the AI reported seeing</dt>
        <dd>{finding.observed_condition}</dd>
        <dt>Suggested next step</dt>
        <dd>{finding.suggested_next_step}</dd>
        {review?.note && (
          <>
            <dt>Reviewer note</dt>
            <dd>{review.note}</dd>
          </>
        )}
      </dl>

      <button type="button" className="button-secondary" aria-pressed={selected} onClick={() => onSelect(finding.id)}>
        Focus this finding on photo
      </button>
    </article>
  );
}

function removalRequestUrl(reportId: string): string {
  const params = new URLSearchParams({
    title: `Removal or correction request: report ${reportId.slice(0, 8)}`,
    body: `Report: https://pathable-ai.vercel.app/reports/${reportId}\n\nWhat should be removed or corrected? (Please do not include personal details.)\n`,
  });
  return `https://github.com/vishuweb/pathable-ai/issues/new?${params}`;
}
