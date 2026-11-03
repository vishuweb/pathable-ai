import type { Metadata } from "next";
import Link from "next/link";
import { OwnerOnly } from "@/components/OwnerOnly";
import { SurveyImport } from "@/components/SurveyImport";
import { SurveyPriorityControl } from "@/components/SurveyPriorityControl";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { directory } from "@/lib/campus-directory";
import { computeCoverage, type QueueEntry } from "@/lib/coverage";
import { NEED_GROUPS, NEED_GROUP_INFO } from "@/lib/needs";
import { isOwner } from "@/lib/owner";
import { PLACE_CATEGORY_LABEL } from "@/lib/place-categories";
import { placePath } from "@/lib/place";
import { activeRegion } from "@/lib/region";
import { observations, reports, sublocations, surveyPriorities, surveys } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Survey coverage · PathAble AI" };

function Metric({ value, label, definition }: { value: number | string; label: string; definition: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <dd className="muted metric-definition">{definition}</dd>
    </div>
  );
}

export default async function CoveragePage() {
  if (!(await isOwner())) return <OwnerOnly title="Survey coverage" />;
  const region = activeRegion();
  const places = directory(region).map((p) => ({ osmType: p.osmType, osmId: p.osmId, name: p.name, category: p.category }));
  const [allSurveys, spots, allObservations, allReports, priorities] = await Promise.all([surveys.list(), sublocations.list(), observations.list(), reports.list(), surveyPriorities.list()]);
  const c = computeCoverage({ places, surveys: allSurveys, sublocations: spots, observations: allObservations, reports: allReports, priorities });
  const queueRow = (q: QueueEntry) => (
    <li key={`${q.place.osmType}/${q.place.osmId}`}>
      <div>
        <Link href={placePath(q.place)}>{q.place.name}</Link> <span className="muted">· {PLACE_CATEGORY_LABEL[q.place.category]}</span>
        <p className="muted">
          {q.level === "hold" ? `On hold${q.note ? `: ${q.note}` : ""}. ` : ""}
          {q.reasons.join(". ")}.{q.draftSurveys ? ` ${q.draftSurveys} unfinished ${q.draftSurveys === 1 ? "survey" : "surveys"}.` : ""}
        </p>
      </div>
      <div className="survey-queue-actions">
        <SurveyPriorityControl place={q.place} label={q.place.name} level={q.level} />
        <Link className="button-secondary" href={`/owner/survey?place=${q.place.osmType}/${q.place.osmId}`}>
          Survey<span className="visually-hidden"> {q.place.name}</span>
        </Link>
      </div>
    </li>
  );

  return (
    <section aria-labelledby="coverage-title">
      <WorkspaceNav />
      <h1 id="coverage-title">Survey coverage</h1>
      <p className="intro">
        How much of {region.name} has been looked at. These are counts of what has been recorded. A place with no records is unknown, a place with no reports has not been shown to have no barriers, and nothing here says any place is accessible.
      </p>

      <h2>Four kinds of coverage</h2>
      <dl className="metrics">
        <Metric value={c.directory.places} label="Directory coverage" definition="Places listed in the campus directory, from OpenStreetMap. It is not known how many campus places are missing from it." />
        <Metric value={c.survey.placesWithApprovedSurvey} label="Survey coverage" definition={`Of those ${c.directory.places} places, how many have at least one published survey. One survey of one ramp counts, so this does not mean surveyed in full.`} />
        <Metric value={`${c.attributes.assessed} of ${c.attributes.onStartedChecklists}`} label="Attribute coverage" definition="Lines assessed on published surveys, out of the lines on those same checklists. “Could not tell” is not assessed. Checklists nobody has started are not in the total." />
        <Metric value={c.verified.places} label="Independently verified coverage" definition="Places with at least one record checked by someone other than whoever recorded it, with a reason. Publishing does not count." />
      </dl>

      <h2>Places</h2>
      <dl className="metrics">
        <Metric value={c.placesWithAnyRecord} label="With any accessibility record" definition="Places with a published survey, or an approved observation or report linked to them." />
        <Metric value={c.placesIncomplete} label="With incomplete information" definition="Of those, places with no survey where every checklist line was assessed. Nearly all places will be here for a long time." />
        <Metric value={c.placesAwaitingReview} label="Awaiting review" definition="Places with a submitted survey, or a pending observation or linked report." />
        <Metric value={c.placesWithOutdatedRecord} label="With outdated information" definition="Places with a published survey or approved observation last seen more than two years ago." />
        <Metric value={c.surveyedSpots.entrances} label="Surveyed entrances" definition="Separate entrances with a published survey." />
        <Metric value={c.surveyedSpots.pathsAndCrossings} label="Surveyed paths and crossings" definition="Separate footpaths and crossings with a published survey." />
      </dl>

      <h2>Assessed lines by kind of need</h2>
      <p className="muted">Published survey lines assessed, by the need they mainly serve. These are not comparable as percentages: checklists have different lengths.</p>
      <ul className="overview-facts">
        {NEED_GROUPS.map((g) => (
          <li key={g}>
            {NEED_GROUP_INFO[g].label}: {c.byNeedGroup[g]}
          </li>
        ))}
      </ul>

      <section aria-labelledby="queue-title" className="profile-section">
        <h2 id="queue-title">Survey queue</h2>
        <p className="muted">
          Suggested order, with the reasons shown. It uses your own priorities, the kind of place, open barrier reports and whether a survey exists. It does not use how often a place is visited, because no such data exists yet. Being low on this list does not mean a place is fine.
        </p>
        <ol className="survey-queue">{c.queue.slice(0, 10).map(queueRow)}</ol>
        {c.queue.length > 10 && (
          <details className="more-unknown">
            <summary>The rest of the queue ({c.queue.length - 10})</summary>
            <ol className="survey-queue" start={11}>
              {c.queue.slice(10).map(queueRow)}
            </ol>
          </details>
        )}
        <details className="more-unknown">
          <summary>Every place with no published survey ({c.unsurveyed.length})</summary>
          <ul className="survey-list">
            {c.unsurveyed.map((p) => (
              <li key={`${p.osmType}/${p.osmId}`}>
                <Link href={placePath(p)}>{p.name}</Link>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section aria-labelledby="data-title" className="profile-section">
        <h2 id="data-title">Import and export</h2>
        <p className="muted">
          One row per recorded attribute: place_osm_type, place_osm_id, checklist, attribute, value, unit, method, note, observed_on, and optionally sublocation_type, sublocation_name, latitude, longitude, source, source_reference. Imported records arrive waiting for review. They are never public or verified on arrival and never replace anything.
        </p>
        <SurveyImport />
        <h3>Export</h3>
        <ul className="overview-facts">
          <li>
            Public data (approved surveys, public fields): <a href="/api/survey-data?scope=public&format=csv">CSV</a> · <a href="/api/survey-data?scope=public">JSON</a>
          </li>
          <li>
            Full backup, with drafts and private notes. Keep it private: <a href="/api/survey-data?scope=full&format=csv">CSV</a> · <a href="/api/survey-data?scope=full">JSON</a>
          </li>
        </ul>
      </section>
    </section>
  );
}
