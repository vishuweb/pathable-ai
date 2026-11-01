"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AREA_LABEL,
  FINDING_LABEL,
  OBSERVATION_FINDINGS,
  PLACE_AREAS,
  RESPONSE_LABEL,
  type ObservationFinding,
  type PlaceArea,
  type ResponseKind,
} from "@/lib/observations";
import type { PlaceRef } from "@/lib/place";
import { prepareImage } from "@/lib/prepare-image";
import { activeRegion, inRegion } from "@/lib/region";
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
  /** Set when the visitor is answering an observation already shown on the page. */
  response?: { id: string; kind: ResponseKind; summary: string; finding: ObservationFinding; area: PlaceArea };
  onClearResponse?: () => void;
}

/** Record what you saw about one feature of this place: it starts as "community reported". */
export function ObservationForm({ place, latitude, longitude, features, featureId, onFeatureChange, reportHref, response, onClearResponse }: Props) {
  const router = useRouter();
  const [finding, setFinding] = useState<ObservationFinding>("present");
  const [area, setArea] = useState<PlaceArea>("entrance");
  const [note, setNote] = useState("");
  const [observedOn, setObservedOn] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string }>();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  // Where the visitor actually is, if they choose to say. Otherwise the place's own position is sent.
  const [spot, setSpot] = useState<{ latitude: number; longitude: number; accuracyM: number }>();
  const [locating, setLocating] = useState(false);
  const copies = response?.kind === "confirm" || response?.kind === "evidence";

  // The browser's own date, set after load so server and browser markup match.
  useEffect(() => setObservedOn(new Date().toISOString().slice(0, 10)), []);

  // Answering an observation starts from what it said: the same for "I saw the same", something else otherwise.
  useEffect(() => {
    if (!response) return;
    setArea(response.area);
    setFinding(
      response.kind === "confirm" || response.kind === "evidence"
        ? response.finding
        : (OBSERVATION_FINDINGS.find((f) => f !== response.finding) ?? "present"),
    );
  }, [response]);

  const locate = () => {
    if (!("geolocation" in navigator)) return setMessage({ text: "Location is not available in this browser.", error: true });
    setLocating(true);
    setMessage(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const region = activeRegion();
        if (!inRegion(region, position.coords.latitude, position.coords.longitude)) {
          return setMessage({ text: `You seem to be outside the ${region.name} campus, so your position was not added.`, error: true });
        }
        setSpot({
          latitude: Math.round(position.coords.latitude * 1e6) / 1e6,
          longitude: Math.round(position.coords.longitude * 1e6) / 1e6,
          accuracyM: Math.round(position.coords.accuracy),
        });
      },
      () => {
        setLocating(false);
        setMessage({ text: "Your position could not be found. You can still share without it.", error: true });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

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
        body: JSON.stringify({
          place,
          latitude: spot?.latitude ?? latitude,
          longitude: spot?.longitude ?? longitude,
          accuracyM: spot?.accuracyM,
          featureId,
          finding,
          area,
          note,
          observedOn,
          photo: photo?.dataUrl,
          consent,
          respondsTo: response ? { id: response.id, kind: response.kind } : undefined,
        }),
      });
      const data = (await res.json().catch(() => undefined)) as { id: string; moderation?: string; similarTo?: string } | ApiError | undefined;
      if (!res.ok || !data || "error" in data) throw new Error(data && "error" in data ? data.error : "It could not be saved.");
      setMessage({
        text:
          (data.moderation === "pending"
            ? "Thank you. Your observation is waiting for the project owner's approval. It becomes public, as community reported, once approved."
            : "Thank you. Your observation now appears above as community reported, until someone checks it.") +
          (data.similarTo ? " Someone has already reported the same thing, so the two will be counted together." : ""),
        error: false,
      });
      setNote("");
      setSpot(undefined);
      onClearResponse?.();
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
        Saw something at {place.name}? Tell us what you found. The project owner checks it before it appears; it is then
        shown as <strong>community reported</strong> until someone independently verifies it, and it never makes the place
        &ldquo;accessible&rdquo; on its own.
      </p>

      {response && (
        <p className="response-banner" role="status">
          <strong>{RESPONSE_LABEL[response.kind]}.</strong> You are answering: {response.summary}.{" "}
          <button type="button" className="button-link" onClick={onClearResponse}>
            Start a new observation instead
          </button>
        </p>
      )}

      <label className="field">
        What is it about?
        <select value={featureId} disabled={Boolean(response)} onChange={(e) => onFeatureChange(e.target.value)}>
          {features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="segmented" hidden={copies}>
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

      <label className="field" hidden={copies}>
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

      <p>
        <button type="button" className="button-secondary" onClick={locate} disabled={locating}>
          {locating ? "Finding your position…" : spot ? "Update my position" : "Add my exact position (optional)"}
        </button>{" "}
        <span className="muted" role="status">
          {spot
            ? `Your position will be saved with this, separately from the place (accuracy about ${spot.accuracyM} m).`
            : "Without it, only the place is recorded, not where at the place you were."}
        </span>
      </p>

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
