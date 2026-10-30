"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { placePath, type PlaceResult } from "@/lib/place";
import { PLACE_CATEGORIES, PLACE_CATEGORY_LABEL, type PlaceCategory } from "@/lib/place-categories";
import type { ApiError } from "@/lib/types";

// The map needs the browser; the list works without it.
const CampusMap = dynamic(() => import("./CampusMap").then((m) => m.CampusMap), {
  ssr: false,
  loading: () => <div className="campus-map campus-map-loading">Loading the campus map…</div>,
});

export interface ExplorerPlace extends PlaceResult {
  category: PlaceCategory;
}

interface Props {
  regionName: string;
  boundary: [number, number][];
  places: ExplorerPlace[];
}

/** Campus places: search, filter by kind, list and map. Only places inside the campus ever appear. */
export function PlaceExplorer({ regionName, boundary, places }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PlaceCategory | "">("");
  const [results, setResults] = useState<PlaceResult[]>();
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);

  const present = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
  const shown: PlaceResult[] = useMemo(
    () => results ?? places.filter((p) => !category || p.category === category),
    [results, places, category],
  );
  const mapPlaces = useMemo(
    () =>
      shown.map((p) => ({ key: `${p.osmType}${p.osmId}`, name: p.name, href: placePath(p), latitude: p.latitude, longitude: p.longitude })),
    [shown],
  );

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults(undefined);
      setStatus("");
      return;
    }
    setSearching(true);
    setStatus(`Searching ${regionName}…`);
    try {
      const params = new URLSearchParams({ q, ...(category ? { category } : {}) });
      const res = await fetch(`/api/places?${params}`);
      const data = (await res.json()) as { places: PlaceResult[] } | ApiError;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : "The search failed.");
      setResults(data.places);
      setStatus(
        data.places.length
          ? `${data.places.length} ${data.places.length === 1 ? "place" : "places"} found within ${regionName}.`
          : `No matching place found within ${regionName} campus.`,
      );
    } catch (error) {
      setResults(undefined);
      setStatus(error instanceof Error ? error.message : "The search failed.");
    } finally {
      setSearching(false);
    }
  };

  const clear = () => {
    setQuery("");
    setResults(undefined);
    setStatus("");
  };

  return (
    <div className="explorer">
      <form className="place-search" role="search" onSubmit={(e) => void search(e)}>
        <label className="field grow">
          Search {regionName}
          <input
            type="search"
            value={query}
            maxLength={120}
            autoComplete="off"
            placeholder="e.g. Central Library, Jasper Hostel, NLHC"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="submit" className="button-primary" disabled={searching}>
          Search
        </button>
        {results && (
          <button type="button" className="button-secondary" onClick={clear}>
            Show all places
          </button>
        )}
      </form>

      <div className="filter-buttons" role="group" aria-label="Kind of place">
        <button type="button" className="filter-button" aria-pressed={category === ""} onClick={() => setCategory("")}>
          All
        </button>
        {present.map((c) => (
          <button key={c} type="button" className="filter-button" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {PLACE_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <p role="status" className="muted list-status">
        {status || `${shown.length} ${shown.length === 1 ? "place" : "places"} on campus${category ? `: ${PLACE_CATEGORY_LABEL[category].toLowerCase()}` : ""}.`}
      </p>

      <div className="explorer-layout">
        <CampusMap label={`Map of ${regionName} with the places listed`} boundary={boundary} places={mapPlaces} />
        {shown.length === 0 ? (
          <p className="empty-state">{results ? `No matching place found within ${regionName} campus.` : "No places of this kind are recorded yet."}</p>
        ) : (
          <ul className="place-list">
            {shown.map((p) => (
              <li key={`${p.osmType}${p.osmId}`}>
                <Link href={placePath(p)}>{p.name}</Link>
                <span className="muted">
                  {p.kind} · Recorded in OpenStreetMap
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
