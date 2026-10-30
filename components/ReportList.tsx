"use client";

import Link from "next/link";
import { useState } from "react";
import { NEED_GROUPS, NEED_GROUP_INFO, groupsOf, type NeedGroup } from "@/lib/needs";
import { usePreferences } from "@/lib/use-preferences";
import { NeedChips } from "./NeedChips";

export interface ReportListItem {
  id: string;
  title: string;
  createdLabel: string;
  statusLabel: string;
  statusKey: string;
  summary: string;
  /** Needs affected by barriers a person confirmed, corrected or added; AI-only suggestions do not count. */
  needs: NeedGroup[];
}

/** Shared reports, optionally narrowed to the kinds of need a visitor cares about. */
export function ReportList({ items }: { items: ReportListItem[] }) {
  const { preferences } = usePreferences();
  const [filter, setFilter] = useState<NeedGroup[]>([]);
  const mine = groupsOf(preferences);
  const shown = filter.length ? items.filter((item) => item.needs.some((n) => filter.includes(n))) : items;

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

      <p role="status" className="muted">
        {filter.length
          ? `Showing ${shown.length} of ${items.length} ${items.length === 1 ? "report" : "reports"}: those with a confirmed barrier affecting ${filter.map((g) => NEED_GROUP_INFO[g].short).join(" or ")}.`
          : `Showing all ${items.length} ${items.length === 1 ? "report" : "reports"}.`}
      </p>

      {shown.length === 0 ? (
        <p className="empty-state">
          No shared report has a confirmed barrier for this need yet. That does not mean places are accessible; it
          means nobody has reported a barrier here.
        </p>
      ) : (
        <ul className="report-list">
          {shown.map((item) => (
            <li key={item.id} className="report-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
              <img src={`/api/reports/${item.id}/image`} alt="" width={128} height={96} loading="lazy" />
              <div>
                <h2>
                  <Link href={`/reports/${item.id}`}>{item.title}</Link>
                </h2>
                <p className="muted">
                  {item.createdLabel} · Status: <span className={`chip status-${item.statusKey}`}>{item.statusLabel}</span>
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
