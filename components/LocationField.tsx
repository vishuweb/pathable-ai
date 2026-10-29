"use client";

import { useState } from "react";
import { formatCoordinates } from "@/lib/format";
import type { ReportLocation } from "@/lib/report";

interface Props {
  value: ReportLocation;
  onChange: (value: ReportLocation) => void;
}

export function LocationField({ value, onChange }: Props) {
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const coordinates = formatCoordinates(value);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Location is not available in this browser. You can type the place instead.");
      return;
    }
    setLocating(true);
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          ...value,
          latitude: round(position.coords.latitude),
          longitude: round(position.coords.longitude),
          accuracyM: Math.round(position.coords.accuracy),
        });
        setStatus("Location added.");
      },
      (error) => {
        setLocating(false);
        setStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. You can type the place instead."
            : "Your location could not be found. You can type the place instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  return (
    <fieldset className="field-group">
      <legend>
        Where is this? <span className="muted">(optional)</span>
      </legend>
      <label className="field">
        Place description
        <input
          type="text"
          value={value.label}
          maxLength={200}
          autoComplete="off"
          placeholder="e.g. Main St & 3rd Ave, north-east corner"
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </label>
      <div className="location-actions">
        <button type="button" className="button-secondary" onClick={locate} disabled={locating}>
          Use my current location
        </button>
        {coordinates && (
          <>
            <span>{coordinates}</span>
            <button type="button" className="button-link" onClick={() => onChange({ label: value.label })}>
              Remove coordinates
            </button>
          </>
        )}
      </div>
      <p className="muted">Use your current location only if you are standing where the photo was taken.</p>
      <p className="muted" role="status">
        {status}
      </p>
    </fieldset>
  );
}

function round(degrees: number): number {
  return Math.round(degrees * 1e6) / 1e6;
}
