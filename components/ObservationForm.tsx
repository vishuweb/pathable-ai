"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AREA_LABEL, FINDING_LABEL, OBSERVATION_FINDINGS, PLACE_AREAS, type ObservationFinding, type PlaceArea } from "@/lib/observations";
import type { PlaceRef } from "@/lib/place";
import { prepareImage } from "@/lib/prepare-image";
import type { ApiError } from "@/lib/types";
import { VoiceNoteButton, appendDictation } from "./VoiceNoteButton";

export interface FeatureOption {
  id: string;
  label: string;
}

interface Props {
  place: PlaceRef;
  latitude: number;
  longitude: number;
  features: FeatureOption[];
  /** The feature to start with, e.g. chosen from an "unknown" row. */
  featureId: string;
  onFeatureChange: (id: string) => void;
  reportHref: string;
}

/** Record what you saw about one feature of this place: it starts as "community reported". */
export function ObservationForm({ place, latitude, longitude, features, featureId, onFeatureChange, reportHref }: Props) {
  const router = useRouter();
  const [finding, setFinding] = useState<ObservationFinding>("present");
  const [area, setArea] = useState<PlaceArea>("entrance");
  const [note, setNote] = useState("");
  const [observedOn, setObservedOn] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string }>();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();

  // The browser's own date, set after load so server and browser markup match.
  useEffect(() => setObservedOn(new Date().toISOString().slice(0, 10)), []);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return setPhoto(undefined);
    try {
      const prepared = await prepareImage(file);
      setPhoto({ dataUrl: prepared.dataUrl, name: file.name });
    } catch {
      setMessage({ text: "That photo could not be read. Try a JPEG or PNG.", error: true });
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place, latitude, longitude, featureId, finding, area, note, observedOn, photo: photo?.dataUrl, consent }),
      });
      const data = (await res.json().catch(() => undefined)) as { id: string } | ApiError | undefined;
      if (!res.ok || !data || "error" in data) throw new Error(data && "error" in data ? data.error : "It could not be saved.");
      setMessage({ text: "Thank you. Your observation now appears above as community reported, until someone checks it.", error: false });
      setNote("");
      setPhoto(undefined);
      setConsent(false);
      router.refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "It could not be saved.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="observation-form">
      <p className="muted">
        Saw something at {place.name}? Tell us what you found. It is shown as <strong>community reported</strong> until
        someone independently checks it, and it never makes the place &ldquo;accessible&rdquo; on its own.
      </p>

      <label className="field">
        What is it about?
        <select value={featureId} onChange={(e) => onFeatureChange(e.target.value)}>
          {features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="segmented">
        <legend>What did you find?</legend>
        <div className="segments">
          {OBSERVATION_FINDINGS.map((f) => (
            <label key={f} className="segment">
              <input type="radio" name="finding" value={f} checked={finding === f} onChange={() => setFinding(f)} />
              {FINDING_LABEL[f]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        Where exactly?
        <select value={area} onChange={(e) => setArea(e.target.value as PlaceArea)}>
          {PLACE_AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABEL[a]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>
          Describe it <span className="muted">(optional, for example &ldquo;the north entrance, left of the main door&rdquo;)</span>
        </span>
        <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <VoiceNoteButton label="the description" onText={(text) => setNote((current) => appendDictation(current, text, 500))} />

      <label className="field">
        When did you see it?
        <input type="date" value={observedOn} max={new Date().toISOString().slice(0, 10)} required onChange={(e) => setObservedOn(e.target.value)} />
      </label>

      <label className="field">
        <span>
          Photo <span className="muted">(optional; faces and number plates should not be clear in it)</span>
        </span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void choosePhoto(e.target.files?.[0])} />
      </label>
      {photo && <p className="muted">Attached: {photo.name}</p>}

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I understand this will be public, and I may share this photo and description.{" "}
          <a href="/privacy" target="_blank" rel="noopener">
            Privacy and removal (opens in a new tab)
          </a>
        </span>
      </label>

      <p>
        <button type="submit" className="button-primary" disabled={busy || !consent || !observedOn}>
          {busy ? "Sharing…" : "Share observation publicly"}
        </button>{" "}
        <Link className="button-secondary" href={reportHref}>
          Report a barrier with a photo instead
        </Link>
      </p>
      <p className={message?.error ? "field-error" : "muted"} role="status">
        {message?.text}
      </p>
    </form>
  );
}
