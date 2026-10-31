"use client";

import Link from "next/link";
import { useState } from "react";
import { NEED_GROUPS, NEED_GROUP_INFO, type NeedGroup } from "@/lib/needs";
import type { PlaceRef } from "@/lib/place";
import { featuresForNeeds, type FeatureStatus } from "@/lib/place-profile";
import { PROVENANCE_INFO, type Provenance } from "@/lib/provenance";
import { usePreferences } from "@/lib/use-preferences";
import { NeedChips } from "./NeedChips";
import { NeedGroupChips } from "./NeedGroupChips";
import { ObservationModeration } from "./ObservationModeration";
import { ObservationForm } from "./ObservationForm";

export interface NearbyReport {
  id: string;
  title: string;
  distanceLabel: string;
  dateLabel: string;
  statusKey: string;
  statusLabel: string;
  statusNote: string;
  needs: NeedGroup[];
}

interface Props {
  place: PlaceRef & { latitude: number; longitude: number };
  features: FeatureStatus[];
  reports: NearbyReport[];
  reportHref: string;
  sourceNote: string;
  isOwner?: boolean;
}

function Provenance({ value, outdated }: { value: Provenance; outdated?: boolean }) {
  return (
    <span className={`provenance provenance-${value}`} title={PROVENANCE_INFO[value].description}>
      {PROVENANCE_INFO[value].label}
      {outdated && value !== "unknown" ? " · Outdated" : ""}
    </span>
  );
}

function FeatureRow({ feature, onAdd }: { feature: FeatureStatus; onAdd: (id: string) => void }) {
  const best = feature.sources[0];
  return (
    <li className={`feature feature-${feature.current}`}>
      <div className="feature-head">
        <strong>{feature.label}</strong>
        <Provenance value={feature.current} outdated={feature.outdated} />
      </div>
      {best ? (
        <p className="feature-value">
          {best.value}
          {best.date && <span className="muted"> · observed {best.date.slice(0, 10)}</span>}
        </p>
      ) : (
        <p className="feature-value muted">Unknown. Nobody has recorded this yet.</p>
      )}
      <button type="button" className="button-link" onClick={() => onAdd(feature.id)}>
        {best ? "Add or correct this" : "Add what you saw"}
        <span className="visually-hidden">: {feature.label}</span>
      </button>
    </li>
  );
}

/** What most visitors want to know first, shown until they say what matters to them. */
const KEY_FEATURES = ["wheelchair", "steps", "ramp", "lift", "toilets_wheelchair", "tactile_paving", "hearing_loop", "signage"];

