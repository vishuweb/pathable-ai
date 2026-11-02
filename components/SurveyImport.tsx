"use client";

import { useState } from "react";

interface Preview {
  rows: number;
  errors: { row: number; error: string }[];
  surveys: { place: string; target: string; checklist: string; observedOn: string; source: string; answers: number; duplicateOf?: string; conflictsWith?: string }[];
  committed: boolean;
  created?: number;
  error?: string;
}

/** Owner only: previews a CSV or JSON file, and imports it only after the preview is clean. */
export function SurveyImport() {
  const [text, setText] = useState("");
  const [type, setType] = useState("text/csv");
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (commit: boolean) => {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/survey-data${commit ? "?commit=1" : ""}`, { method: "POST", headers: { "Content-Type": type }, body: text }).catch(() => undefined);
    const data = (await res?.json().catch(() => undefined)) as Preview | undefined;
    setBusy(false);
    if (!data) return setMessage("The file could not be checked. Please try again.");
    if (!data.surveys) return setMessage(data.error ?? "The file could not be read.");
    setPreview(data);
    if (data.committed) {
      setMessage(`${data.created} new ${data.created === 1 ? "survey" : "surveys"} added, waiting for review. Nothing existing was changed.`);
      setText("");
    }
  };

  const chooseFile = async (file: File | undefined) => {
    setPreview(undefined);
    if (!file) return;
    setType(file.name.toLowerCase().endsWith(".json") ? "application/json" : "text/csv");
    setText(await file.text());
  };

  return (
    <div className="survey-import">
      <label className="field">
        Choose a CSV or JSON file
        <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => void chooseFile(e.target.files?.[0])} />
      </label>
      <p>
        <button type="button" className="button-secondary" disabled={busy || !text} onClick={() => void send(false)}>
          Check the file (stores nothing)
        </button>{" "}
        <button
          type="button"
          className="button-primary"
          disabled={busy || !preview || preview.committed || preview.errors.length > 0 || preview.surveys.every((s) => s.duplicateOf)}
          onClick={() => void send(true)}
        >
          Import
        </button>
      </p>
      <p role="status" className="muted">
        {message}
      </p>
      {preview && (
        <div>
          <p>
            {preview.rows} rows read. {preview.errors.length} {preview.errors.length === 1 ? "problem" : "problems"}. {preview.surveys.filter((s) => !s.duplicateOf).length} new surveys,{" "}
            {preview.surveys.filter((s) => s.duplicateOf).length} already recorded (skipped), {preview.surveys.filter((s) => s.conflictsWith).length} that differ from an existing record (kept beside it).
          </p>
          {preview.errors.length > 0 && (
            <ul className="field-error">
              {preview.errors.slice(0, 50).map((e) => (
                <li key={`${e.row}${e.error}`}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
          <ul className="source-list">
            {preview.surveys.slice(0, 50).map((s, i) => (
              <li key={i}>
                {s.place}, {s.target}: {s.checklist}, {s.observedOn}, {s.answers} lines, source {s.source}
                {s.duplicateOf && " · already recorded"}
                {s.conflictsWith && " · differs from an existing record"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
