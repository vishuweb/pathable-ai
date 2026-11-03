"use client";

import Link from "next/link";
import { useState } from "react";
import { NEED_GROUPS, NEED_GROUP_INFO, type NeedGroup } from "@/lib/needs";
import { RESPONSE_LABEL, type ResponseKind } from "@/lib/observations";
import { formatDistance, type PlaceRef } from "@/lib/place";
import type { Barrier, Claim, Contribution, FeatureIntel, PlaceIntelligence } from "@/lib/place-intelligence";
import { groupsOfNeeds, orderBarriers, orderFeatures, orderGroups } from "@/lib/profile-order";
import { PROVENANCE_INFO, type Provenance } from "@/lib/provenance";
import { usePreferences } from "@/lib/use-preferences";
import { NeedChips } from "./NeedChips";
import { NeedGroupChips } from "./NeedGroupChips";
import { ObservationForm } from "./ObservationForm";
import { ObservationModeration } from "./ObservationModeration";

interface Props {
  place: PlaceRef & { latitude: number; longitude: number };
  intelligence: PlaceIntelligence;
  reportHref: string;
  sourceNote: string;
  isOwner?: boolean;
  /** Observations can be added only to places in the campus directory. */
  canContribute?: boolean;
}

type Response = {
  id: string;
  kind: ResponseKind;
  summary: string;
  finding: NonNullable<Claim["finding"]>;
  area: NonNullable<Claim["area"]>;
};

const date = (value?: string) => (value ? value.slice(0, 10) : undefined);

function Chip({ value, outdated }: { value: Provenance; outdated?: boolean }) {
  return (
    <span className={`provenance provenance-${value}`} title={PROVENANCE_INFO[value].description}>
      {PROVENANCE_INFO[value].label}
      {outdated && value !== "unknown" ? " · Outdated" : ""}
    </span>
  );
}

function ClaimItem({
  claim,
  feature,
  contributions,
  isOwner,
  onRespond,
}: {
  claim: Claim;
  feature: FeatureIntel;
  contributions: Map<string, Contribution>;
  isOwner?: boolean;
  onRespond: (feature: FeatureIntel, claim: Claim, kind: ResponseKind) => void;
}) {
  const own = claim.source === "observation";
  const photos = claim.contributionIds.filter((id) => contributions.get(id)?.hasPhoto);
  return (
    <li className={claim.inConflict ? "claim claim-conflict" : "claim"}>
      <Chip value={claim.provenance} outdated={claim.outdated} />: {claim.value}
      {claim.observedOn && (
        <span className="muted">
          {" "}
          · {claim.source === "osm" ? "checked" : "last seen"} {date(claim.observedOn)}
        </span>
      )}
      {claim.count > 1 && <span className="muted"> · {claim.count} separate reports of the same</span>}
      {claim.detail && <span className="muted"> · “{claim.detail}”</span>}
      <span className="muted block">{claim.scope}</span>
      {claim.verifiedNote && <span className="muted block">Checked: {claim.verifiedNote}</span>}
      {claim.verificationCaveat && <span className="muted block">{claim.verificationCaveat}</span>}
      {claim.outdated && <span className="warning block">Last seen more than two years ago. It may have changed; it is shown as recorded.</span>}
      {photos.map((id, i) => (
        <span key={id}>
          {" "}
          <a href={`/api/observations/${id}/image`} target="_blank" rel="noreferrer">
            photo{photos.length > 1 ? ` ${i + 1}` : ""} (opens in a new tab)
          </a>
        </span>
      ))}
      {claim.photoUrls?.map((url, i) => (
        <span key={url}>
          {" "}
          <a href={url} target="_blank" rel="noreferrer">
            survey photo{claim.photoUrls!.length > 1 ? ` ${i + 1}` : ""} (opens in a new tab)
          </a>
        </span>
      ))}
      {own && (
        <span className="claim-actions">
          {(["confirm", "dispute", "update"] as const).map((kind) => (
            <button key={kind} type="button" className="button-link" onClick={() => onRespond(feature, claim, kind)}>
              {RESPONSE_LABEL[kind]}
              <span className="visually-hidden">
                : {feature.label}, {claim.value}
              </span>
            </button>
          ))}
        </span>
      )}
      {isOwner && own && <ObservationModeration id={claim.id} verified={claim.provenance === "verified"} />}
    </li>
  );
}

