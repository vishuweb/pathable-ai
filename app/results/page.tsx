import type { Metadata } from "next";
import { CATEGORY_INFO } from "@/lib/categories";
import { ALL_DATASETS, computeMetrics, evaluationReports, rate, type DatasetMetrics, type Rate } from "@/lib/metrics";
import { ownerKeyRequired } from "@/lib/owner";
import { drafts, reports } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results · PathAble AI" };

const DATASET_LABEL: Record<string, string> = {
  [ALL_DATASETS]: "All photos",
  own: "Your photos",
  web: "Web photos",
  single: "Single uploads",
};

/** Below this many reviewed photos, headline percentages would mislead, so only counts and ranges are shown. */
const MIN_PHOTOS_FOR_HEADLINES = 20;

export default async function ResultsPage() {
  const [everything, queued] = await Promise.all([reports.list(), drafts.list()]);
  const { included: saved, excluded } = evaluationReports(everything, { publicSite: ownerKeyRequired() });
  const metrics = computeMetrics(saved);
  const all = metrics[0];

  return (
    <section aria-labelledby="results-title" className="results-page">
      <div className="page-heading">
        <h1 id="results-title">Measured results</h1>
        {saved.length > 0 && (
          <a className="button-secondary" href="/api/results" download="pathable-results.json">
            Download as JSON
          </a>
        )}
      </div>
      <p className="intro">
        How often are the AI&apos;s suggestions right? These numbers come from the project owner&apos;s review of
        batches of photos: every suggestion was confirmed, corrected or rejected, and missed barriers were added.
        Shared reports from visitors are not counted. Based on <strong>{saved.length}</strong> reviewed{" "}
        {saved.length === 1 ? "photo" : "photos"}.
        {queued.length > 0 && ` ${queued.length} more ${queued.length === 1 ? "is" : "are"} waiting for review.`}
        {excluded > 0 &&
          ` ${excluded} single-photo ${excluded === 1 ? "report is" : "reports are"} not counted, because only reviewed batches are.`}
      </p>

      {saved.length === 0 ? (
        <p className="empty-state">No photos have been reviewed yet, so there are no results to show.</p>
      ) : (
        <>
          {saved.length < MIN_PHOTOS_FOR_HEADLINES && (
            <p className="callout" role="note">
              Only {saved.length} reviewed {saved.length === 1 ? "photo" : "photos"} so far: too few for meaningful
              percentages, so no headline figures are shown. The tables give the counts with 95% ranges, which are
              wide at this size.
            </p>
          )}
          {saved.length >= MIN_PHOTOS_FOR_HEADLINES && (
          <ul className="stat-tiles" aria-label="Headline results for all photos">
            <StatTile label="Precision" hint="AI findings that were real barriers" rate={all.precision} />
            <StatTile label="Recall" hint="Verified barriers the AI found" rate={all.recall} />
            <StatTile label="Highlight correct" hint="Real barriers whose highlight was right" rate={all.highlightCorrect} />
            <li className="stat-tile">
              <span className="stat-label">Median review time</span>
              <span className="stat-value">{seconds(all.medianReviewSeconds)}</span>
              <span className="stat-detail">per photo, vs {seconds(all.medianPipelineSeconds)} for the AI</span>
            </li>
          </ul>
          )}

          <MetricsTable metrics={metrics} />
          <CategoryTable metrics={all} />
          <Definitions />
        </>
      )}
    </section>
  );
}

function StatTile({ label, hint, rate }: { label: string; hint: string; rate: Rate }) {
  return (
    <li className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{percent(rate.value)}</span>
      <span className="stat-detail">
        {hint}: {rate.numerator} of {rate.denominator}
        {rate.low !== undefined && ` · 95% range ${percent(rate.low)}–${percent(rate.high)}`}
      </span>
    </li>
  );
}

