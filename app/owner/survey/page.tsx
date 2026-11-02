import type { Metadata } from "next";
import Link from "next/link";
import { OwnerOnly } from "@/components/OwnerOnly";
import { SurveyStart } from "@/components/SurveyStart";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { directory } from "@/lib/campus-directory";
import { canReview, isOwner } from "@/lib/owner";
import { activeRegion } from "@/lib/region";
import { sublocations, surveys } from "@/lib/store";
import { SURVEY_STATE_LABEL, SURVEY_STATES, surveyProgress } from "@/lib/survey";
import { SUBLOCATION_LABEL, findChecklist } from "@/lib/survey-taxonomy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campus surveys · PathAble AI" };

export default async function SurveysPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  if (!(await canReview())) return <OwnerOnly title="Campus surveys" />;
  const owner = await isOwner();
  const [all, spots] = await Promise.all([surveys.list(), sublocations.list()]);
  const spotById = new Map(spots.map((s) => [s.id, s]));
  const places = directory(activeRegion())
    .map((p) => ({ key: `${p.osmType}/${p.osmId}`, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const order = ["submitted", "returned", "draft", "approved", "rejected"] as const;

  return (
    <section aria-labelledby="surveys-title">
      <WorkspaceNav reviewerOnly={!owner} />
      <h1 id="surveys-title">Campus surveys</h1>
      <p className="intro">
        Records from walking the campus. A survey is private until it is approved. Half-done surveys are fine: what was not checked stays unknown on the public page.
      </p>

      {owner && (
        <section aria-labelledby="start-title" className="profile-section">
          <h2 id="start-title">Start a survey</h2>
          <SurveyStart
            places={places}
            initialPlace={(await searchParams).place}
            spots={spots.map((s) => ({ id: s.id, placeKey: `${s.place.osmType}/${s.place.osmId}`, label: `${SUBLOCATION_LABEL[s.type]}: ${s.name}`, type: s.type }))}
          />
        </section>
      )}

      {all.length === 0 ? (
        <p className="empty-state">No surveys yet. No campus place has been surveyed through this tool.</p>
      ) : (
        order
          .filter((state) => SURVEY_STATES.includes(state) && all.some((s) => s.state === state))
          .map((state) => (
            <section key={state} aria-labelledby={`state-${state}`} className="profile-section">
              <h2 id={`state-${state}`}>
                {SURVEY_STATE_LABEL[state]} ({all.filter((s) => s.state === state).length})
              </h2>
              <ul className="survey-list">
                {all
                  .filter((s) => s.state === state)
                  .reverse()
                  .map((s) => {
                    const progress = surveyProgress(s);
                    const spot = s.sublocationId ? spotById.get(s.sublocationId) : undefined;
                    return (
                      <li key={s.id}>
                        <Link href={`/owner/survey/${s.id}`}>
                          {s.place.name}
                          {spot ? `, ${spot.name}` : ""}: {findChecklist(s.checklistId)?.label ?? s.checklistId}
                        </Link>{" "}
                        <span className="muted">
                          seen {s.observedOn} · {progress.assessed} of {progress.total} lines assessed
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
      )}
    </section>
  );
}