function FeatureCard({
  feature,
  barriers,
  contributions,
  isOwner,
  onAdd,
  onRespond,
}: {
  feature: FeatureIntel;
  barriers: Map<string, Barrier>;
  contributions: Map<string, Contribution>;
  isOwner?: boolean;
  onAdd: (id: string) => void;
  onRespond: (feature: FeatureIntel, claim: Claim, kind: ResponseKind) => void;
}) {
  const open = feature.barrierIds.map((id) => barriers.get(id)).filter((b): b is Barrier => Boolean(b));
  return (
    <li className={`feature feature-${feature.current}`}>
      <div className="feature-head">
        <strong>{feature.label}</strong>
        <Chip value={feature.current} outdated={feature.outdated} />
        {feature.conflict && <span className="chip impact-medium">Records disagree</span>}
      </div>
      {feature.conflict && (
        <p className="warning" role="note">
          {feature.conflict.summary}
          {feature.conflict.hasVerified && " One of them is independently verified; the others are still shown."}
        </p>
      )}
      {feature.claims.length === 0 ? (
        <p className="feature-value muted">Unknown. Nobody has recorded this yet.</p>
      ) : (
        <ul className="source-list">
          {feature.claims.map((claim) => (
            <ClaimItem key={claim.id} claim={claim} feature={feature} contributions={contributions} isOwner={isOwner} onRespond={onRespond} />
          ))}
        </ul>
      )}
      {open.length > 0 && (
        <p className="warning" role="note">
          {open.length === 1 ? "An open barrier report" : `${open.length} open barrier reports`} may affect this (
          {open.map((b, i) => (
            <span key={b.reportId}>
              {i > 0 && ", "}
              <Link href={`/reports/${b.reportId}`}>{b.items[0].title}</Link>
            </span>
          ))}
          ). A report covers one spot; it does not describe the whole feature.
        </p>
      )}
      {feature.history.length > 0 && (
        <details className="claim-history">
          <summary>Earlier records that were updated ({feature.history.length})</summary>
          <ul className="source-list">
            {feature.history.map((claim) => (
              <li key={claim.id}>
                <Chip value={claim.provenance} />: {claim.value}
                {claim.observedOn && <span className="muted"> · last seen {date(claim.observedOn)}</span>}
                {claim.detail && <span className="muted"> · “{claim.detail}”</span>}
                <span className="muted"> · updated by a newer observation</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" className="button-link" onClick={() => onAdd(feature.id)}>
        {feature.claims.length ? "Add something new" : "Add what you saw"}
        <span className="visually-hidden">: {feature.label}</span>
      </button>
    </li>
  );
}

function BarrierCard({ barrier, affectsYou }: { barrier: Barrier; affectsYou?: boolean }) {
  return (
    <li className="report-item barrier">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
      <img src={`/api/reports/${barrier.reportId}/image`} alt={`Photo sent with the report: ${barrier.items[0].title}`} width={128} height={96} loading="lazy" />
      <div>
        <h3>
          <Link href={`/reports/${barrier.reportId}`}>{barrier.items.map((i) => i.title).join("; ")}</Link>
        </h3>
        <p className="muted">
          {[...new Set(barrier.items.map((i) => i.categoryLabel))].join(", ")}
          {barrier.areaLabel && ` · ${barrier.areaLabel}`} · Reported {date(barrier.reportedAt)}
          {barrier.observedOn && ` · seen ${barrier.observedOn}`}
        </p>
        <p>{barrier.items.map((i) => i.description).filter(Boolean).join(" ")}</p>
        <p className="muted">{barrier.scope}</p>
        <p>
          Status: <span className={`chip status-${barrier.status}`}>{barrier.statusLabel}</span> <Chip value={barrier.provenance} />
          {affectsYou && <span className="chip impact-high"> Affects your needs</span>}
        </p>
        {barrier.provenance === "reporter_confirmed" && (
          <p className="muted">Confirmed by the person who reported it. Nobody else has checked it yet.</p>
        )}
        {barrier.verifiedNote && <p className="muted">Checked: {barrier.verifiedNote}</p>}
        {barrier.verificationCaveat && <p className="muted">{barrier.verificationCaveat}</p>}
        {barrier.statusNote && !barrier.resolution && !barrier.closedAs && <p className="muted">Latest update: {barrier.statusNote}</p>}
        {barrier.resolution && (
          <p>
            Resolved {date(barrier.resolution.at)}: {barrier.resolution.note}
          </p>
        )}
        {barrier.closedAs && (
          <p className="muted">
            Closed{barrier.closedAs.duplicateOf ? " as a duplicate" : ""}: {barrier.closedAs.note}
          </p>
        )}
        {barrier.recheckDue && <p className="warning">Not rechecked for over a year. It may have been fixed or may have changed.</p>}
        {barrier.observationCoordinates && <p className="muted">The exact spot was recorded, separately from the place&apos;s position.</p>}
        <NeedChips needs={barrier.needGroups} label="May affect" />
        <p>
          <Link href={`/reports/${barrier.reportId}`}>Open the full report</Link>
        </p>
      </div>
    </li>
  );
}

/** What most visitors want to know first, shown until they say what matters to them. */
const KEY_FEATURES = ["wheelchair", "step_free_entrance", "steps", "ramp", "lift", "toilets_wheelchair", "tactile_paving", "hearing_loop", "signage"];

/** A place's accessibility profile, ordered around the visitor's own needs. */
export function PlaceProfileView({ place, intelligence, reportHref, sourceNote, isOwner, canContribute = true }: Props) {
  const { preferences, loaded } = usePreferences();
  const { features, barriers, resolved, contributions, surveys, summary } = intelligence;
  const [featureId, setFeatureId] = useState(features[0]?.id ?? "");
  const [response, setResponse] = useState<Response>();
  const chosen = preferences.needs;
  const { mine, rest } = orderFeatures(features, chosen);
  const unknownMine = mine.filter((f) => f.current === "unknown");
  const known = features.filter((f) => f.current !== "unknown");
  const unknownOthers = rest.filter((f) => f.current === "unknown");
  const key = KEY_FEATURES.flatMap((id) => features.find((f) => f.id === id) ?? []);
  const barrierById = new Map([...barriers, ...resolved].map((b) => [b.reportId, b]));
  const contributionById = new Map(contributions.map((c) => [c.id, c]));
  const groups = orderGroups(chosen);
  const myGroups = groupsOfNeeds(chosen);
  const orderedBarriers = orderBarriers(barriers, chosen);

  const jumpToForm = () => {
    document.getElementById("contribute")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("contribute-heading")?.focus();
  };
  const addFor = (id: string) => {
    setResponse(undefined);
    setFeatureId(id);
    jumpToForm();
  };
  const respond = (feature: FeatureIntel, claim: Claim, kind: ResponseKind) => {
    if (!claim.finding || !claim.area) return;
    setFeatureId(feature.id);
    setResponse({ id: claim.id, kind, summary: `${feature.label}: ${claim.value}`, finding: claim.finding, area: claim.area });
    jumpToForm();
  };

  const listOf = (rows: FeatureIntel[]) => (
    <ul className="features">
      {rows.map((f) => (
        <FeatureCard key={f.id} feature={f} barriers={barrierById} contributions={contributionById} isOwner={isOwner} onAdd={addFor} onRespond={respond} />
      ))}
    </ul>
  );

  return (
    <div className="profile">
      <section aria-labelledby="place-overview-title" className="profile-summary">
        <h2 id="place-overview-title">Place overview</h2>
        <dl className="summary-tiles">
          <div className="tile-osm">
            <dt>Recorded in OpenStreetMap</dt>
            <dd>{summary.byProvenance.osm}</dd>
          </div>
          <div className="tile-community">
            <dt>Recorded by the project team</dt>
            <dd>{summary.byProvenance.owner_recorded}</dd>
          </div>
          <div className="tile-community">
            <dt>Reported by visitors</dt>
            <dd>{summary.byProvenance.community}</dd>
          </div>
          <div className="tile-verified">
            <dt>Independently verified</dt>
            <dd>{summary.byProvenance.verified}</dd>
          </div>
          <div className="tile-unknown">
            <dt>Still unknown</dt>
            <dd>{summary.unknown}</dd>
          </div>
        </dl>
        <p className="muted">
          {summary.withRecord} of the {summary.features} details this page can hold have at least one record. That is a count of what is
          recorded, not a rating: a place is never called accessible because some details are recorded, and a place with no reports has
          not been shown to have no barriers.
        </p>
        <ul className="overview-facts">
          <li>
            {summary.openBarriers === 0
              ? "No open barrier reports are linked to this place."
              : `${summary.openBarriers} open barrier ${summary.openBarriers === 1 ? "report" : "reports"} linked to this place.`}
          </li>
          {summary.conflicts > 0 && (
            <li>
              {summary.conflicts} {summary.conflicts === 1 ? "detail has" : "details have"} records that disagree.
            </li>
          )}
          {summary.outdated > 0 && (
            <li>
              {summary.outdated} {summary.outdated === 1 ? "detail was" : "details were"} last seen more than two years ago.
            </li>
          )}
          <li>
            {summary.lastObservedOn ? `Most recent observation: ${summary.lastObservedOn}.` : "No visitor has observed anything here yet."}
            {summary.lastUpdatedAt && ` Last updated ${date(summary.lastUpdatedAt)}.`}
          </li>
        </ul>
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
            {listOf(key)}
          </>
        ) : (
          <>
            <p className="muted">
              For your needs: {NEED_GROUPS.filter((g) => myGroups.includes(g)).map((g) => NEED_GROUP_INFO[g].short).join(", ") || "none match this kind of place"}.{" "}
              <Link href="/needs">Change</Link> Everything else is still on this page, below.
            </p>
            {mine.length === 0 ? (
              <p className="empty-state">None of the details this page can hold match your chosen needs. Add what you know below.</p>
            ) : (
              <>
                <p role="status">
                  {mine.length - unknownMine.length} of {mine.length} details for your needs are recorded; {unknownMine.length}{" "}
                  {unknownMine.length === 1 ? "is" : "are"} unknown.
                </p>
                {groups
                  .filter((g) => mine.some((f) => f.group === g))
                  .map((group: NeedGroup) => (
                    <div key={group} className="overview-group">
                      <h3>{NEED_GROUP_INFO[group].label}</h3>
                      {listOf(mine.filter((f) => f.group === group))}
                    </div>
                  ))}
              </>
            )}
          </>
        )}
        <p className="muted">
          This is information to plan with, not a rating. A place is never called accessible because some details are recorded.
        </p>
      </section>

      <section aria-labelledby="reports-title" className="profile-section">
        <h2 id="reports-title">Reported barriers</h2>
        {barriers.length === 0 ? (
          <p className="empty-state">
            No barrier has been reported at this place. That does not mean there are none. <Link href={reportHref}>Report one</Link>.
          </p>
        ) : (
          <>
            <p className="muted">
              Each report is about the spot it describes, not the whole place. Only approved reports linked to this place by id are listed.
            </p>
            <ul className="report-list">
              {orderedBarriers.map(({ barrier, affectsYou }) => (
                <BarrierCard key={barrier.reportId} barrier={barrier} affectsYou={chosen.length > 0 && affectsYou} />
              ))}
            </ul>
          </>
        )}
        {resolved.length > 0 && (
          <details className="more-unknown">
            <summary>Resolved or closed reports ({resolved.length})</summary>
            <ul className="report-list">
              {resolved.map((barrier) => (
                <BarrierCard key={barrier.reportId} barrier={barrier} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {intelligence.nearby.length > 0 && (
        <section aria-labelledby="nearby-title" className="profile-section">
          <h2 id="nearby-title">Reported at places nearby</h2>
          <p className="muted">These are about other places close by, not this one. They may matter on your way here.</p>
          <ul className="source-list">
            {intelligence.nearby.map((b) => (
              <li key={b.reportId}>
                <Link href={`/reports/${b.reportId}`}>{b.title}</Link> <span className="muted">at {b.placeName}, about {formatDistance(b.distanceMeters)} away</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="known-title" className="profile-section">
        <h2 id="known-title">What is known</h2>
        <p className="source-note">{sourceNote}</p>
        {known.length === 0 ? (
          <p className="empty-state">Nothing has been recorded about this place yet. You can be the first to add something.</p>
        ) : (
          groups.map((group, index) => {
            const rows = known.filter((f) => f.group === group);
            if (!rows.length) return null;
            return (
              <details key={group} className="known-group" open={index === 0 || myGroups.includes(group) || rows.length <= 3}>
                <summary>
                  {NEED_GROUP_INFO[group].label} ({rows.length})
                </summary>
                {listOf(rows)}
              </details>
            );
          })
        )}
      </section>

      <section aria-labelledby="surveyed-title" className="profile-section">
        <h2 id="surveyed-title">What has been checked on site</h2>
        {surveys.length === 0 ? (
          <p className="empty-state">
            No field survey of this place has been published yet. That means nobody from the project has recorded a check here, not
            that there is nothing to find.
          </p>
        ) : (
          surveys.map((s) => (
            <details key={s.id} className="known-group" open={!s.supersededBy && surveys.length <= 2}>
              <summary>
                {s.checklistLabel}: {s.target} · seen {s.observedOn}
                {s.supersededBy ? " · replaced by a newer survey" : ""}
              </summary>
              <p>
                <Chip value={s.provenance} outdated={s.outdated} />
              </p>
              {s.checkNote && <p className="muted">Checked: {s.checkNote}</p>}
              {s.outdated && <p className="warning">Seen more than two years ago. It may have changed; it is shown as recorded.</p>}
              {s.notes && <p>{s.notes}</p>}
              <ul className="source-list">
                {[...s.assessed]
                  .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group))
                  .map((a) => (
                    <li key={a.attributeId}>
                      <strong>{a.label}</strong>: {a.value}
                      {a.method && <span className="muted"> · measured by {a.method}</span>}
                      {a.note && <span className="muted"> · “{a.note}”</span>}
                      {a.photoIds.map((id, i) => (
                        <span key={id}>
                          {" "}
                          <a href={`/api/surveys/photos/${id}`} target="_blank" rel="noreferrer">
                            photo{a.photoIds.length > 1 ? ` ${i + 1}` : ""} (opens in a new tab)
                          </a>
                        </span>
                      ))}
                    </li>
                  ))}
              </ul>
              {s.couldNotTell.length > 0 && <p className="muted">Looked, but could not tell: {s.couldNotTell.map((a) => a.label).join(", ")}.</p>}
              {s.notAssessed.length > 0 && <p className="muted">Not checked on this survey: {s.notAssessed.map((a) => a.label).join(", ")}.</p>}
              {s.coordinates && <p className="muted">The exact spot was recorded, separately from the place&apos;s position.</p>}
              <p className="muted">{s.limits}</p>
            </details>
          ))
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
            {groups.map((group) => {
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

      <section aria-labelledby="community-title" className="profile-section">
        <h2 id="community-title">Community contributions</h2>
        {contributions.length === 0 ? (
          <p className="empty-state">No visitor has added an observation here yet.</p>
        ) : (
          <details className="known-group">
            <summary>
              {contributions.length} {contributions.length === 1 ? "observation" : "observations"}, newest first
            </summary>
            <ul className="source-list contributions">
              {contributions.map((c) => (
                <li key={c.id}>
                  <strong>{c.featureLabel}</strong>: {c.finding} · {c.areaLabel} <Chip value={c.provenance} />
                  <span className="muted"> · seen {c.observedOn}</span>
                  {c.responseKind && <span className="muted"> · {RESPONSE_LABEL[c.responseKind].toLowerCase()}</span>}
                  {c.mergedInto && <span className="muted"> · counted together with an earlier report of the same</span>}
                  {c.superseded && <span className="muted"> · updated by a newer observation</span>}
                  {c.inConflict && <span className="warning"> · disagrees with another record</span>}
                  {c.note && <span className="muted"> · “{c.note}”</span>}
                  {c.verifiedNote && <span className="muted block">Checked: {c.verifiedNote}</span>}
                  {c.hasPhoto && (
                    <>
                      {" "}
                      <a href={`/api/observations/${c.id}/image`} target="_blank" rel="noreferrer">
                        photo (opens in a new tab)
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section id="contribute" aria-labelledby="contribute-heading" className="profile-section">
        <h2 id="contribute-heading" tabIndex={-1}>
          Help improve this place
        </h2>
        {canContribute ? (
          <ObservationForm
            place={{ osmType: place.osmType, osmId: place.osmId, name: place.name }}
            latitude={place.latitude}
            longitude={place.longitude}
            features={features.map((f) => ({ id: f.id, label: f.label }))}
            featureId={featureId}
            onFeatureChange={setFeatureId}
            reportHref={reportHref}
            response={response}
            onClearResponse={() => setResponse(undefined)}
          />
        ) : (
          <p className="muted">
            Observations can only be added to places in the campus directory. You can still{" "}
            <Link href={reportHref}>report a barrier here with a photo</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
