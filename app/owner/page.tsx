import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { canReview, isOwner, ownerKeyMissing, ownerKeyRequired, sessionProblem } from "@/lib/owner";
import { directory } from "@/lib/campus-directory";
import { computeCoverage } from "@/lib/coverage";
import { computeMetrics, evaluationReports } from "@/lib/metrics";
import { moderationState } from "@/lib/moderation";
import { NEED_GROUPS, NEED_GROUP_INFO } from "@/lib/needs";
import { activeRegion } from "@/lib/region";
import { drafts, observations, reports, sublocations, surveyPhotos, surveyPriorities, surveys } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner workspace · PathAble AI" };

function OwnerMetric({ value, label, href, action }: { value: number; label: string; href?: string; action?: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {href && (
        <dd className="metric-definition">
          <Link href={href}>{action}</Link>
        </dd>
      )}
    </div>
  );
}

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  if (ownerKeyMissing()) {
    return (
      <section aria-labelledby="owner-title">
        <h1 id="owner-title">Owner workspace</h1>
        <p className="empty-state">
          This deployment has no owner key yet, so the workspace is locked. Set <code>OWNER_KEY</code> in the
          project&apos;s environment variables and redeploy.
        </p>
      </section>
    );
  }

  if (!(await isOwner()) && (await canReview())) {
    const queued = await drafts.list();
    return (
      <section aria-labelledby="owner-title">
        <WorkspaceNav reviewerOnly />
        <h1 id="owner-title">Reviewer workspace</h1>
        <p className="intro">
          You are signed in as a reviewer. {queued.length} {queued.length === 1 ? "photo is" : "photos are"} waiting
          in the <Link href="/review">review queue</Link>. Follow the labelling guide your project owner gave you.
        </p>
        <form method="post" action="/api/owner" className="signout">
          <input type="hidden" name="action" value="signout" />
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </form>
      </section>
    );
  }

  if (!(await isOwner())) {
    return (
      <section aria-labelledby="owner-title" className="owner-page">
        <h1 id="owner-title">Owner workspace</h1>
        <p className="intro">
          {(await sessionProblem()) === "expired" && "Your session has expired. Sign in again. "}
          {(await sessionProblem()) === "invalid" && "Your session is not valid. Sign in again. "}
          The project owner and invited reviewers use this workspace to review photos as evaluation data and moderate
          shared reports. Anyone can <Link href="/report">report a barrier</Link> without signing in.
        </p>
        <form method="post" action="/api/owner">
          <label className="field">
            Owner or reviewer key
            <input
              type="password"
              name="key"
              required
              autoComplete="current-password"
              aria-describedby={error ? "owner-error" : undefined}
              aria-invalid={error ? true : undefined}
            />
          </label>
          {error && (
            <p id="owner-error" className="field-error" role="alert">
              That key is not correct.
            </p>
          )}
          <p>
            <button type="submit" className="button-primary">
              Sign in
            </button>
          </p>
        </form>
      </section>
    );
  }

  const region = activeRegion();
  const [queued, saved, allObservations, allSurveys, spots, priorities, photos] = await Promise.all([
    drafts.list(),
    reports.list(),
    observations.list(),
    surveys.list(),
    sublocations.list(),
    surveyPriorities.list(),
    surveyPhotos.list(),
  ]);
  const coverage = computeCoverage({
    places: directory(region).map((p) => ({ osmType: p.osmType, osmId: p.osmId, name: p.name, category: p.category })),
    surveys: allSurveys,
    sublocations: spots,
    observations: allObservations,
    reports: saved,
    priorities,
  });
  const states = [...saved, ...allObservations].map(moderationState);
  const pending = states.filter((s) => s === "pending").length;
  const approved = states.filter((s) => s === "approved").length;
  const rejected = states.filter((s) => s === "rejected").length;
  const surveyCount = (state: string) => allSurveys.filter((x) => x.state === state).length;
  const { included } = evaluationReports(saved, { publicSite: ownerKeyRequired() });
  const evaluation = computeMetrics(included)[0];
  const largest = Math.max(1, ...NEED_GROUPS.map((g) => coverage.byNeedGroup[g]));

  return (
    <section aria-labelledby="owner-title">
      <WorkspaceNav />
      <h1 id="owner-title">Overview</h1>
      <p className="intro">Live figures from this site&apos;s own records. Visitors cannot see this.</p>

      <h2>Needs attention</h2>
      <dl className="metrics">
        <OwnerMetric value={pending} label="Waiting for approval" href="/owner/moderation" action="Open approvals" />
        <OwnerMetric value={surveyCount("submitted")} label="Surveys waiting for review" href="/owner/survey" action="Open surveys" />
        <OwnerMetric value={queued.length} label="Photos in the review queue" href="/review" action="Open the queue" />
      </dl>

      <h2>Records</h2>
      <dl className="metrics">
        <OwnerMetric value={approved} label="Approved submissions" />
        <OwnerMetric value={rejected} label="Rejected submissions" />
        <OwnerMetric value={surveyCount("draft") + surveyCount("returned")} label="Unfinished surveys" href="/owner/survey" action="Continue one" />
        <OwnerMetric value={surveyCount("approved")} label="Published surveys" />
        <OwnerMetric value={saved.length + photos.length} label="Photos held as evidence" />
      </dl>

      <div className="two-panels">
        <section aria-labelledby="coverage-head" className="owner-panel">
          <h2 id="coverage-head">Campus coverage</h2>
          <p>
            {coverage.survey.placesWithApprovedSurvey} of {coverage.directory.places} directory places have a published survey. {coverage.verified.places} have an independently verified record.
          </p>
          {NEED_GROUPS.some((g) => coverage.byNeedGroup[g] > 0) && (
            <>
          <h3 className="subhead">Assessed survey lines by kind of need</h3>
          <ul className="bar-list">
            {NEED_GROUPS.map((g) => (
              <li key={g}>
                <span>{NEED_GROUP_INFO[g].short}</span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${(coverage.byNeedGroup[g] / largest) * 100}%` }} />
                </span>
                <strong>{coverage.byNeedGroup[g]}</strong>
              </li>
            ))}
          </ul>
            </>
          )}
          <p>
            <Link href="/owner/coverage">Full coverage and the survey queue</Link>
          </p>
        </section>
        <section aria-labelledby="evaluation-head" className="owner-panel">
          <h2 id="evaluation-head">AI evaluation</h2>
          <p>
            {evaluation.photos} reviewed {evaluation.photos === 1 ? "photo" : "photos"} in the evaluation set: {evaluation.confirmed} suggestions confirmed, {evaluation.corrected} corrected, {evaluation.rejected} rejected, {evaluation.missed} barriers the AI missed.
          </p>
          <p className="muted">One reviewer per photo, so this is an early measure and not independent ground truth.</p>
          <p>
            <Link href="/results">Open the evaluation</Link> · <Link href="/owner/ai-usage">AI usage</Link>
          </p>
        </section>
      </div>
      {ownerKeyRequired() && (
        <form method="post" action="/api/owner" className="signout">
          <input type="hidden" name="action" value="signout" />
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </form>
      )}
    </section>
  );
}
