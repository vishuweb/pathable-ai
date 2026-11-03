"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PipelineCancelled, runPipeline } from "@/lib/pipeline";
import { AREA_LABEL, PLACE_AREAS, type PlaceArea } from "@/lib/observations";
import type { PreparedImage } from "@/lib/prepare-image";
import type { ModelInfo, ReportLocation } from "@/lib/report";
import type { Evidence, SceneAnalysis } from "@/lib/types";
import { LocationField } from "./LocationField";
import { ReviewSession } from "./ReviewSession";
import { Icon } from "./ui/Icon";
import { StepProgress } from "./ui/StepProgress";

type Phase = "idle" | "preparing" | "analyzing" | "segmenting" | "done" | "error";

const SAMPLES = [
  { file: "scooter-blocking-sidewalk.jpg", label: "Fallen scooter on a sidewalk" },
  { file: "e-scooters-warsaw.jpg", label: "E-scooters across a footpath" },
];

const STEPS = ["Place", "Photo", "AI check", "Evidence", "Confirm", "Notes", "Privacy", "Submit"];

/** What a report holds when the AI could not run. Nothing here claims to come from AI. */
const NO_AI_ANALYSIS: SceneAnalysis = {
  scene_type: "",
  scene_summary: "",
  image_quality: "good",
  image_quality_notes: "",
  findings: [],
  no_findings_reason: "AI analysis was not available, so the reporter described the barrier themselves.",
};

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
  // Coming from a place page, the place is already known, so the flow starts at the photo.
  const [placeDone, setPlaceDone] = useState(Boolean(initialLocation?.place));
  const [location, setLocation] = useState<ReportLocation>(initialLocation ?? { label: "" });
  const [area, setArea] = useState<PlaceArea | "">("");
  const [manual, setManual] = useState(false);
  const [progress, setProgress] = useState<{ reviewed: number; total: number; consent: boolean; saved: boolean }>();
  const lastSource = useRef<Blob | (() => Promise<Blob>) | undefined>(undefined);
  const saved = Boolean(progress?.saved);
  // A new key per run gives each photo a fresh review session.
  const [runKey, setRunKey] = useState(0);
  const runId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Runs the whole pipeline. `source` may be a loader so that fetching a sample also counts as busy. */
  const run = useCallback(async (source: Blob | (() => Promise<Blob>)) => {
    const id = ++runId.current;
    const isCancelled = () => id !== runId.current;
    lastSource.current = source;
    setManual(false);
    setProgress(undefined);

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
    setProgress(undefined);
    setManual(false);
    setError(undefined);
    window.scrollTo({ top: 0 });
    fileInput.current?.focus();
  };

  const continueWithoutAi = () => {
    setAnalysis(NO_AI_ANALYSIS);
    setEvidence({});
    setModels({ analysis: "none" });
    setTimings({});
    setManual(true);
    setError(undefined);
    setPhase("done");
  };

  const onProgress = useCallback((next: { reviewed: number; total: number; consent: boolean; saved: boolean }) => setProgress(next), []);

  const findings = analysis?.findings ?? [];
  const statusMessage =
    PHASE_MESSAGE[phase] ??
    (phase === "done" && analysis
      ? findings.length
        ? `Found ${findings.length} potential ${findings.length === 1 ? "issue" : "issues"} for review.`
        : "No potential barriers were identified in this photo."
      : "");

  const review = busy || phase === "done";
  const current = saved
    ? STEPS.length
    : !placeDone
      ? 0
      : phase === "idle" || (phase === "error" && !image)
        ? 1
        : busy || phase === "error"
          ? 2
          : !progress
            ? 3
            : progress.total && progress.reviewed === 0
              ? 3
              : progress.reviewed < progress.total
                ? 4
                : progress.consent
                  ? 7
                  : 6;

  return (
    <div className="workspace">
      <StepProgress steps={STEPS} current={current} />

      {!placeDone ? (
        <section className="flow-panel" aria-labelledby="place-heading">
          <h2 id="place-heading">Where is the barrier?</h2>
          <p className="muted">Choose the campus place if you can, so the report reaches the right place page. You can skip this and add it later.</p>
          <LocationField value={location} onChange={setLocation} />
          <label className="field">
            Which part of the place? <span className="muted">(optional)</span>
            <select value={area} onChange={(e) => setArea(e.target.value as PlaceArea | "")}>
              <option value="">Not sure or not listed</option>
              {PLACE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <p>
            <button type="button" className="button-primary" onClick={() => setPlaceDone(true)}>
              Continue to the photo <Icon name="arrow" size={18} />
            </button>
          </p>
        </section>
      ) : (
        !review && !image && (
          <section className="flow-panel upload-panel" aria-labelledby="upload-heading">
            <h2 id="upload-heading">Add a photo of the barrier</h2>
            {location.place && <p className="muted">At {location.place.name}. <button type="button" className="button-link" onClick={() => setPlaceDone(false)}>Change</button></p>}
            {!location.place && <p className="muted"><button type="button" className="button-link" onClick={() => setPlaceDone(false)}>Add a place</button></p>}
            <div className="dropzone">
              <Icon name="camera" size={32} />
              <label className="button-primary">
                Take or choose a photo
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} disabled={busy} className="visually-hidden" />
              </label>
              <p className="muted">or drag one onto the page. Photos are resized and stripped of location and camera details before upload. Please avoid faces and number plates.</p>
            </div>
            <div className="samples">
              <p className="muted">No photo handy? Try a sample:</p>
              {SAMPLES.map((s) => (
                <button key={s.file} type="button" className="button-secondary" onClick={() => loadSample(s.file)} disabled={busy}>
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        )
      )}

      <p className={`status${busy ? " is-busy" : ""}`} role="status" aria-live="polite">
        {statusMessage}
      </p>
      {error && (
        <div className="flow-panel flow-error">
          <p className="error" role="alert">
            {error}
          </p>
          <p>You have not lost anything, and you do not need AI to report a barrier.</p>
          <p className="flow-actions">
            {lastSource.current && (
              <button type="button" className="button-secondary" onClick={() => startRun(lastSource.current!)}>
                Try again
              </button>
            )}
            {image && (
              <button type="button" className="button-primary" onClick={continueWithoutAi}>
                Continue without AI
              </button>
            )}
            {!image && (
              <button type="button" className="button-secondary" onClick={analyzeAnother}>
                Choose another photo
              </button>
            )}
          </p>
        </div>
      )}

      {image && phase !== "error" && (
        <ReviewSession
          key={runKey}
          initialLocation={location}
          initialArea={area}
          manual={manual}
          image={image}
          analysis={analysis}
          evidence={evidence}
          ready={phase === "done"}
          evidencePending={phase === "segmenting"}
          models={models}
          timings={timings}
          onDirtyChange={setHasUnsavedReview}
          onProgress={onProgress}
          renderSaved={(reportId, pending) => (
            <>
              <h3>
                <Icon name="check" /> {pending ? "Report received" : "Report shared"}
              </h3>
              {pending ? (
                <p>
                  It is not public yet: the project owner checks every new report before it appears on <Link href="/reports">Community reports</Link>. Nothing you sent is shown to
                  anyone until then.
                </p>
              ) : (
                <p>
                  <Link href={`/reports/${reportId}`}>Open the report</Link> or see <Link href="/reports">all reports</Link>.
                </p>
              )}
              <p className="muted">
                Your reference: <code>{reportId.slice(0, 8)}</code>
                {pending && " Once approved, it appears on Community reports with its status, so you can follow what happens next."}
              </p>
              <button type="button" className="button-secondary" onClick={analyzeAnother}>
                Report another barrier
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
