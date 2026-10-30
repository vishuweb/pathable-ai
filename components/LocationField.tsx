"use client";

import { useState } from "react";
import { formatCoordinates } from "@/lib/format";
import { osmUrl, type PlaceResult } from "@/lib/place";
import { activeRegion, inRegion } from "@/lib/region";
import type { ReportLocation } from "@/lib/report";
import { PlaceSearch } from "./PlaceSearch";

interface Props {
  value: ReportLocation;
  onChange: (value: ReportLocation) => void;
}

export function LocationField({ value, onChange }: Props) {
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const coordinates = formatCoordinates(value);

  const choose = (place: PlaceResult) => {
    onChange({
      label: value.label || place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      place: { osmType: place.osmType, osmId: place.osmId, name: place.name },
    });
    setStatus(`Linked to ${place.name}.`);
  };

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
        const region = activeRegion();
        if (!inRegion(region, position.coords.latitude, position.coords.longitude)) {
          setStatus(`You seem to be outside the ${region.name} campus, so your location was not added. Search for the campus place instead.`);
          return;
        }
        onChange({
          label: value.label,
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
      {value.place ? (
        <p className="linked-place">
          Place: <strong>{value.place.name}</strong>{" "}
          <a href={osmUrl(value.place)} target="_blank" rel="noreferrer">
            (OpenStreetMap, opens in a new tab)
          </a>{" "}
          <button type="button" className="button-link" onClick={() => onChange({ label: value.label })}>
            Remove place
          </button>
        </p>
      ) : (
        <PlaceSearch label="Find the place" onChoose={choose} />
      )}
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
      <p className="muted">
        Reports are limited to the {activeRegion().name} campus for now. A location you add is shown publicly with the
        report. Place search uses OpenStreetMap. Use your current location only if you are standing where the photo was
        taken.
      </p>
      <p className="muted" role="status">
        {status}
      </p>
    </fieldset>
  );
}

function round(degrees: number): number {
  return Math.round(degrees * 1e6) / 1e6;
}