function MetricsTable({ metrics }: { metrics: DatasetMetrics[] }) {
  const rows: { label: string; cell: (m: DatasetMetrics) => React.ReactNode }[] = [
    { label: "Photos reviewed", cell: (m) => m.photos },
    { label: "Photos with a verified barrier", cell: (m) => m.photosWithBarrier },
    { label: "AI findings", cell: (m) => m.aiFindings },
    { label: "Confirmed / corrected / rejected", cell: (m) => `${m.confirmed} / ${m.corrected} / ${m.rejected}` },
    { label: "Barriers the AI missed", cell: (m) => m.missed },
    { label: "Precision", cell: (m) => <RateCell rate={m.precision} /> },
    { label: "Recall", cell: (m) => <RateCell rate={m.recall} /> },
    { label: "Category correct (of real barriers)", cell: (m) => <RateCell rate={m.categoryAccuracy} /> },
    { label: "Highlight correct", cell: (m) => <RateCell rate={m.highlightCorrect} /> },
    { label: "Highlight correct or partly correct", cell: (m) => <RateCell rate={m.highlightUseful} /> },
    {
      label: "Evidence outlined by SAM 3.1",
      cell: (m) => <RateCell rate={rate(m.evidence.segmented, m.aiFindings)} />,
    },
    { label: "False alarms on photos with no barrier", cell: (m) => <RateCell rate={m.falseAlarmPhotos} /> },
    { label: "Median review time per photo", cell: (m) => seconds(m.medianReviewSeconds) },
    { label: "Median AI time per photo", cell: (m) => seconds(m.medianPipelineSeconds) },
  ];

  return (
    // Focusable and named, so keyboard users can scroll the table sideways on narrow screens.
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Results by photo source">
      <table className="metrics-table">
        <caption>Results by photo source</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {metrics.map((m) => (
              <th scope="col" key={m.dataset}>
                {DATASET_LABEL[m.dataset] ?? m.dataset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {metrics.map((m) => (
                <td key={m.dataset}>{row.cell(m)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryTable({ metrics }: { metrics: DatasetMetrics }) {
  const rows = metrics.byCategory.filter((c) => c.aiFindings > 0 || c.verified > 0);
  if (!rows.length) return null;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Results by barrier type">
      <table className="metrics-table">
        <caption>Results by barrier type (all photos)</caption>
        <thead>
          <tr>
            <th scope="col">Barrier type</th>
            <th scope="col">AI findings</th>
            <th scope="col">Precision</th>
            <th scope="col">Verified barriers</th>
            <th scope="col">Recall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.category}>
              <th scope="row">{CATEGORY_INFO[c.category].label}</th>
              <td>{c.aiFindings}</td>
              <td>
                <RateCell rate={c.precision} />
              </td>
              <td>{c.verified}</td>
              <td>
                <RateCell rate={c.recall} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Definitions() {
  return (
    <section className="definitions" aria-labelledby="definitions-title">
      <h2 id="definitions-title">How these numbers are measured</h2>
      <dl>
        <dt>Precision</dt>
        <dd>Of the AI&apos;s findings, the share the reviewer said were real barriers (confirmed or corrected).</dd>
        <dt>Recall</dt>
        <dd>
          Of all barriers the reviewer verified in the photos, including ones they added as missed, the share the AI
          found.
        </dd>
        <dt>Category correct</dt>
        <dd>Of the real barriers the AI found, the share whose category the reviewer did not need to change.</dd>
        <dt>Highlight correct</dt>
        <dd>For real barriers, the reviewer&apos;s answer to “Does the highlight on the photo show this barrier?”</dd>
        <dt>95% range</dt>
        <dd>
          A Wilson score interval: where the true rate likely lies given how many photos were reviewed. Fewer photos
          give a wider range.
        </dd>
      </dl>
      <p className="muted">
        Limits: one reviewer per photo, photos chosen by the reviewer rather than sampled at random, and web photos
        that may differ from local streets. Treat these as early measurements, not certified accuracy.
      </p>
    </section>
  );
}

function RateCell({ rate }: { rate: Rate }) {
  if (rate.value === undefined) return <span className="muted">n/a</span>;
  return (
    <>
      {percent(rate.value)}{" "}
      <span className="muted">
        ({rate.numerator}/{rate.denominator})
      </span>
    </>
  );
}

function percent(value?: number): string {
  return value === undefined ? "n/a" : `${Math.round(value * 100)}%`;
}

function seconds(value?: number): string {
  return value === undefined ? "n/a" : `${value.toFixed(1)} s`;
}
