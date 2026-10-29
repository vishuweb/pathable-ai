"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { REPORT_STATUSES, STATUS_INFO, type ReportStatus, type StatusEvent } from "@/lib/report-status";
import type { ApiError } from "@/lib/types";

export interface LabelledEvent extends StatusEvent {
  /** Formatted on the server, so server and client render the same text. */
  label: string;
}

interface Props {
  reportId: string;
  events: LabelledEvent[];
  /** Shows the owner-only form for recording a status change. */
  canEdit: boolean;
}

/** Where the report stands, the dated history behind it, and (for the owner) a way to update it. */
export function ReportStatusPanel({ reportId, events: initial, canEdit }: Props) {
  const [events, setEvents] = useState(initial);
  const current = events[events.length - 1];

  return (
    <section className="status-panel" aria-labelledby="status-heading">
      <h2 id="status-heading">
        Status: <span className={`chip status-${current.status}`}>{STATUS_INFO[current.status].label}</span>
      </h2>
      <p className="muted">{STATUS_INFO[current.status].description}</p>

      <h3>History</h3>
      <ol className="status-history">
        {events.map((event, i) => (
          <li key={`${event.at}-${i}`}>
            <strong>{STATUS_INFO[event.status].label}</strong> · <time dateTime={event.at}>{event.label}</time>
            {event.note && <p>{event.note}</p>}
            {event.duplicateOf && (
              <p>
                Duplicate of <a href={`/reports/${event.duplicateOf}`}>report {event.duplicateOf.slice(0, 8)}</a>
              </p>
            )}
          </li>
        ))}
      </ol>

      {canEdit && (
        <StatusForm
          reportId={reportId}
          current={current.status}
          onUpdated={(history) => setEvents(history.map((e) => ({ ...e, label: formatDateTime(e.at) })))}
        />
      )}
    </section>
  );
}

function StatusForm({
  reportId,
  current,
  onUpdated,
}: {
  reportId: string;
  current: ReportStatus;
  onUpdated: (history: StatusEvent[]) => void;
}) {
  const [status, setStatus] = useState<ReportStatus>(current);
  const [note, setNote] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const needsNote = STATUS_INFO[status].needsNote;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note, duplicateOf: status === "closed" ? duplicateOf : undefined }),
      });
      const data = (await res.json().catch(() => undefined)) as { statusHistory: StatusEvent[] } | ApiError | undefined;
      if (!res.ok || !data || "error" in data) throw new Error(data && "error" in data ? data.error : "The status could not be saved.");
      onUpdated(data.statusHistory);
      setNote("");
      setDuplicateOf("");
      setMessage({ text: `Status saved: ${STATUS_INFO[status].label}.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The status could not be saved.", error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="status-form" onSubmit={(e) => void submit(e)}>
      <h3>Record a status change</h3>
      <label className="field">
        New status
        <select value={status} onChange={(e) => setStatus(e.target.value as ReportStatus)}>
          {REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_INFO[s].label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{STATUS_INFO[status].description}</p>
      <label className="field">
        <span>
          Note {needsNote ? <span className="muted">(required: what is this based on?)</span> : <span className="muted">(optional)</span>}
        </span>
        <textarea
          rows={3}
          maxLength={1000}
          required={needsNote}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {status === "closed" && (
        <label className="field">
          <span>
            Duplicate of report <span className="muted">(optional: paste the other report&apos;s id)</span>
          </span>
          <input type="text" value={duplicateOf} maxLength={36} onChange={(e) => setDuplicateOf(e.target.value)} />
        </label>
      )}
      <p>
        <button type="submit" className="button-primary" disabled={saving}>
          {saving ? "Saving…" : "Save status"}
        </button>
      </p>
      <p className={message?.error ? "field-error" : "muted"} role="status">
        {message?.text}
      </p>
    </form>
  );
}