/** A place's accessibility profile, ordered around the visitor's own needs. */
export function PlaceProfileView({ place, features, reports, reportHref, sourceNote, isOwner }: Props) {
  const { preferences, loaded } = usePreferences();
  const [featureId, setFeatureId] = useState(features[0]?.id ?? "");
  const chosen = preferences.needs;
  const mine = chosen.length ? featuresForNeeds(features, chosen) : [];
  const mineIds = new Set(mine.map((f) => f.id));
  const known = features.filter((f) => f.current !== "unknown");
  const unknownMine = mine.filter((f) => f.current === "unknown");
  const unknownOthers = features.filter((f) => f.current === "unknown" && !mineIds.has(f.id));
  const key = KEY_FEATURES.flatMap((id) => features.find((f) => f.id === id) ?? []);
  const counts = {
    verified: features.filter((f) => f.current === "verified").length,
    reported: features.filter((f) => f.current === "community").length,
    osm: features.filter((f) => f.current === "osm").length,
    unknown: features.filter((f) => f.current === "unknown").length,
  };

  const addFor = (id: string) => {
    setFeatureId(id);
    document.getElementById("contribute")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("contribute-heading")?.focus();
  };

  return (
    <div className="profile">
      <section aria-label="Summary of what is recorded" className="profile-summary">
        <dl className="summary-tiles">
          <div className="tile-osm">
            <dt>Recorded in OpenStreetMap</dt>
            <dd>{counts.osm}</dd>
          </div>
          <div className="tile-community">
            <dt>Reported by visitors</dt>
            <dd>{counts.reported}</dd>
          </div>
          <div className="tile-verified">
            <dt>Independently verified</dt>
            <dd>{counts.verified}</dd>
          </div>
          <div className="tile-unknown">
            <dt>Still unknown</dt>
            <dd>{counts.unknown}</dd>
          </div>
        </dl>
        <p className="muted">
          Counts of the {features.length} details this page can hold. Not a score: a place is never called accessible
          because some details are recorded.
        </p>
      </section>

      <section aria-labelledby="overview-title" className="profile-section overview">
        <h2 id="overview-title">Your accessibility overview</h2>
        {!loaded ? null : chosen.length === 0 ? (
          <>
            <p>
              Key details to check before you visit. Choose what matters to you and this page will show your own details
              first.
            </p>
            <NeedGroupChips heading="What matters to you?" headingLevel={3} />
            <ul className="features key-features">
              {key.map((f) => (
                <FeatureRow key={f.id} feature={f} onAdd={addFor} />
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="muted">
              For your needs:{" "}
              {NEED_GROUPS.filter((g) => mine.some((f) => f.group === g)).map((g) => NEED_GROUP_INFO[g].short).join(", ") || "none match this kind of place"}
              . <Link href="/needs">Change</Link>
            </p>
            {mine.length === 0 ? (
              <p className="empty-state">
                None of the details this page can hold match your chosen needs. Add what you know below.
              </p>
            ) : (
              <>
                <p role="status">
                  {mine.length - unknownMine.length} of {mine.length} details for your needs are recorded; {unknownMine.length}{" "}
                  {unknownMine.length === 1 ? "is" : "are"} unknown.
                </p>
                {NEED_GROUPS.map((group) => {
                  const rows = mine.filter((f) => f.group === group);
                  if (!rows.length) return null;
                  return (
                    <div key={group} className="overview-group">
                      <h3>{NEED_GROUP_INFO[group].label}</h3>
                      <ul className="features">
                        {rows.map((f) => (
                          <FeatureRow key={f.id} feature={f} onAdd={addFor} />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
        <p className="muted">
          This is information to plan with, not a rating. A place is never called accessible because some details are
          recorded.
        </p>
      </section>

      <section aria-labelledby="known-title" className="profile-section">
        <h2 id="known-title">What is known</h2>
        <p className="source-note">{sourceNote}</p>
        {known.length === 0 ? (
          <p className="empty-state">Nothing has been recorded about this place yet. You can be the first to add something.</p>
        ) : (
          <ul className="features">
            {known.map((f) => (
              <li key={f.id} className="feature">
                <div className="feature-head">
                  <strong>{f.label}</strong>
                  <Provenance value={f.current} outdated={f.outdated} />
                </div>
                <ul className="source-list">
                  {f.sources.map((s, i) => (
                    <li key={`${s.provenance}${s.observationId ?? i}`}>
                      <Provenance value={s.provenance} />: {s.value}
                      {s.date && <span className="muted"> · {s.date.slice(0, 10)}</span>}
                      {s.detail && <span className="muted"> · “{s.detail}”</span>}
                      {isOwner && s.observationId && (s.provenance === "community" || s.provenance === "verified") && (
                        <ObservationModeration id={s.observationId} verified={s.provenance === "verified"} />
                      )}
                      {s.hasPhoto && s.observationId && (
                        <>
                          {" "}
                          <a href={`/api/observations/${s.observationId}/image`} target="_blank" rel="noreferrer">
                            photo (opens in a new tab)
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="unknown-title" className="profile-section">
        <h2 id="unknown-title">What is still unknown</h2>
        {chosen.length > 0 && unknownMine.length > 0 && (
          <>
            <p>
              These could matter to your visit, and nobody has recorded them. If you can, ask someone at the place before
              you travel, or add what you see when you get there.
            </p>
            <ul className="unknown-list">
              {unknownMine.map((f) => (
                <li key={f.id}>
                  {f.label}{" "}
                  <button type="button" className="button-link" onClick={() => addFor(f.id)}>
                    Add what you saw<span className="visually-hidden">: {f.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {chosen.length > 0 && unknownMine.length === 0 && mine.length > 0 && (
          <p>Every detail for your chosen needs has at least one record. Check the source and date above before relying on it.</p>
        )}
        {unknownOthers.length > 0 && (
          <details className="more-unknown" open={chosen.length === 0}>
            <summary>
              {chosen.length ? "Other details nobody has recorded" : "Details nobody has recorded"} ({unknownOthers.length})
            </summary>
            {NEED_GROUPS.map((group) => {
              const rows = unknownOthers.filter((f) => f.group === group);
              if (!rows.length) return null;
              return (
                <div key={group} className="unknown-group">
                  <h3>{NEED_GROUP_INFO[group].label}</h3>
                  <ul className="unknown-list">
                    {rows.map((f) => (
                      <li key={f.id}>
                        {f.label}{" "}
                        <button type="button" className="button-link" onClick={() => addFor(f.id)}>
                          Add what you saw<span className="visually-hidden">: {f.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </details>
        )}
      </section>

      <section aria-labelledby="reports-title" className="profile-section">
        <h2 id="reports-title">Recent reports here</h2>
        {reports.length === 0 ? (
          <p className="empty-state">
            No barrier has been reported at or near this place. That does not mean there are none.{" "}
            <Link href={reportHref}>Report one</Link>.
          </p>
        ) : (
          <ul className="report-list">
            {reports.map((r) => (
              <li key={r.id} className="report-item">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
                <img src={`/api/reports/${r.id}/image`} alt="" width={128} height={96} loading="lazy" />
                <div>
                  <h3>
                    <Link href={`/reports/${r.id}`}>{r.title}</Link>
                  </h3>
                  <p className="muted">
                    {r.distanceLabel} · {r.dateLabel} · Status: <span className={`chip status-${r.statusKey}`}>{r.statusLabel}</span>
                  </p>
                  <p className="muted">{r.statusNote}</p>
                  <NeedChips needs={r.needs} label="Confirmed barriers affect" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="contribute" aria-labelledby="contribute-heading" className="profile-section">
        <h2 id="contribute-heading" tabIndex={-1}>
          Help improve this place
        </h2>
        <ObservationForm
          place={{ osmType: place.osmType, osmId: place.osmId, name: place.name }}
          latitude={place.latitude}
          longitude={place.longitude}
          features={features.map((f) => ({ id: f.id, label: f.label }))}
          featureId={featureId}
          onFeatureChange={setFeatureId}
          reportHref={reportHref}
        />
      </section>
    </div>
  );
}
