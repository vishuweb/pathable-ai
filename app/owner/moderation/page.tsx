import type { Metadata } from "next";
import { ModerationQueue, type PendingItem } from "@/components/ModerationQueue";
import { OwnerOnly } from "@/components/OwnerOnly";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { formatDateTime } from "@/lib/format";
import { moderationState } from "@/lib/moderation";
import { AREA_LABEL, FINDING_LABEL } from "@/lib/observations";
import { isOwner } from "@/lib/owner";
import { PLACE_FEATURES } from "@/lib/place-attributes";
import { summarizeReport } from "@/lib/report";
import { observations, reports } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Approvals · PathAble AI" };

export default async function ModerationPage() {
  if (!(await isOwner())) return <OwnerOnly title="Approvals" />;
  const [allReports, allObservations] = await Promise.all([reports.list(), observations.list()]);
  const labels = Object.fromEntries(PLACE_FEATURES.map((f) => [f.id, f.label]));

  const items: (PendingItem & { at: string })[] = [
    ...allReports
      .filter((r) => moderationState(r) === "pending")
      .map((r) => {
        const s = summarizeReport(r);
        return {
          kind: "report" as const,
          id: r.id,
          at: r.createdAt,
          heading: r.location?.place?.name || r.location?.label || "no location given",
          when: formatDateTime(r.createdAt),
          lines: [
            `${s.verified} confirmed ${s.verified === 1 ? "barrier" : "barriers"} of ${s.findings} AI ${s.findings === 1 ? "suggestion" : "suggestions"}`,
            ...(r.location?.label ? [`Location text: ${r.location.label}`] : []),
            ...(r.location?.latitude !== undefined
              ? [
                  `Coordinates made public: ${r.location.latitude.toFixed(5)}, ${r.location.longitude?.toFixed(5)}` +
                    (r.location.accuracyM !== undefined ? ` (accuracy about ${Math.round(r.location.accuracyM)} m)` : "") +
                    (r.location.place ? " - the chosen place's own position" : " - the reporter's own position"),
                ]
              : []),
            ...(r.reviewerNote ? [`Note: ${r.reviewerNote}`] : []),
            ...r.analysis.findings.flatMap((f) => (r.reviews[f.id]?.note ? [`Note on "${f.title}": ${r.reviews[f.id].note}`] : [])),
            ...r.missedIssues.map((m) => `Added barrier: ${m.description}`),
          ],
          hasPhoto: true,
          href: `/reports/${r.id}`,
        };
      }),
    ...allObservations
      .filter((o) => moderationState(o) === "pending")
      .map((o) => ({
        kind: "observation" as const,
        id: o.id,
        at: o.createdAt,
        heading: o.place.name,
        when: formatDateTime(o.createdAt),
        lines: [
          `${labels[o.featureId] ?? "Feature"}: ${FINDING_LABEL[o.finding].toLowerCase()} (${AREA_LABEL[o.area].toLowerCase()}), seen ${o.observedOn}`,
          ...(o.note ? [`Note: ${o.note}`] : []),
        ],
        hasPhoto: o.hasPhoto,
        href: undefined,
      })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section aria-labelledby="approvals-title">
      <WorkspaceNav />
      <h1 id="approvals-title">Approvals</h1>
      <p className="intro">
        New reports and observations from visitors wait here. Nothing is public until you approve it, so check the photo
        for faces, number plates and personal details first: open the full-size photo and read every note. Approving
        publishes the photo, the text and any coordinates shown. {items.length} waiting.
      </p>
      <ModerationQueue items={items.map((item) => ({ ...item }))} />
    </section>
  );
}
