"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEMO_NOTICE, demoReport, type DemoScenario as Scenario, type DemoIllustration } from "@/lib/demo/fixtures";
import { NEED_GROUPS, NEED_GROUP_INFO, needsOfGroups, type NeedGroup } from "@/lib/needs";
import { FINDING_LABEL, OBSERVATION_FINDINGS, type Observation, type ObservationFinding } from "@/lib/observations";
import { buildPlaceIntelligence } from "@/lib/place-intelligence";
import { orderFeatures } from "@/lib/profile-order";
import { PROVENANCE_INFO, type Provenance } from "@/lib/provenance";
import type { StatusEvent } from "@/lib/report-status";
import { Icon } from "../ui/Icon";
import { StepProgress } from "../ui/StepProgress";

const STEPS = ["Discover", "Your view", "AI evidence", "Verification", "Contribute"];
const NOW = new Date("2026-11-01T00:00:00Z");
const SUBMITTED: StatusEvent = { status: "submitted", at: "2026-10-22T09:00:00Z", note: "" };

function Chip({ value }: { value: Provenance }) {
  return <span className={`provenance provenance-${value}`}>{PROVENANCE_INFO[value].label}</span>;
}

/** Drawn, not photographed, so it can never be mistaken for evidence from a real place. */
function Illustration({ kind, alt, outlines }: { kind: DemoIllustration; alt: string; outlines: { id: string; x: number; y: number; width: number; height: number; state: "pending" | "confirmed" | "rejected" }[] }) {
  return (
    <figure className="demo-figure">
      <svg viewBox="0 0 400 260" role="img" aria-label={alt}>
        <rect width="400" height="260" fill="#e9e7df" />
        <rect y="205" width="400" height="55" fill="#cfccc0" />
        {kind === "ramp" && (
          <g>
            <path d="M40 205 L200 110 L200 205 Z" fill="#b5b2a5" stroke="#4d5a57" strokeWidth="2" />
            <path d="M200 110 h60 v15 h20 v20 h20 v20 h20 v40 h-120 z" fill="#a09d90" stroke="#4d5a57" strokeWidth="2" />
            <rect x="240" y="190" width="85" height="14" rx="6" fill="#16211f" />
            <circle cx="252" cy="222" r="14" fill="#16211f" />
            <circle cx="315" cy="222" r="14" fill="#16211f" />
            <path d="M262 190 l-10 -22 h24" fill="none" stroke="#16211f" strokeWidth="5" />
            <path d="M120 110 L160 130" stroke="#7a776b" strokeWidth="3" />
          </g>
        )}
        {kind === "corridor" && (
          <g>
            <rect x="0" y="0" width="400" height="205" fill="#dedbd1" />
            <rect x="60" y="30" width="70" height="175" fill="#b5b2a5" stroke="#4d5a57" strokeWidth="2" />
            <rect x="255" y="70" width="75" height="42" fill="#0b5d5b" stroke="#16211f" strokeWidth="2" />
            <path d="M292 112 v93" stroke="#a09d90" strokeDasharray="6 6" strokeWidth="2" />
            <path d="M0 205 H400" stroke="#4d5a57" strokeWidth="2" />
          </g>
        )}
        {kind === "alarm" && (
          <g>
            <rect x="0" y="0" width="400" height="205" fill="#dedbd1" />
            <circle cx="200" cy="100" r="34" fill="#a31f1f" stroke="#16211f" strokeWidth="2" />
            <circle cx="200" cy="100" r="8" fill="#e9e7df" />
            <rect x="290" y="70" width="60" height="60" fill="none" stroke="#4d5a57" strokeWidth="2" strokeDasharray="6 6" />
            <text x="320" y="150" textAnchor="middle" fontSize="13" fill="#16211f">
              ?
            </text>
          </g>
        )}
        {kind === "signpost" && (
          <g>
            <rect x="193" y="30" width="14" height="175" fill="#4d5a57" />
            <path d="M120 50 H200 V85 H120 L100 67 Z" fill="#0b5d5b" />
            <path d="M200 95 H280 L300 112 L280 130 H200 Z" fill="#0b5d5b" />
            <text x="150" y="73" fill="#fff" fontSize="15" textAnchor="middle">
              Office
            </text>
            <text x="245" y="118" fill="#fff" fontSize="15" textAnchor="middle">
              Office
            </text>
          </g>
        )}
        {outlines
          .filter((o) => o.state !== "rejected")
          .map((o) => (
            <rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} rx="6" fill="rgb(180 83 9 / 0.18)" stroke="#b45309" strokeWidth="3" strokeDasharray={o.state === "pending" ? "7 5" : undefined} />
          ))}
      </svg>
      <figcaption>Illustration, not a photograph. The dashed outline is where a sample AI suggestion points.</figcaption>
    </figure>
  );
}

