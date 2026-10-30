"use client";

import { useId, useState } from "react";
import type { PlaceResult } from "@/lib/place";
import type { ApiError } from "@/lib/types";

interface Props {
  label: string;
  onChoose: (place: PlaceResult) => void;
}

/** Searches OpenStreetMap through our server and lets the person pick one result. */
export function PlaceSearch({ label, onChoose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>();
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const resultsId = useId();

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setStatus("Type at least 3 characters to search for a place.");
      return;
    }
    setSearching(true);
    setStatus("Searching OpenStreetMap…");
    try {
      const res = await fetch(`/api/places?${new URLSearchParams({ q })}`);
      const data = (await res.json()) as { places: PlaceResult[] } | ApiError;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : "The search failed.");
      setResults(data.places);
      setStatus(
        data.places.length
          ? `${data.places.length} ${data.places.length === 1 ? "place" : "places"} found. Choose one below.`
          : "No places found. Try other words, such as the street and town.",
      );
    } catch (error) {
      setResults(undefined);
      setStatus(error instanceof Error ? error.message : "The search failed.");
    } finally {
      setSearching(false);
    }
  };

  const choose = (place: PlaceResult) => {
    setResults(undefined);
    setStatus(`Chosen: ${place.name}.`);
    onChoose(place);
  };

  return (
    <div className="place-search-block">
      <div className="place-search">
        <label className="field grow">
          {label}
          <input
            type="search"
            value={query}
            maxLength={120}
            autoComplete="off"
            placeholder="e.g. a station, street corner or building"
            aria-describedby={results ? resultsId : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
        </label>
        <button type="button" className="button-secondary" onClick={() => void search()} disabled={searching}>
          Search
        </button>
      </div>
      {results && results.length > 0 && (
        <fieldset className="place-results" id={resultsId}>
          <legend>Choose the place</legend>
          {results.map((place) => (
            <label key={`${place.osmType}${place.osmId}`} className="place-option">
              <input type="radio" name={`${resultsId}-result`} onChange={() => choose(place)} />
              <span>
                <strong>{place.name}</strong>
                <span className="muted"> {place.displayName}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="muted" role="status">
        {status}
      </p>
    </div>
  );
}
