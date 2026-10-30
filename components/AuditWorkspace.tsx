"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PipelineCancelled, runPipeline } from "@/lib/pipeline";
import type { PreparedImage } from "@/lib/prepare-image";
import type { ModelInfo, ReportLocation } from "@/lib/report";
import type { Evidence, SceneAnalysis } from "@/lib/types";
import { ReviewSession } from "./ReviewSession";

type Phase = "idle" | "preparing" | "analyzing" | "segmenting" | "done" | "error";

const SAMPLES = [
  { file: "scooter-blocking-sidewalk.jpg", label: "Fallen scooter on a sidewalk" },
  { file: "e-scooters-warsaw.jpg", label: "E-scooters across a footpath" },
];

const PHASE_MESSAGE: Partial<Record<Phase, string>> = {
  preparing: "Preparing photo…",
  analyzing: "Analyzing the scene with Muse Spark…",
  segmenting: "Locating visual evidence with SAM 3.1…",
};

export function AuditWorkspace({ initialLocation }: { initialLocation?: ReportLocation }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [image, setImage] = useState<PreparedImage>();
  const [analysis, setAnalysis] = useState<SceneAnalysis>();
  const [evidence, setEvidence] = useState<Record<string, Evidence>>({});
  const [models, setModels] = useState<ModelInfo>();
  const [timings, setTimings] = useState<{ analysisMs?: number; segmentationMs?: number }>({});
  const [error, setError] = useState<string>();
  const [hasUnsavedReview, setHasUnsavedReview] = useState(false);
  // A new key per run gives each photo a fresh review session.
  const [runKey, setRunKey] = useState(0);
  const runId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Runs the whole pipeline. `source` may be a loader so that fetching a sample also counts as busy. */
  const run = useCallback(async (source: Blob | (() => Promise<Blob>)) => {
    const id = ++runId.current;
    const isCancelled = () => id !== runId.current;

    setRunKey(id);
    setPhase("preparing");
    setImage(undefined);
    setAnalysis(undefined);
    setEvidence({});
    setModels(undefined);
    setTimings({});
    setError(undefined);
    setHasUnsavedReview(false);

    try {
      const file = typeof source === "function" ? await source() : source;
      if (isCancelled()) return;
      const result = await runPipeline(file, {
        isCancelled,
        onPrepared: (prepared) => {
          setImage(prepared);
          setPhase("analyzing");
        },
        onAnalyzed: (analyzed, analysisMs) => {
          setAnalysis(analyzed);
          setTimings({ analysisMs });
        },
        onSegmenting: () => setPhase("segmenting"),
      });
      setEvidence(result.evidence);
      setModels(result.models);
      setTimings(result.timings);
      setPhase("done");
    } catch (err) {
      if (err instanceof PipelineCancelled || isCancelled()) return;
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPhase("error");
    }
  }, []);

  const busy = phase === "preparing" || phase === "analyzing" || phase === "segmenting";

  // Read inside long-lived listeners without re-registering them.
  const stateRef = useRef({ busy, hasUnsavedReview });
  useEffect(() => {
    stateRef.current = { busy, hasUnsavedReview };
  }, [busy, hasUnsavedReview]);

  /** Starts a new analysis unless that would throw away a review the user has not saved. */
  const startRun = useCallback(
    (source: Blob | (() => Promise<Blob>)) => {
      if (stateRef.current.busy) return;
      if (stateRef.current.hasUnsavedReview && !window.confirm("Discard your unsaved review and analyze a new photo?")) {
        return;
      }
      void run(source);
    },
    [run],
  );

  // Handle drops anywhere on the page: without this, dropping a photo outside the drop zone makes
  // the browser navigate to the file and discard the current results.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/")) startRun(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [startRun]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) startRun(file);
    event.target.value = "";
  };

  const loadSample = (fileName: string) =>
    startRun(async () => {
      const res = await fetch(`/samples/${fileName}`);
      if (!res.ok) throw new Error("The sample photo could not be loaded. Please try again.");
      return res.blob();
    });

  const analyzeAnother = () => {
    runId.current++;
    setPhase("idle");
    setImage(undefined);
    setAnalysis(undefined);
    setEvidence({});
    setHasUnsavedReview(false);
    window.scrollTo({ top: 0 });
    fileInput.current?.focus();
  };

  const findings = analysis?.findings ?? [];
  const statusMessage =
    PHASE_MESSAGE[phase] ??
    (phase === "done" && analysis
      ? findings.length
        ? `Found ${findings.length} potential ${findings.length === 1 ? "issue" : "issues"} for review.`
        : "No potential barriers were identified in this photo."
      : "");

  return (
    <div className="workspace">
      <section className="upload-panel" aria-labelledby="upload-heading">
        <h2 id="upload-heading">1. Add a photo</h2>
        <div className="dropzone">
          <label className="button-primary">
            Choose a photo
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              disabled={busy}
              className="visually-hidden"
            />
          </label>
          <p className="muted">or drag one onto the page. Photos are resized and stripped of metadata before upload.</p>
        </div>
        <div className="samples">
          <p className="muted">No photo handy? Try a sample:</p>
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              type="button"
              className="button-secondary"
              onClick={() => loadSample(s.file)}
              disabled={busy}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <p className={`status${busy ? " is-busy" : ""}`} role="status" aria-live="polite">
        {statusMessage}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {image && (
        <ReviewSession
          key={runKey}
          initialLocation={initialLocation}
          image={image}
          analysis={analysis}
          evidence={evidence}
          ready={phase === "done"}
          evidencePending={phase === "segmenting"}
          models={models}
          timings={timings}
          onDirtyChange={setHasUnsavedReview}
          renderSaved={(reportId) => (
            <>
              <p>
                <strong>Report shared.</strong> <Link href={`/reports/${reportId}`}>Open the report</Link> or see{" "}
                <Link href="/reports">all reports</Link>.
              </p>
              <button type="button" className="button-secondary" onClick={analyzeAnother}>
                Analyze another photo
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
