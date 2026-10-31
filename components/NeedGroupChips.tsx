"use client";

import Link from "next/link";
import { NEED_GROUPS, NEED_GROUP_INFO, groupsOf, needsOfGroups, type NeedGroup } from "@/lib/needs";
import { usePreferences } from "@/lib/use-preferences";

const CHIP_LABEL: Record<NeedGroup, string> = {
  mobility: "Mobility",
  vision: "Visual",
  hearing: "Hearing",
  cognitive: "Wayfinding",
  general: "Comfort",
};

/**
 * Quick, coarse choice of needs: each chip turns a whole group on or off, saved only on this
 * device. "My needs" offers the detailed choices.
 */
export function NeedGroupChips({ heading = "What matters to you?", headingLevel = 2 }: { heading?: string; headingLevel?: 2 | 3 }) {
  const { preferences, save } = usePreferences();
  const active = groupsOf(preferences);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  const toggle = (group: NeedGroup) => {
    const groupNeeds = new Set(needsOfGroups([group]));
    const on = active.includes(group);
    const needs = on ? preferences.needs.filter((id) => !groupNeeds.has(id)) : [...new Set([...preferences.needs, ...groupNeeds])];
    save({ ...preferences, needs });
  };

  return (
    <div className="need-group-chips" role="group" aria-labelledby="need-chips-heading">
      <Heading id="need-chips-heading" className="chips-heading">
        {heading}
      </Heading>
      <div className="filter-buttons">
        {NEED_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            className="filter-button"
            aria-pressed={active.includes(group)}
            aria-describedby={`need-chip-${group}`}
            onClick={() => toggle(group)}
          >
            {active.includes(group) && <span aria-hidden="true">✓ </span>}
            {CHIP_LABEL[group]}
          </button>
        ))}
      </div>
      <div className="visually-hidden">
        {NEED_GROUPS.map((group) => (
          <span key={group} id={`need-chip-${group}`}>
            {NEED_GROUP_INFO[group].description}
          </span>
        ))}
      </div>
      <p className="muted chips-hint">
        Choose any, or none to browse everything. Saved only on this device.{" "}
        <Link href="/needs">Choose in detail</Link>
      </p>
    </div>
  );
}
