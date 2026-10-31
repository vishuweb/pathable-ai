"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiError } from "@/lib/types";

/** Owner only: mark one observation independently verified, with how it was checked, or delete it. */
export function ObservationModeration({ id, verified }: { id: string; verified: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (init: RequestInit) => {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/observations/${id}`, init).catch(() => undefined);
    setBusy(false);
    if (res?.ok) return router.refresh();
    const data = (await res?.json().catch(() => undefined)) as ApiError | undefined;
    setMessage(data?.error ?? "That did not work. Please try again.");
  };

  return (
    <details className="moderation">
      <summary>Owner actions</summary>
      {!verified && (
        <label className="field">
          How was it checked? <span className="muted">(for example “site visit on 31 Oct 2026”)</span>
          <input type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <p>
        {!verified && (
          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={() =>
              void call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "verified", note }) })
            }
          >
            Mark independently verified
          </button>
        )}{" "}
        <button
          type="button"
          className="button-secondary button-danger"
          disabled={busy}
          onClick={() => window.confirm("Delete this observation and its photo?") && void call({ method: "DELETE" })}
        >
          Delete observation
        </button>
      </p>
      <p className="field-error" role="status">
        {message}
      </p>
    </details>
  );
}
