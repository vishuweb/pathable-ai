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
import { Icon, type IconName } from "./ui/Icon";

// The map needs the browser; the list works without it.
const CampusMap = dynamic(() => import("./CampusMap").then((m) => m.CampusMap), {
  ssr: false,
  loading: () => <div className="campus-map campus-map-loading skeleton">Loading the campus map…</div>,
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

export interface PlaceSignals {
  openBarriers: number;
  /** At least one published field survey is current. */
  surveyed: boolean;
  conflicts: number;
  outdated: number;
}

interface Props {
  regionName: string;
  boundary: [number, number][];
  places: ExplorerPlace[];
  initialQuery?: string;
  initialCategory?: PlaceCategory;
  /** Puts the cursor in the search box, for "Check a place". */
  focusSearch?: boolean;
  /** Per place key (type + id): each applicable feature and what is currently known about it. */
  featureIndex: Record<string, [string, Provenance][]>;
  /** Which needs each feature answers. */
  featureNeeds: Record<string, string[]>;
  signals: Record<string, PlaceSignals>;
  initialShow?: ShowFilter;
  recent: RecentItem[];
}

const keyOf = (p: { osmType: string; osmId: number }) => `${p.osmType}${p.osmId}`;

const CATEGORY_ICON: Partial<Record<PlaceCategory, IconName>> = {
  academic: "file",
  lecture: "users",
  library: "layers",
  admin: "clipboard",
  hostel: "pin",
  residential: "pin",
  food: "general",
  health: "shield",
  sports: "chart",
  parking: "map",
  entrance: "exit",
  path: "cognitive",
};

type Sort = "name" | "recorded" | "barriers";

/** Campus places: search, filter, sort, list and map. Only places inside the campus ever appear. */
const PAGE = 20;

export function PlaceExplorer({ regionName, boundary, places, initialQuery = "", initialCategory, focusSearch, featureIndex, featureNeeds, signals, initialShow, recent }: Props) {
  const { preferences } = usePreferences();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<PlaceCategory | "">(initialCategory ?? "");
  const [show, setShow] = useState<ShowFilter | "">(initialShow ?? "");
  const [sort, setSort] = useState<Sort>("name");
  // Open when arriving with a filter already in the address, so it is visible.
  const [filtersOpen, setFiltersOpen] = useState(Boolean(initialShow));
  const [view, setView] = useState<"list" | "map">("list");
  const [wide, setWide] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>();
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);
  // A long list is shown a page at a time; a new search or filter starts again at the top.
  const [limit, setLimit] = useState({ for: "", count: PAGE });
  const searchBox = useRef<HTMLInputElement>(null);
  const needs = preferences.needs;

  // On a wide screen the map sits beside the list; on a phone it is one or the other, and loads only when asked for.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 960px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (focusSearch) searchBox.current?.focus();
  }, [focusSearch]);

  const categoryOf = useMemo(() => new Map(places.map((p) => [keyOf(p), p.category])), [places]);
  const present = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));

  const relevant = useCallback(
    (p: PlaceResult) => {
      const features = featureIndex[keyOf(p)] ?? [];
      return needs.length ? features.filter(([id]) => featureNeeds[id]?.some((n) => needs.includes(n))) : features;
    },
    [featureIndex, featureNeeds, needs],
  );

  const shown: PlaceResult[] = useMemo(() => {
    const passes = (p: PlaceResult) => {
      const signal = signals[keyOf(p)];
      if (category && categoryOf.get(keyOf(p)) !== category) return false;
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
    const list = (results ?? places).filter(passes);
    const recorded = (p: PlaceResult) => relevant(p).filter(([, state]) => state !== "unknown").length;
    if (sort === "recorded") return [...list].sort((a, b) => recorded(b) - recorded(a) || a.name.localeCompare(b.name));
    if (sort === "barriers") return [...list].sort((a, b) => (signals[keyOf(b)]?.openBarriers ?? 0) - (signals[keyOf(a)]?.openBarriers ?? 0) || a.name.localeCompare(b.name));
    // A search keeps its relevance order unless another order is chosen.
    return results ? list : [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [results, places, category, categoryOf, show, sort, relevant, signals]);

  const listKey = [results ? "search" : "", category, show, sort].join("|");
  const visible = limit.for === listKey ? limit.count : PAGE;

  const mapPlaces = useMemo(() => shown.map((p) => ({ key: keyOf(p), name: p.name, href: placePath(p), latitude: p.latitude, longitude: p.longitude })), [shown]);

  const runSearch = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) {
        setResults(undefined);
        setStatus("");
        return;
      }
      setSearching(true);
      setStatus(`Searching ${regionName}…`);
      try {
        const res = await fetch(`/api/places?${new URLSearchParams({ q })}`);
        const data = (await res.json()) as { places: PlaceResult[] } | ApiError;
        if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : "The search failed.");
        setResults(data.places);
        setStatus(data.places.length ? `${data.places.length} ${data.places.length === 1 ? "place" : "places"} found within ${regionName}.` : `No matching place found within ${regionName} campus.`);
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
    void runSearch(initialQuery);
  }, [initialQuery, runSearch]);

  const clear = () => {
    setQuery("");
    setResults(undefined);
    setStatus("");
    searchBox.current?.focus();
  };

  /** "2 of 5 details for your needs recorded", from the visitor's saved needs. */
  const indicator = (place: PlaceResult) => {
    if (!needs.length) return undefined;
    const rows = relevant(place);
    if (!rows.length) return undefined;
    return `${rows.filter(([, state]) => state !== "unknown").length} of ${rows.length} details for your needs recorded`;
  };

  const filtering = Boolean(show || category);
  const emptyMessage =
    results && !show
      ? `No matching place found within ${regionName} campus.`
      : show === "checked"
        ? "No place shown here has been checked on site yet. That means nobody has recorded a check, not that there is nothing to find."
        : show === "barriers"
          ? "No place shown here has an open barrier report. That does not mean there are no barriers."
          : "No places match. Try another filter.";

  return (
    <div className="explorer">
      <form
        className="explorer-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
      >
        <label htmlFor="place-search" className="visually-hidden">
          Search {regionName}
        </label>
        <div className="explorer-search-row">
          <span className="explorer-search-box">
            <Icon name="search" />
            <input ref={searchBox} id="place-search" type="search" value={query} maxLength={120} autoComplete="off" list="explorer-places" placeholder="Search a building, hostel, gate or facility" onChange={(e) => setQuery(e.target.value)} />
          </span>
          <datalist id="explorer-places">
            {places.map((p) => (
              <option key={keyOf(p)} value={p.name} />
            ))}
          </datalist>
          <button type="submit" className="button-primary" disabled={searching}>
            Search
          </button>
          {results && (
            <button type="button" className="button-secondary" onClick={clear}>
              Show all places
            </button>
          )}
        </div>
      </form>

      <div className="explorer-filters">
        <div className="chip-row chip-row-scroll" role="group" aria-label="Kind of place">
          <button type="button" className="filter-button" aria-pressed={category === ""} onClick={() => setCategory("")}>
            All kinds
          </button>
          {present.map((c) => (
            <button key={c} type="button" className="filter-button" aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>
              {PLACE_CATEGORY_LABEL[c]} ({places.filter((p) => p.category === c).length})
            </button>
          ))}
        </div>
        <details className="filters-more" open={filtersOpen} onToggle={(e) => setFiltersOpen(e.currentTarget.open)}>
          <summary>
            Needs, filters and sort{needs.length || show || sort !== "name" ? " (in use)" : ""}
          </summary>
          <div className="explorer-filter-grid">
        <NeedGroupChips heading="Your needs" headingLevel={3} />
        <div className="explorer-selects">
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
          <label className="field">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="name">{results ? "Best match" : "Name, A to Z"}</option>
              <option value="recorded">Most recorded {needs.length ? "for my needs" : ""}</option>
              <option value="barriers">Open barrier reports first</option>
            </select>
          </label>
        </div>
          </div>
        </details>
      </div>

      <div className="explorer-bar">
        <p role="status" className="muted list-status">
          {searching || !filtering
            ? status || `${shown.length} ${shown.length === 1 ? "place" : "places"} on campus.`
            : `${shown.length} ${shown.length === 1 ? "place matches" : "places match"} ${category && !show ? `: ${PLACE_CATEGORY_LABEL[category].toLowerCase()}` : "this filter"}.`}
        </p>
        <div className="view-toggle" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            <Icon name="list" size={18} /> List
          </button>
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
            <Icon name="map" size={18} /> Map
          </button>
        </div>
      </div>

      <div className={`explorer-layout explorer-view-${view}`}>
        <div className="explorer-map">{(wide || view === "map") && <CampusMap label={`Map of ${regionName} with the places listed`} boundary={boundary} places={mapPlaces} />}</div>
        <div className="explorer-list">
          {shown.length === 0 ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <ul className="place-list">
              {shown.slice(0, visible).map((p) => {
                const signal = signals[keyOf(p)];
                const note = indicator(p);
                const kind = categoryOf.get(keyOf(p));
                return (
                  <li key={keyOf(p)} className="place-card">
                    <span className="place-card-icon">
                      <Icon name={(kind && CATEGORY_ICON[kind]) || "pin"} />
                    </span>
                    <div>
                      <Link href={placePath(p)}>{p.name}</Link>
                      <p className="muted">{kind ? PLACE_CATEGORY_LABEL[kind] : p.kind}</p>
                      {(note || signal?.surveyed || signal?.openBarriers || signal?.conflicts) ? (
                        <p className="place-signals">
                          {note && <span className="place-indicator">{note}</span>}
                          {signal?.surveyed && <span className="place-indicator">Checked on site</span>}
                          {Boolean(signal?.openBarriers) && (
                            <span className="place-indicator place-indicator-warn">
                              {signal.openBarriers} open barrier {signal.openBarriers === 1 ? "report" : "reports"}
                            </span>
                          )}
                          {Boolean(signal?.conflicts) && <span className="place-indicator place-indicator-warn">Records disagree</span>}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {shown.length > visible && (
            <button type="button" className="button-secondary list-more" onClick={() => setLimit({ for: listKey, count: visible + PAGE })}>
              Show {Math.min(PAGE, shown.length - visible)} more of {shown.length - visible}
            </button>
          )}
        </div>
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
