import type { Metadata } from "next";
import Link from "next/link";
import { OwnerOnly } from "@/components/OwnerOnly";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { canReview, isOwner } from "@/lib/owner";
import { drafts } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue · PathAble AI" };

export default async function ReviewQueuePage() {
  if (!(await canReview())) return <OwnerOnly title="Review queue" />;
  const queued = await drafts.list();
  const byDataset = queued.reduce<Record<string, number>>((acc, d) => {
    const key = d.source?.dataset ?? "other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section aria-labelledby="queue-title">
      <WorkspaceNav reviewerOnly={!(await isOwner())} />
      <h1 id="queue-title">Review queue</h1>
      {queued.length === 0 ? (
        <p className="empty-state">
          Nothing is waiting for review. <Link href="/batch">Analyze a batch of photos</Link> to fill the queue, or
          see the <Link href="/results">results</Link>.
        </p>
      ) : (
        <div className="queue-summary">
          <p>
            <strong>
              {queued.length} {queued.length === 1 ? "photo is" : "photos are"} waiting for review
            </strong>
            {" ("}
            {Object.entries(byDataset)
              .map(([dataset, n]) => `${n} ${dataset === "own" ? "yours" : dataset === "web" ? "from the web" : dataset}`)
              .join(", ")}
            ).
          </p>
          <p className="muted">
            For each photo, check every AI finding, mark whether the highlight is right, and add any barriers it
            missed. You can stop at any time; the queue keeps your place.
          </p>
          <Link className="button-primary" href={`/review/${queued[0].id}`}>
            Start reviewing
          </Link>
        </div>
      )}
    </section>
  );
}
