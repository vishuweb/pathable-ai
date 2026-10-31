"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placePath, type PlaceResult } from "@/lib/place";
import { PLACE_CATEGORIES, PLACE_CATEGORY_LABEL, type PlaceCategory } from "@/lib/place-categories";
import type { Provenance } from "@/lib/provenance";
import type { ApiError } from "@/lib/types";
import { usePreferences } from "@/lib/use-preferences";
import { NeedGroupChips } from "./NeedGroupChips";

// The map needs the browser; the list works without it.
const CampusMap = dynamic(() => import("./CampusMap").then((m) => m.CampusMap), {
  ssr: false,
  loading: () => <div className="campus-map campus-map-loading">Loading the campus map…</div>,
});

export interface ExplorerPlace extends PlaceResult {
  category: PlaceCategory;
}

export interface RecentItem {
  id: string;
  placeName: string;
  placeHref: string;
  text: string;
  date: string;
  provenance: Provenance;
}

interface Props {
  regionName: string;
  boundary: [number, number][];
  places: ExplorerPlace[];
  initialQuery?: string;
  initialCategory?: PlaceCategory;
  /** Per place key (type + id): each applicable feature and what is currently known about it. */
  featureIndex: Record<string, [string, Provenance][]>;
  /** Which needs each feature answers. */
  featureNeeds: Record<string, string[]>;
  recent: RecentItem[];
}

const keyOf = (p: { osmType: string; osmId: number }) => `${p.osmType}${p.osmId}`;

/** Campus places: search, filter by kind, list and map. Only places inside the campus ever appear. */
export function PlaceExplorer({ regionName, boundary, places, initialQuery = "", initialCategory, featureIndex, featureNeeds, recent }: Props) {
  const { preferences } = usePreferences();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<PlaceCategory | "">(initialCategory ?? "");
  const [results, setResults] = useState<PlaceResult[]>();
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);

  const present = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
  const shown: PlaceResult[] = useMemo(
    () => results ?? places.filter((p) => !category || p.category === category),
    [results, places, category],
  );
  const mapPlaces = useMemo(
    () => shown.map((p) => ({ key: keyOf(p), name: p.name, href: placePath(p), latitude: p.latitude, longitude: p.longitude })),
    [shown],
  );

  const runSearch = useCallback(
    async (text: string, cat: PlaceCategory | "") => {
      const q = text.trim();
      if (!q) {
        setResults(undefined);
        setStatus("");
        return;
      }
      setSearching(true);
      setStatus(`Searching ${regionName}…`);
      try {
        const params = new URLSearchParams({ q, ...(cat ? { category: cat } : {}) });
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
    },
    [regionName],
  );

  // A search typed on the home page arrives as ?q=; run it once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initialQuery.trim()) return;
    started.current = true;
    void runSearch(initialQuery, initialCategory ?? "");
  }, [initialQuery, initialCategory, runSearch]);

  const clear = () => {
    setQuery("");
    setResults(undefined);
    setStatus("");
  };

  /** "2 of 5 details for your needs are recorded", from the visitor's saved needs. */
  const indicator = (place: PlaceResult) => {
    if (!preferences.needs.length) return undefined;
    const features = featureIndex[keyOf(place)];
    if (!features) return undefined;
    const relevant = features.filter(([id]) => featureNeeds[id]?.some((n) => preferences.needs.includes(n)));
    if (!relevant.length) return undefined;
    const recorded = relevant.filter(([, state]) => state !== "unknown").length;
    return `${recorded} of ${relevant.length} details for your needs recorded`;
  };

  return (
    <div className="explorer">
      <NeedGroupChips heading="Show what matters to you" headingLevel={2} />

      <form
        className="place-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query, category);
        }}
      >
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
        {status ||
          `${shown.length} ${shown.length === 1 ? "place" : "places"} on campus${category ? `: ${PLACE_CATEGORY_LABEL[category].toLowerCase()}` : ""}.`}
      </p>

      <div className="explorer-layout">
        <CampusMap label={`Map of ${regionName} with the places listed`} boundary={boundary} places={mapPlaces} />
        {shown.length === 0 ? (
          <p className="empty-state">
            {results ? `No matching place found within ${regionName} campus.` : "No places of this kind are recorded yet."}
          </p>
        ) : (
          <ul className="place-list">
            {shown.map((p) => {
              const note = indicator(p);
              return (
                <li key={keyOf(p)}>
                  <Link href={placePath(p)}>{p.name}</Link>
                  <span className="muted">{p.kind}</span>
                  {note && <span className="place-indicator">{note}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <section aria-labelledby="recent-title" className="recent">
        <h2 id="recent-title">Recently added by visitors</h2>
        {recent.length === 0 ? (
          <p className="empty-state">No visitor observations yet. Open a place and add what you saw.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={r.placeHref}>{r.placeName}</Link>: {r.text} <span className="muted">· {r.date}</span>{" "}
                <span className={`provenance provenance-${r.provenance}`}>{r.provenance === "verified" ? "Independently verified" : "Community reported"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
