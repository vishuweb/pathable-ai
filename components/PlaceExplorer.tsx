"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placePath, type PlaceResult } from "@/lib/place";
import { PLACE_CATEGORIES, PLACE_CATEGORY_LABEL, type PlaceCategory, type ShowFilter } from "@/lib/place-categories";
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
  signals: Record<string, PlaceSignals>;
  initialShow?: ShowFilter;
  recent: RecentItem[];
}

export interface PlaceSignals {
  openBarriers: number;
  /** At least one published field survey is current. */
  surveyed: boolean;
  conflicts: number;
  outdated: number;
}

const keyOf = (p: { osmType: string; osmId: number }) => `${p.osmType}${p.osmId}`;

/** Campus places: search, filter by kind, list and map. Only places inside the campus ever appear. */
export function PlaceExplorer({ regionName, boundary, places, initialQuery = "", initialCategory, featureIndex, featureNeeds, signals, initialShow, recent }: Props) {
  const { preferences } = usePreferences();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<PlaceCategory | "">(initialCategory ?? "");
  const [show, setShow] = useState<ShowFilter | "">(initialShow ?? "");
  const [results, setResults] = useState<PlaceResult[]>();
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);

  const present = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
  const needs = preferences.needs;
  const shown: PlaceResult[] = useMemo(() => {
    // Details for the visitor's needs, or all details if they have not chosen any.
    const relevant = (p: PlaceResult) => {
      const features = featureIndex[keyOf(p)] ?? [];
      return needs.length ? features.filter(([id]) => featureNeeds[id]?.some((n) => needs.includes(n))) : features;
    };
    const passes = (p: PlaceResult) => {
      const signal = signals[keyOf(p)];
      switch (show) {
        case "checked":
          return Boolean(signal?.surveyed);
        case "barriers":
          return Boolean(signal?.openBarriers);
        case "recorded":
          return relevant(p).some(([, state]) => state !== "unknown");
        case "gaps":
          return !relevant(p).some(([, state]) => state !== "unknown");
        default:
          return true;
      }
    };
    return (results ?? places.filter((p) => !category || p.category === category)).filter(passes);
  }, [results, places, category, show, needs, featureIndex, featureNeeds, signals]);
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
            placeholder="Type a building, hostel, gate or facility"
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

      <div className="explorer-toolbar">
        <label className="field">
          Kind of place
          <select value={category} onChange={(e) => setCategory(e.target.value as PlaceCategory | "")}>
            <option value="">All kinds ({places.length})</option>
            {present.map((c) => (
              <option key={c} value={c}>
                {PLACE_CATEGORY_LABEL[c]} ({places.filter((p) => p.category === c).length})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Show
          <select value={show} onChange={(e) => setShow(e.target.value as ShowFilter | "")}>
            <option value="">All places</option>
            <option value="checked">Checked on site by the project team</option>
            <option value="barriers">With an open barrier report</option>
            <option value="recorded">With something recorded {needs.length ? "for my needs" : ""}</option>
            <option value="gaps">Nothing recorded yet {needs.length ? "for my needs" : ""} (help fill the gap)</option>
          </select>
        </label>
        <NeedGroupChips heading="Your needs" headingLevel={3} />
      </div>

      <p role="status" className="muted list-status">
        {searching || !show
          ? status || `${shown.length} ${shown.length === 1 ? "place" : "places"} on campus${category ? `: ${PLACE_CATEGORY_LABEL[category].toLowerCase()}` : ""}.`
          : `${shown.length} ${shown.length === 1 ? "place matches" : "places match"} this filter.`}
      </p>

      <div className="explorer-layout">
        <CampusMap label={`Map of ${regionName} with the places listed`} boundary={boundary} places={mapPlaces} />
        {shown.length === 0 ? (
          <p className="empty-state">
            {results && !show
              ? `No matching place found within ${regionName} campus.`
              : show === "checked"
                ? "No place shown here has been checked on site yet. That means nobody has recorded a check, not that there is nothing to find."
                : show === "barriers"
                  ? "No place shown here has an open barrier report. That does not mean there are no barriers."
                  : "No places match. Try another filter."}
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
                  {signals[keyOf(p)]?.surveyed && <span className="place-indicator">Checked on site</span>}
                  {Boolean(signals[keyOf(p)]?.openBarriers) && (
                    <span className="place-indicator">
                      {signals[keyOf(p)].openBarriers} open barrier {signals[keyOf(p)].openBarriers === 1 ? "report" : "reports"}
                    </span>
                  )}
                  {Boolean(signals[keyOf(p)]?.conflicts) && <span className="place-indicator">Records disagree</span>}
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
