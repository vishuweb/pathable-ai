"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ui/Dialog";
import { useToast } from "./ui/Toast";

/** Owner-only: removes a saved report, such as spam or a photo of an identifiable person. */
export function DeleteReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const toast = useToast();

  const remove = async () => {
    setAsking(false);
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" }).catch(() => undefined);
    if (res?.ok) {
      toast("The report and its photo were deleted.");
      router.push("/reports");
      router.refresh();
    } else {
      setDeleting(false);
      setError("The report could not be deleted. Please try again.");
    }
  };

  return (
    <>
      <button type="button" className="button-secondary button-danger" onClick={() => setAsking(true)} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete report"}
      </button>
      <ConfirmDialog
        open={asking}
        title="Delete this report?"
        body="The report and its photo will be removed for good. This cannot be undone."
        confirmLabel="Delete for good"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
