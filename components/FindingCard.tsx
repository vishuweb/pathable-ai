"use client";

import { CATEGORY_INFO, LEVEL_LABEL } from "@/lib/categories";
import { findingColor, findingTextColor } from "@/lib/colors";
import type { Evidence, Finding } from "@/lib/types";

interface Props {
  finding: Finding;
  index: number;
  evidence?: Evidence;
  evidencePending: boolean;
  selected: boolean;
  onSelect: (findingId: string) => void;
}

export function FindingCard({ finding, index, evidence, evidencePending, selected, onSelect }: Props) {
  const color = findingColor(index);
  const headingId = `finding-${finding.id}-title`;

  return (
    <article
      className={`finding-card${selected ? " is-selected" : ""}`}
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
          <p className="finding-category">{CATEGORY_INFO[finding.category].label}</p>
          <h3 id={headingId}>
            <span className="visually-hidden">Finding {index + 1}: </span>
            {finding.title}
          </h3>
        </div>
      </header>

      <ul className="chips" aria-label="Assessment">
        <li className={`chip impact-${finding.potential_impact}`}>
          Potential impact: {LEVEL_LABEL[finding.potential_impact]}
        </li>
        <li className={`chip confidence-${finding.confidence}`}>
          Confidence: {LEVEL_LABEL[finding.confidence]}
        </li>
      </ul>

      <dl className="finding-details">
        <dt>Observed</dt>
        <dd>{finding.observed_condition}</dd>
        <dt>Why it may matter</dt>
        <dd>{finding.why_it_matters}</dd>
        <dt>What the photo can&apos;t show</dt>
        <dd>{finding.uncertainty}</dd>
        <dt>Suggested next step</dt>
        <dd>{finding.suggested_next_step}</dd>
      </dl>

      <p className={`evidence-status status-${evidence?.status ?? "pending"}`}>
        {evidence ? evidence.note : evidencePending ? "Locating visual evidence…" : "No visual evidence."}
      </p>

      {/* A toggle keeps one label; aria-pressed announces whether the focus is on. */}
      <button
        type="button"
        className="button-secondary"
        aria-pressed={selected}
        onClick={() => onSelect(finding.id)}
      >
        Focus this finding on photo
      </button>
    </article>
  );
}
