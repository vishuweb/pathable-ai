import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OwnerOnly } from "@/components/OwnerOnly";
import { SurveyForm } from "@/components/SurveyForm";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { isOwner, sessionFromCookies } from "@/lib/owner";
import { sublocations, surveys } from "@/lib/store";
import { SUBLOCATION_LABEL, findChecklist } from "@/lib/survey-taxonomy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Survey · PathAble AI" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ similar?: string }> };

export default async function SurveyPage({ params, searchParams }: Props) {
  const { role } = await sessionFromCookies();
  if (!role) return <OwnerOnly title="Campus surveys" />;
  const survey = await surveys.get((await params).id);
  if (!survey) notFound();
  const checklist = findChecklist(survey.checklistId);
  const spot = survey.sublocationId ? await sublocations.get(survey.sublocationId) : undefined;
  const target = spot ? `${SUBLOCATION_LABEL[spot.type]}: ${spot.name}` : "The whole place";

  return (
    <section aria-labelledby="survey-title">
      <WorkspaceNav reviewerOnly={!(await isOwner())} />
      <p className="back-link">
        <Link href="/owner/survey">← All surveys</Link>
      </p>
      <h1 id="survey-title">
        {survey.place.name}: {checklist?.label ?? survey.checklistId}
      </h1>
      <SurveyForm survey={survey} role={role} target={target} similarTo={(await searchParams).similar} />
    </section>
  );
}
