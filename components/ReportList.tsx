"use client";

import Link from "next/link";
import { useState } from "react";
import { NEED_GROUPS, NEED_GROUP_INFO, groupsOf, type NeedGroup } from "@/lib/needs";
import { distanceMeters, formatDistance } from "@/lib/place";
import { usePreferences } from "@/lib/use-preferences";
import { NeedChips } from "./NeedChips";
import { PlaceSearch } from "./PlaceSearch";

/** How far from the chosen place a report may be and still count as "near". */
const NEAR_METERS = 1000;

export interface ReportListItem {
  id: string;
  title: string;
  createdLabel: string;
  statusLabel: string;
  statusKey: string;
  summary: string;
  /** Plain statement of how precisely the report is located. */
  locationLabel: string;
  placeHref?: string;
  area?: string;
  /** Needs affected by barriers a person confirmed, corrected or added; AI-only suggestions do not count. */
  needs: NeedGroup[];
  latitude?: number;
  longitude?: number;
}

interface Centre {
  name: string;
  latitude: number;
  longitude: number;
}

/** Shared reports, optionally narrowed to the kinds of need a visitor cares about. */
export function ReportList({ items }: { items: ReportListItem[] }) {
  const { preferences } = usePreferences();
  const [filter, setFilter] = useState<NeedGroup[]>([]);
  const [centre, setCentre] = useState<Centre>();
  const [locating, setLocating] = useState("");
  const mine = groupsOf(preferences);
  const byNeed = filter.length ? items.filter((item) => item.needs.some((n) => filter.includes(n))) : items;
  const withDistance = byNeed.map((item) => ({
    item,
    distance:
      centre && item.latitude !== undefined && item.longitude !== undefined
        ? distanceMeters(centre, { latitude: item.latitude, longitude: item.longitude })
        : undefined,
  }));
  const shown = centre
    ? withDistance.filter((x) => x.distance !== undefined && x.distance <= NEAR_METERS).sort((a, b) => a.distance! - b.distance!)
    : withDistance;

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setLocating("Location is not available in this browser.");
    setLocating("Getting your location… It is used only in this browser and is not saved.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCentre({ name: "your location", latitude: p.coords.latitude, longitude: p.coords.longitude });
        setLocating("");
      },
      () => setLocating("Your location could not be found. You can search for a place instead."),
      { timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const toggle = (group: NeedGroup) =>
    setFilter((current) => (current.includes(group) ? current.filter((g) => g !== group) : [...current, group]));

  return (
    <>
      <div className="report-filter" role="group" aria-labelledby="filter-label">
        <p id="filter-label" className="filter-label">
          Show reports that affect:
        </p>
        <div className="filter-buttons">
          {NEED_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              className="filter-button"
              aria-pressed={filter.includes(group)}
              onClick={() => toggle(group)}
            >
              {filter.includes(group) && <span aria-hidden="true">✓ </span>}
              {NEED_GROUP_INFO[group].short}
            </button>
          ))}
        </div>
        <div className="filter-buttons">
          {mine.length > 0 && (
            <button type="button" className="button-link" onClick={() => setFilter(mine)}>
              Use my needs ({mine.map((g) => NEED_GROUP_INFO[g].short).join(", ")})
            </button>
          )}
          {mine.length === 0 && (
            <Link href="/needs" className="button-link">
              Set my needs
            </Link>
          )}
          {filter.length > 0 && (
            <button type="button" className="button-link" onClick={() => setFilter([])}>
              Show all
            </button>
          )}
        </div>
      </div>

      <details className="near-place" open={Boolean(centre)}>
        <summary>Near a place</summary>
        {centre ? (
          <p>
            Showing reports within {formatDistance(NEAR_METERS)} of <strong>{centre.name}</strong>, nearest first.{" "}
            <button type="button" className="button-link" onClick={() => setCentre(undefined)}>
              Clear place
            </button>
          </p>
        ) : (
          <>
            <PlaceSearch
              label="Find a place"
              onChoose={(p) => setCentre({ name: p.name, latitude: p.latitude, longitude: p.longitude })}
            />
            <button type="button" className="button-secondary" onClick={useMyLocation}>
              Near my location
            </button>
            <p className="muted" role="status">
              {locating}
            </p>
          </>
        )}
      </details>

      <p role="status" className="muted list-status">
        {`Showing ${shown.length} of ${items.length} ${items.length === 1 ? "report" : "reports"}`}
        {filter.length > 0 && ` with a confirmed barrier affecting ${filter.map((g) => NEED_GROUP_INFO[g].short).join(" or ")}`}
        {centre && ` near ${centre.name}`}.
      </p>

      {shown.length === 0 ? (
        <p className="empty-state">
          No shared report matches yet. That does not mean the area is accessible; it means nobody has reported a
          barrier here{centre ? " with a location" : ""}.
        </p>
      ) : (
        <ul className="report-list">
          {shown.map(({ item, distance }) => (
            <li key={item.id} className="report-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
              <img src={`/api/reports/${item.id}/image`} alt="" width={128} height={96} loading="lazy" />
              <div>
                <h2>
                  <Link href={`/reports/${item.id}`}>{item.title}</Link>
                </h2>
                <p className="muted">
                  {distance !== undefined && <strong>{formatDistance(distance)} away · </strong>}
                  {item.createdLabel} · Status: <span className={`chip status-${item.statusKey}`}>{item.statusLabel}</span>
                </p>
                <p>
                  <strong>{item.locationLabel}</strong>
                  {item.placeHref && (
                    <>
                      {" "}
                      <Link href={item.placeHref}>(place page)</Link>
                    </>
                  )}
                  {item.area && <> · {item.area}</>}
                </p>
                <p>{item.summary}</p>
                <NeedChips needs={item.needs} label="Confirmed barriers affect" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
