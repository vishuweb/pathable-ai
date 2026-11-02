"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PriorityLevel } from "@/lib/survey";

/** Owner only: how much a place matters to the survey queue. */
export function SurveyPriorityControl({ place, label, level }: { place: { osmType: string; osmId: number }; label: string; level: PriorityLevel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = async (next: string) => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/survey-priorities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place, level: next }),
    }).catch(() => undefined);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError("That did not save.");
  };

  return (
    <label className="survey-priority">
      <span className="visually-hidden">Survey priority for {label}</span>
      <select value={level} disabled={busy} onChange={(e) => void set(e.target.value)}>
        <option value="high">Priority</option>
        <option value="normal">Normal</option>
        <option value="hold">On hold (not safe or practical now)</option>
      </select>
      {error && <span className="field-error"> {error}</span>}
    </label>
  );
}
