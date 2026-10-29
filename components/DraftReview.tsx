"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AnalysisDraft } from "@/lib/report";
import { ReviewSession } from "./ReviewSession";

interface Props {
  draft: AnalysisDraft;
  position: number;
  total: number;
  /** The draft after this one, wrapping around; undefined when this is the only one. */
  nextId?: string;
}

export function DraftReview({ draft, position, total, nextId }: Props) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string>();
  const next = nextId ? `/review/${nextId}` : "/review";

  const remove = async () => {
    if (!window.confirm("Remove this photo from the review queue? It will not be counted in the results.")) return;
    setRemoving(true);
    const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" }).catch(() => undefined);
    if (res?.ok) {
      router.push(next);
    } else {
      setRemoving(false);
      setError("The photo could not be removed. Please try again.");
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Review queue</p>
          <h1>
            Photo {position} of {total}
          </h1>
          {draft.source && (
            <p className="muted">
              {draft.source.dataset === "own" ? "Your photo" : "Web photo"} · {draft.source.file}
            </p>
          )}
        </div>
        <div className="report-actions">
          {nextId && (
            <Link className="button-secondary" href={next}>
              Skip for now
            </Link>
          )}
          <button type="button" className="button-secondary" onClick={() => void remove()} disabled={removing}>
            Remove from queue
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ReviewSession
        image={{ dataUrl: `/api/drafts/${draft.id}/image`, width: draft.width, height: draft.height }}
        analysis={draft.analysis}
        evidence={Object.fromEntries(draft.evidence.map((e) => [e.findingId, e]))}
        ready
        evidencePending={false}
        models={draft.models}
        timings={draft.timings}
        source={draft.source}
        draftId={draft.id}
        numbered={false}
        onSaved={() => router.push(next)}
        renderSaved={() => <p>Saved. Loading the next photo…</p>}
      />
    </>
  );
}