/** One worked example. It runs the product's real aggregation over sample data, in this browser only: nothing is sent or saved. */
export function DemoScenario({ scenario }: { scenario: Scenario }) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [needs, setNeeds] = useState<NeedGroup[]>([scenario.need]);
  const [decisions, setDecisions] = useState<Record<string, "confirmed" | "rejected">>({});
  const [approved, setApproved] = useState(false);
  const [checked, setChecked] = useState(false);
  const [added, setAdded] = useState<Observation[]>([]);
  const [finding, setFinding] = useState<ObservationFinding>("present");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const confirmed = scenario.candidates.filter((c) => decisions[c.id] === "confirmed").map((c) => c.id);
  const allDecided = scenario.candidates.every((c) => decisions[c.id]);
  const history: StatusEvent[] = checked ? [SUBMITTED, { status: "verified", at: "2026-10-25T09:00:00Z", note: "Sample check: someone else went and looked." }] : [SUBMITTED];

  const intel = useMemo(
    () =>
      buildPlaceIntelligence({
        place: scenario.place,
        tags: scenario.tags,
        observations: [...scenario.observations, ...added],
        // Until it is approved, a report contributes nothing to the place, exactly as on the real site.
        reports: approved && confirmed.length ? [demoReport(scenario, confirmed, history)] : [],
        now: NOW,
      }),
    [scenario, added, approved, checked, confirmed.join()], // eslint-disable-line react-hooks/exhaustive-deps -- history follows checked; confirmed is compared by value
  );
  const { mine, rest } = orderFeatures(intel.features, needsOfGroups(needs));
  const places = [scenario.place.name, ...scenario.otherPlaces].filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()));
  const contributeLabel = intel.features.find((f) => f.id === scenario.contributeFeature)?.label ?? scenario.contributeFeature;

  const next = (label: string) => (
    <p className="flow-actions">
      {step > 0 && (
        <button type="button" className="button-secondary" onClick={() => setStep(step - 1)}>
          Back
        </button>
      )}
      <button type="button" className="button-primary" onClick={() => setStep(step + 1)}>
        {label} <Icon name="arrow" size={18} />
      </button>
    </p>
  );

  return (
    <div className="demo-scenario">
      <p className="back-link">
        <Link href="/demo">← All demo scenarios</Link>
      </p>
      <h1>{scenario.title}</h1>
      <p className="intro">{scenario.summary}</p>
      <StepProgress steps={STEPS} current={step} />

      {step === 0 && (
        <section className="flow-panel" aria-labelledby="demo-discover">
          <h2 id="demo-discover">Discover a destination</h2>
          <p className="muted">On the real site this searches the campus directory. These sample places are fictional.</p>
          <label className="field">
            Search sample places
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <ul className="demo-places">
            {places.map((name) => (
              <li key={name}>
                {name === scenario.place.name ? (
                  <button type="button" className="demo-place" onClick={() => setStep(1)}>
                    <strong>{name}</strong>
                    <span className="muted">{scenario.place.category} · sample place</span>
                    <Icon name="chevron" size={18} />
                  </button>
                ) : (
                  <span className="demo-place demo-place-off">
                    <strong>{name}</strong>
                    <span className="muted">Not part of this scenario</span>
                  </span>
                )}
              </li>
            ))}
            {places.length === 0 && <li className="muted">No sample place matches.</li>}
          </ul>
        </section>
      )}

      {step === 1 && (
        <section className="flow-panel" aria-labelledby="demo-profile">
          <h2 id="demo-profile">{scenario.place.name}: your view</h2>
          <p className="muted">Choose needs below and watch the order change. Nothing is hidden, and these choices are not saved.</p>
          <div className="chip-row" role="group" aria-label="Needs for this demo">
            {NEED_GROUPS.map((g) => (
              <button key={g} type="button" className="filter-button" aria-pressed={needs.includes(g)} onClick={() => setNeeds(needs.includes(g) ? needs.filter((n) => n !== g) : [...needs, g])}>
                {NEED_GROUP_INFO[g].short}
              </button>
            ))}
          </div>
          <h3>For your needs ({mine.length})</h3>
          <ul className="demo-features">
            {mine.slice(0, 6).map((f) => (
              <li key={f.id}>
                <span>{f.label}</span> <Chip value={f.current} />
                {f.conflict && <span className="chip impact-medium"> Records disagree</span>}
              </li>
            ))}
          </ul>
          <details className="known-group">
            <summary>Everything else ({rest.length})</summary>
            <ul className="demo-features">
              {rest.map((f) => (
                <li key={f.id}>
                  <span>{f.label}</span> <Chip value={f.current} />
                </li>
              ))}
            </ul>
          </details>
          {mine.some((f) => f.conflict) && <p className="warning">Two records disagree here. Both are kept, and none is chosen as correct.</p>}
          {next("See the sample evidence")}
        </section>
      )}

      {step === 2 && (
        <section className="flow-panel" aria-labelledby="demo-ai">
          <h2 id="demo-ai">Review the AI&apos;s suggestions</h2>
          <p className="muted">These sample suggestions start as AI suggested. Only your decision takes them further.</p>
          <div className="demo-evidence">
            <Illustration
              kind={scenario.illustration}
              alt={scenario.illustrationAlt}
              outlines={scenario.candidates.map((c) => ({ id: c.id, ...c.outline, state: decisions[c.id] ?? "pending" }))}
            />
            <ul className="demo-candidates">
              {scenario.candidates.map((c) => (
                <li key={c.id}>
                  <p>
                    <Chip value={decisions[c.id] === "confirmed" ? "reporter_confirmed" : "ai"} /> <strong>{c.title}</strong>
                  </p>
                  <p>{c.observed}</p>
                  <div role="group" aria-label={`Your decision on: ${c.title}`} className="flow-actions">
                    <button type="button" className="filter-button" aria-pressed={decisions[c.id] === "confirmed"} onClick={() => setDecisions({ ...decisions, [c.id]: "confirmed" })}>
                      Confirm
                    </button>
                    <button type="button" className="filter-button" aria-pressed={decisions[c.id] === "rejected"} onClick={() => setDecisions({ ...decisions, [c.id]: "rejected" })}>
                      Reject
                    </button>
                  </div>
                  {decisions[c.id] && (
                    <p className="demo-lesson" role="status">
                      {c.lesson}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {allDecided ? next("See what happens next") : <p className="muted">Decide on each suggestion to continue.</p>}
        </section>
      )}

      {step === 3 && (
        <section className="flow-panel" aria-labelledby="demo-verify">
          <h2 id="demo-verify">Understand verification</h2>
          <p className="muted">Each stage means something different. Try them in order and watch the place page below.</p>
          <ol className="demo-ladder">
            <li className="step-done">
              <strong>Reported.</strong> {confirmed.length ? "You confirmed it, so it is ready for review, but it is private." : "You rejected every suggestion, so there is no barrier to publish. That is a valid result."}
            </li>
            <li className={approved ? "step-done" : undefined}>
              <strong>Approved to publish.</strong> The owner checks it is suitable to show. That is not the same as checking it is true.{" "}
              <button type="button" className="button-secondary" disabled={approved || !confirmed.length} onClick={() => setApproved(true)}>
                {approved ? "Approved" : "Approve this sample"}
              </button>
            </li>
            <li className={checked ? "step-done" : undefined}>
              <strong>Independently verified.</strong> Someone other than the reporter looks, and records why.{" "}
              <button type="button" className="button-secondary" disabled={checked || !approved} onClick={() => setChecked(true)}>
                {checked ? "Checked" : "Record a sample check"}
              </button>
            </li>
          </ol>
          <h3>{scenario.place.name} now shows</h3>
          {intel.barriers.length === 0 ? (
            <p className="empty-state">No barrier is listed yet. A place with no reports has not been shown to have no barriers.</p>
          ) : (
            <ul className="demo-features">
              {intel.barriers.map((b) => (
                <li key={b.reportId}>
                  <span>{b.items[0].title}</span> <Chip value={b.provenance} />
                  <span className="muted block">{b.scope}</span>
                </li>
              ))}
            </ul>
          )}
          {next("Add what you saw")}
        </section>
      )}

      {step >= 4 && (
        <section className="flow-panel" aria-labelledby="demo-contribute">
          <h2 id="demo-contribute">Contribute an observation</h2>
          <p className="muted">On the real site this would wait for approval. Here it stays in this browser, and nothing is sent.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAdded([...added, { ...scenario.observations[0], id: `d2000000-0000-4000-8000-${String(added.length + 1).padStart(12, "0")}`, place: scenario.place, featureId: scenario.contributeFeature, finding, area: "other", note, observedOn: "2026-10-30", createdAt: "2026-10-30T10:00:00Z", latitude: 0, longitude: 0, hasPhoto: false, consentedAt: "2026-10-30T10:00:00Z", statusHistory: [{ status: "community", at: "2026-10-30T10:00:00Z", note: "" }] }]);
              setNote("");
              setMessage("Added to this demo only. In real use it would be private until approved.");
            }}
          >
            <p>
              About: <strong>{contributeLabel}</strong>
            </p>
            <label className="field">
              What did you find?
              <select value={finding} onChange={(e) => setFinding(e.target.value as ObservationFinding)}>
                {OBSERVATION_FINDINGS.map((f) => (
                  <option key={f} value={f}>
                    {FINDING_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Note <span className="muted">(optional)</span>
              <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <p>
              <button type="submit" className="button-primary">
                Add to this demo
              </button>
            </p>
            <p role="status" className="muted">
              {message}
            </p>
          </form>
          {intel.features
            .filter((f) => f.id === scenario.contributeFeature)
            .map((f) => (
              <div key={f.id}>
                <h3>{f.label} now shows</h3>
                <p>
                  <Chip value={f.current} /> {f.conflict && <span className="chip impact-medium">Records disagree</span>}
                </p>
                <ul className="demo-features">
                  {f.claims.map((c) => (
                    <li key={c.id}>
                      {c.value}
                      {c.detail && <span className="muted"> · “{c.detail}”</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <div className="demo-end">
            <p>
              <strong>{DEMO_NOTICE}</strong> That is the whole flow. The real site works the same way, with real places and real records.
            </p>
            <p className="flow-actions">
              <Link className="button-primary" href="/places">
                Explore the real campus
              </Link>
              <Link className="button-secondary" href="/demo">
                Try another scenario
              </Link>
              <button type="button" className="button-secondary" onClick={() => setStep(3)}>
                Back
              </button>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
