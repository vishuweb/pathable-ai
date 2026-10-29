"use client";

import { CATEGORY_INFO } from "@/lib/categories";
import type { FindingReview, HighlightRating, ReviewDecision } from "@/lib/report";
import { ISSUE_CATEGORIES, type Finding, type IssueCategory } from "@/lib/types";
import { VoiceNoteButton, appendDictation } from "./VoiceNoteButton";

const DECISIONS: { value: ReviewDecision; label: string }[] = [
  { value: "confirmed", label: "Yes, real barrier" },
  { value: "corrected", label: "Real, wrong category" },
  { value: "rejected", label: "Not a barrier" },
];

const HIGHLIGHTS: { value: HighlightRating; label: string }[] = [
  { value: "correct", label: "Yes" },
  { value: "partial", label: "Partly" },
  { value: "wrong", label: "No" },
];

interface Props {
  finding: Finding;
  review: FindingReview;
  onChange: (review: FindingReview) => void;
  /** Locks the controls once the report is saved. */
  disabled?: boolean;
}

export function FindingReviewControls({ finding, review, onChange, disabled }: Props) {
  const name = `review-${finding.id}`;
  const isReal = review.decision === "confirmed" || review.decision === "corrected";

  return (
    <fieldset className="review-controls" disabled={disabled}>
      <legend className="visually-hidden">Your review of this finding</legend>
      <fieldset className="segmented">
        <legend>Is this a real barrier?</legend>
        <div className="segments">
          {DECISIONS.map((d) => (
            <label key={d.value} className={`segment decision-${d.value}`}>
              <input
                type="radio"
                name={`${name}-decision`}
                value={d.value}
                checked={review.decision === d.value}
                onChange={() => onChange({ ...review, decision: d.value })}
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      {review.decision === "corrected" && (
        <label className="field">
          Correct category
          <select
            value={review.correctedCategory ?? ""}
            onChange={(e) => onChange({ ...review, correctedCategory: e.target.value as IssueCategory })}
            required
          >
            <option value="" disabled>
              Choose a category
            </option>
            {ISSUE_CATEGORIES.filter((c) => c !== finding.category).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isReal && (
        <fieldset className="segmented">
          <legend>Does the highlight on the photo show this barrier?</legend>
          <div className="segments">
            {HIGHLIGHTS.map((h) => (
              <label key={h.value} className="segment">
                <input
                  type="radio"
                  name={`${name}-highlight`}
                  value={h.value}
                  checked={review.highlight === h.value}
                  onChange={() => onChange({ ...review, highlight: h.value })}
                />
                {h.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="field">
        <span>
          Note <span className="muted">(optional)</span>
        </span>
        <textarea
          rows={2}
          maxLength={2000}
          value={review.note}
          onChange={(e) => onChange({ ...review, note: e.target.value })}
        />
      </label>
      <VoiceNoteButton
        label={`a note on “${finding.title}”`}
        onText={(text) => onChange({ ...review, note: appendDictation(review.note, text, 2000) })}
      />
    </fieldset>
  );
}
