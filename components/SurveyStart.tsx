"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SUBLOCATION_LABEL, SUBLOCATION_TYPES, checklistsFor, type SublocationType } from "@/lib/survey-taxonomy";
import type { ApiError } from "@/lib/types";

export interface StartPlace {
  key: string;
  label: string;
}

export interface StartSpot {
  id: string;
  placeKey: string;
  label: string;
  type: SublocationType;
}

/** The first step of a survey: which place, which spot at it, and which checklist. */
export function SurveyStart({ places, spots, initialPlace }: { places: StartPlace[]; spots: StartSpot[]; initialPlace?: string }) {
  const router = useRouter();
  const [place, setPlace] = useState(initialPlace ?? "");
  // "place" is the whole place, "new" is a spot not recorded yet, anything else an existing spot's id.
  const [target, setTarget] = useState("place");
  const [newType, setNewType] = useState<SublocationType>("entrance");
  const [newName, setNewName] = useState("");
  const [checklistId, setChecklistId] = useState("");
  const [observedOn, setObservedOn] = useState("");
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracyM: number }>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setObservedOn(new Date().toISOString().slice(0, 10)), []);

  const here = spots.filter((s) => s.placeKey === place);
  const existing = here.find((s) => s.id === target);
  const targetKind = target === "place" ? "place" : target === "new" ? newType : existing?.type;
  const available = targetKind ? checklistsFor(targetKind) : [];
  const chosen = available.find((c) => c.id === checklistId) ?? available[0];

  const locate = () => {
    if (!("geolocation" in navigator)) return setMessage("Location is not available in this browser.");
    setMessage("Finding your position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ latitude: Math.round(p.coords.latitude * 1e6) / 1e6, longitude: Math.round(p.coords.longitude * 1e6) / 1e6, accuracyM: Math.round(p.coords.accuracy) });
        setMessage("");
      },
      () => setMessage("Your position could not be found. You can start without it."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setMessage("");
    const [osmType, osmId] = place.split("/");
    const res = await fetch("/api/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place: { osmType, osmId: Number(osmId) },
        checklistId: chosen.id,
        observedOn,
        ...(target === "new" ? { sublocation: { type: newType, name: newName } } : target !== "place" ? { sublocationId: target } : {}),
        ...position,
      }),
    }).catch(() => undefined);
    const data = (await res?.json().catch(() => undefined)) as ({ id: string; similarTo?: string } & Partial<ApiError>) | undefined;
    setBusy(false);
    if (res?.ok && data?.id) return router.push(`/owner/survey/${data.id}${data.similarTo ? `?similar=${data.similarTo}` : ""}`);
    setMessage(data?.error ?? "The survey could not be started. Please try again.");
  };

  return (
    <form onSubmit={(e) => void start(e)} className="survey-start">
      <label className="field">
        Campus place
        <select value={place} required onChange={(e) => { setPlace(e.target.value); setTarget("place"); }}>
          <option value="">Choose a place…</option>
          {places.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        What are you surveying?
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="place">The whole place</option>
          {here.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          <option value="new">A specific spot not listed yet…</option>
        </select>
      </label>

      {target === "new" && (
        <>
          <label className="field">
            Kind of spot
            <select value={newType} onChange={(e) => setNewType(e.target.value as SublocationType)}>
              {SUBLOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SUBLOCATION_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Name it so it can be told apart <span className="muted">(for example “North entrance, by the bicycle stand”)</span>
            </span>
            <input type="text" maxLength={120} required value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
        </>
      )}

      <label className="field">
        Checklist
        <select value={chosen?.id ?? ""} onChange={(e) => setChecklistId(e.target.value)}>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {chosen && <p className="muted">{chosen.inspect}</p>}

      <label className="field">
        The day you were there
        <input type="date" required value={observedOn} onChange={(e) => setObservedOn(e.target.value)} />
      </label>

      <p>
        <button type="button" className="button-secondary" onClick={locate}>
          {position ? "Update my position" : "Add my exact position (optional)"}
        </button>{" "}
        {position && <span className="muted">Position added (accuracy about {position.accuracyM} m). It is kept apart from the place&apos;s own.</span>}
      </p>

      <p>
        <button type="submit" className="button-primary" disabled={busy || !place || !chosen}>
          {busy ? "Starting…" : "Start the survey"}
        </button>
      </p>
      <p role="status" className="field-error">
        {message}
      </p>
    </form>
  );
}
