"use client";

import { useId, useState } from "react";
import { CATEGORY_INFO } from "@/lib/categories";
import type { MissedIssue } from "@/lib/report";
import { ISSUE_CATEGORIES, type IssueCategory } from "@/lib/types";

interface Props {
  issues: MissedIssue[];
  onChange: (issues: MissedIssue[]) => void;
}

export function MissedIssuesEditor({ issues, onChange }: Props) {
  const [category, setCategory] = useState<IssueCategory>("obstructed_footpath");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const errorId = useId();

  const add = () => {
    const text = description.trim();
    if (!text) {
      setError("Describe the barrier before adding it.");
      return;
    }
    onChange([...issues, { id: crypto.randomUUID(), category, description: text }]);
    setDescription("");
    setError("");
  };

  return (
    <fieldset className="field-group">
      <legend>Did the AI miss anything?</legend>
      <p className="muted">
        Add barriers you can see in the photo that are not listed above. This measures what the AI misses.
      </p>

      {issues.length > 0 && (
        <ul className="missed-list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <span>
                <strong>{CATEGORY_INFO[issue.category].label}:</strong> {issue.description}
              </span>
              <button
                type="button"
                className="button-link"
                onClick={() => onChange(issues.filter((i) => i.id !== issue.id))}
                aria-label={`Remove missed barrier: ${issue.description}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="missed-form">
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          What did the AI miss?
          <input
            type="text"
            value={description}
            maxLength={1000}
            placeholder="e.g. Broken paving slab beside the bench"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </label>
        <button type="button" className="button-secondary" onClick={add}>
          Add missed barrier
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
