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

/** The owner's approvals list: nothing a visitor submits is public until it is approved here. */
export function ModerationQueue({ items }: { items: PendingItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const decide = async (item: PendingItem, moderation: "approved" | "rejected") => {
    setBusy(item.id);
    setMessage("");
    const path = item.kind === "report" ? `/api/reports/${item.id}` : `/api/observations/${item.id}`;
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderation }),
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
                <img src={`/api/${item.kind === "report" ? "reports" : "observations"}/${item.id}/image`} alt="" width={128} height={96} loading="lazy" />
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
                <p>
                  <button type="button" className="button-primary" disabled={busy === item.id} onClick={() => void decide(item, "approved")}>
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
