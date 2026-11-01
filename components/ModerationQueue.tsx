"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiError } from "@/lib/types";

export interface PendingItem {
  kind: "report" | "observation";
  id: string;
  /** Where this was submitted, and when. */
  heading: string;
  when: string;
  /** What the submitter wrote or chose, as plain text. */
  lines: string[];
  hasPhoto: boolean;
  href?: string;
}

const photoPath = (item: PendingItem) => `/api/${item.kind === "report" ? "reports" : "observations"}/${item.id}/image`;

/** The owner's approvals list: nothing a visitor submits is public until it is approved here. */
export function ModerationQueue({ items }: { items: PendingItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  // Approval needs the owner to say they looked, item by item.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  const decide = async (item: PendingItem, moderation: "approved" | "rejected") => {
    setBusy(item.id);
    setMessage("");
    const path = item.kind === "report" ? `/api/reports/${item.id}` : `/api/observations/${item.id}`;
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderation, note: reason[item.id] ?? "" }),
    }).catch(() => undefined);
    setBusy("");
    if (res?.ok) {
      setMessage(moderation === "approved" ? "Approved. It is now public." : "Rejected. It stays hidden; delete it from its own page if you want it gone.");
      return router.refresh();
    }
    const data = (await res?.json().catch(() => undefined)) as ApiError | undefined;
    setMessage(data?.error ?? "That did not work. Please try again.");
  };

  return (
    <>
      <p role="status" className="muted">
        {message}
      </p>
      {items.length === 0 ? (
        <p className="empty-state">Nothing is waiting for approval.</p>
      ) : (
        <ul className="report-list">
          {items.map((item) => (
            <li key={`${item.kind}${item.id}`} className="report-item">
              {item.hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by our own API route, owner only until approved
                <img src={photoPath(item)} alt={`Small preview of the photo sent with this ${item.kind}`} width={128} height={96} loading="lazy" />
              ) : (
                <span className="muted">No photo</span>
              )}
              <div>
                <h2>
                  {item.kind === "report" ? "Report" : "Observation"}: {item.heading}
                </h2>
                <p className="muted">Sent {item.when}</p>
                {item.lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {item.hasPhoto && (
                  <p>
                    <a href={photoPath(item)} target="_blank" rel="noopener">
                      View the full-size photo (opens in a new tab)
                    </a>
                  </p>
                )}
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={checked[item.id] ?? false}
                    onChange={(e) => setChecked({ ...checked, [item.id]: e.target.checked })}
                  />
                  <span>
                    I checked {item.hasPhoto ? "the full-size photo and " : ""}the text for faces, number plates and personal
                    details.
                  </span>
                </label>
                <label className="field">
                  Reason (optional, kept with the decision)
                  <input
                    type="text"
                    maxLength={500}
                    value={reason[item.id] ?? ""}
                    onChange={(e) => setReason({ ...reason, [item.id]: e.target.value })}
                  />
                </label>
                <p>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={busy === item.id || !checked[item.id]}
                    onClick={() => void decide(item, "approved")}
                  >
                    Approve<span className="visually-hidden"> this {item.kind}</span>
                  </button>{" "}
                  <button type="button" className="button-secondary button-danger" disabled={busy === item.id} onClick={() => void decide(item, "rejected")}>
                    Reject<span className="visually-hidden"> this {item.kind}</span>
                  </button>
                  {item.href && (
                    <>
                      {" "}
                      <a href={item.href}>Open the full report</a>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
