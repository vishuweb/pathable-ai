import { CATEGORY_INFO, LEVEL_LABEL } from "./categories";
import { formatCoordinates } from "./format";
import type { FindingReview, HighlightRating, SavedReport } from "./report";
import type { Finding } from "./types";

const HIGHLIGHT_LABEL: Record<HighlightRating, string> = {
  correct: "correct",
  partial: "partly correct",
  wrong: "wrong",
};

/** Formats a reviewed report as a plain maintenance request that can be emailed or pasted into a ticket. */
export function reportToMarkdown(report: SavedReport, reportUrl?: string): string {
  const numbered = report.analysis.findings.map((finding, i) => ({
    finding,
    number: i + 1,
    review: report.reviews[finding.id],
  }));
  const verified = numbered.filter((n) => n.review?.decision === "confirmed" || n.review?.decision === "corrected");
  const rejected = numbered.filter((n) => n.review?.decision === "rejected");
  const total = verified.length + report.missedIssues.length;

  const out: string[] = ["# Accessibility barrier report", ""];
  out.push(`- **Date:** ${report.createdAt.slice(0, 16).replace("T", " ")} UTC`);
  if (report.location?.label) out.push(`- **Location:** ${oneLine(report.location.label)}`);
  const coordinates = report.location && formatCoordinates(report.location);
  if (coordinates) out.push(`- **Coordinates:** ${coordinates}`);
  out.push(`- **Report ID:** ${report.id}`);
  if (reportUrl) out.push(`- **Photo with highlighted evidence:** ${reportUrl}`);
  out.push("", `**Scene:** ${oneLine(report.analysis.scene_summary)}`, "");

  out.push(`## Verified barriers (${total})`, "");
  if (total === 0) out.push("The reviewer did not verify any barrier in this photo.", "");

  verified.forEach(({ finding, number, review }, i) => {
    out.push(`### ${i + 1}. ${oneLine(finding.title)}`, "");
    out.push(`- **Category:** ${categoryLine(finding, review)}`);
    out.push(`- **Observed:** ${oneLine(finding.observed_condition)}`);
    out.push(`- **Why it may matter:** ${oneLine(finding.why_it_matters)}`);
    out.push(`- **Potential impact:** ${LEVEL_LABEL[finding.potential_impact]}`);
    out.push(`- **Suggested next step:** ${oneLine(finding.suggested_next_step)}`);
    out.push(`- **Not verifiable from the photo:** ${oneLine(finding.uncertainty)}`);
    const highlight = review?.highlight ? `; reviewer rated the highlight ${HIGHLIGHT_LABEL[review.highlight]}` : "";
    out.push(
      finding.located
        ? `- **Evidence:** marked as finding #${number} on the photo${highlight}`
        : `- **Evidence:** finding #${number}; no specific area was marked on the photo`,
    );
    if (review?.note) out.push(`- **Reviewer note:** ${oneLine(review.note)}`);
    out.push("");
  });

  report.missedIssues.forEach((issue, i) => {
    out.push(`### ${verified.length + i + 1}. ${CATEGORY_INFO[issue.category].label} (added by reviewer)`, "");
    out.push(`- **Observed:** ${oneLine(issue.description)}`, "");
  });

  if (rejected.length) {
    out.push("## Checked and not a barrier", "");
    for (const { finding, number, review } of rejected) {
      const note = review?.note ? ` (reviewer: ${oneLine(review.note)})` : "";
      out.push(`- Finding #${number}: ${oneLine(finding.title)}${note}`);
    }
    out.push("");
  }

  if (report.reviewerNote) out.push("## Reviewer note", "", report.reviewerNote, "");

  out.push(
    "---",
    "",
    "_Prepared with PathAble AI (Muse Spark + SAM 3.1). Every AI finding was checked by a human reviewer. " +
      "This report documents potential barriers; it is not an accessibility compliance assessment._",
    "",
  );
  return out.join("\n");
}

function categoryLine(finding: Finding, review: FindingReview | undefined): string {
  if (review?.decision === "corrected" && review.correctedCategory) {
    return `${CATEGORY_INFO[review.correctedCategory].label} (corrected by reviewer; AI suggested ${CATEGORY_INFO[finding.category].label})`;
  }
  return CATEGORY_INFO[finding.category].label;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
