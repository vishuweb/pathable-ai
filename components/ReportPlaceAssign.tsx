"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiError } from "@/lib/types";

export interface PlaceOption {
  key: string;
  label: string;
}

interface Props {
  reportId: string;
  current?: string;
  options: PlaceOption[];
}

/** Owner only: tie a report to a campus place, or take the link off. Reports are never matched to places by guesswork. */
export function ReportPlaceAssign({ reportId, current, options }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (place: { osmType: string; osmId: number } | null) => {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place, note }),
    }).catch(() => undefined);
    setBusy(false);
    if (res?.ok) {
      setMessage(place ? "Place linked." : "Place link removed.");
      return router.refresh();
    }
    setMessage(((await res?.json().catch(() => undefined)) as ApiError | undefined)?.error ?? "That did not work. Please try again.");
  };

  return (
    <section aria-labelledby="assign-title" className="profile-section">
      <h2 id="assign-title">Campus place</h2>
      <p className="muted">
        {current ? `Linked to ${current}. It appears on that place's page once approved.` : "No place is linked, so this report does not appear on any place page. Link it only if you are sure which place it is."}
      </p>
      <label className="field">
        Place
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Choose a campus place…</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Why (optional, kept with the link)
        <input type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p>
        <button
          type="button"
          className="button-primary"
          disabled={busy || !choice}
          onClick={() => {
            const [osmType, osmId] = choice.split("/");
            void send({ osmType, osmId: Number(osmId) });
          }}
        >
          Link to this place
        </button>{" "}
        {current && (
          <button type="button" className="button-secondary" disabled={busy} onClick={() => void send(null)}>
            Remove the link
          </button>
        )}
      </p>
      <p role="status" className="muted">
        {message}
      </p>
    </section>
  );
}
