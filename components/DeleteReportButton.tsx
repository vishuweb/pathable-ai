"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Owner-only: removes a saved report, such as spam or a photo of an identifiable person. */
export function DeleteReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    if (!window.confirm("Delete this report and its photo? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" }).catch(() => undefined);
    if (res?.ok) {
      router.push("/reports");
      router.refresh();
    } else {
      setDeleting(false);
      setError("The report could not be deleted. Please try again.");
    }
  };

  return (
    <>
      <button type="button" className="button-secondary button-danger" onClick={() => void remove()} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete report"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
