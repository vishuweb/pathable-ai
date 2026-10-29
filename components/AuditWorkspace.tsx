"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toPixelBox } from "@/lib/geometry";
import { prepareImage, type PreparedImage } from "@/lib/prepare-image";
import {
  emptyReview,
  isReviewComplete,
  type FindingReview,
  type MissedIssue,
  type ReportDraft,
  type ReportLocation,
  type SaveReportResponse,
} from "@/lib/report";
import type {
  AnalyzeResponse,
  Evidence,
  Finding,
  SceneAnalysis,
  SegmentRequest,
  SegmentResponse,
} from "@/lib/types";
import { EvidenceViewer } from "./EvidenceViewer";
import { FindingCard } from "./FindingCard";
import { FindingReviewControls } from "./FindingReviewControls";
import { LocationField } from "./LocationField";
import { MissedIssuesEditor } from "./MissedIssuesEditor";

type Phase = "idle" | "preparing" | "analyzing" | "segmenting" | "done" | "error";
type SaveState = { state: "idle" | "saving" | "error"; error?: string } | { state: "saved"; id: string };

const SAMPLES = [
  { file: "scooter-blocking-sidewalk.jpg", label: "Fallen scooter on a sidewalk" },
  { file: "e-scooters-warsaw.jpg", label: "E-scooters across a footpath" },
];

const PHASE_MESSAGE: Partial<Record<Phase, string>> = {
  preparing: "Preparing photo…",
  analyzing: "Analyzing the scene with Muse Spark…",
  segmenting: "Locating visual evidence with SAM 3.1…",
};

const EMPTY_LOCATION: ReportLocation = { label: "" };

export function AuditWorkspace() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [image, setImage] = useState<PreparedImage>();
  const [analysis, setAnalysis] = useState<SceneAnalysis>();
  const [evidence, setEvidence] = useState<Record<string, Evidence>>({});
  const [models, setModels] = useState<ReportDraft["models"]>();
  const [timings, setTimings] = useState<{ analysisMs?: number; segmentationMs?: number }>({});
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [showOverlay, setShowOverlay] = useState(true);
  const [reviews, setReviews] = useState<Record<string, FindingReview>>({});
  const [missedIssues, setMissedIssues] = useState<MissedIssue[]>([]);
  const [location, setLocation] = useState<ReportLocation>(EMPTY_LOCATION);
  const [reviewerNote, setReviewerNote] = useState("");
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const runId = useRef(0);
  const reviewStartedAt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const resetReview = () => {
    setReviews({});
    setMissedIssues([]);
    setLocation(EMPTY_LOCATION);
    setReviewerNote("");
    setSave({ state: "idle" });
  };

  /** Runs the whole pipeline. `source` may be a loader so that fetching a sample also counts as busy. */
  const run = useCallback(async (source: Blob | (() => Promise<Blob>)) => {
    const id = ++runId.current;
    const isStale = () => id !== runId.current;
    // Review time is measured from the moment results are ready to review.
    const finish = () => {
      reviewStartedAt.current = Date.now();
      setPhase("done");
    };

    setPhase("preparing");
    setImage(undefined);
    setAnalysis(undefined);
    setEvidence({});
    setModels(undefined);
    setTimings({});
    setError(undefined);
    setSelectedId(undefined);
    resetReview();

    try {
      const file = typeof source === "function" ? await source() : source;
      if (isStale()) return;
      const prepared = await prepareImage(file);
      if (isStale()) return;
      setImage(prepared);
      setPhase("analyzing");

      const analyzed = await postJson<AnalyzeResponse>("/api/analyze", { image: prepared.dataUrl });
      if (isStale()) return;
      setAnalysis(analyzed.analysis);
      setModels({ analysis: analyzed.model });
      setTimings({ analysisMs: analyzed.analysisMs });

      const { findings } = analyzed.analysis;
      const located = findings.filter((f) => f.located);
      const unlocated = fallbackEvidence(
        findings.filter((f) => !f.located),
        prepared,
        "unlocated",
        "The AI did not point to a specific area for this finding.",
      );
      if (!located.length) {
        setEvidence(unlocated);
        finish();
        return;
      }

      setPhase("segmenting");
      try {
        const request: SegmentRequest = {
          image: prepared.dataUrl,
          width: prepared.width,
          height: prepared.height,
          targets: located.map((f) => ({ findingId: f.id, phrase: f.evidence_phrase, box: f.evidence_box })),
        };
        const segmented = await postJson<SegmentResponse>("/api/segment", request);
        if (isStale()) return;
        setEvidence({ ...unlocated, ...Object.fromEntries(segmented.evidence.map((e) => [e.findingId, e])) });
        setModels({ analysis: analyzed.model, segmentation: segmented.model });
        setTimings((t) => ({ ...t, segmentationMs: segmented.segmentationMs }));
      } catch (err) {
        if (isStale()) return;
        // Findings are still useful without masks: fall back to the model's approximate boxes.
        console.warn("[segment] falling back to approximate boxes", err);
        setEvidence({
          ...unlocated,
          ...fallbackEvidence(
            located,
            prepared,
            "unavailable",
            "Segmentation was unavailable, so only the approximate area is shown.",
          ),
        });
      }
      finish();
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPhase("error");
    }
  }, []);

  const busy = phase === "preparing" || phase === "analyzing" || phase === "segmenting";
  const findings = analysis?.findings ?? [];
  const saved = save.state === "saved";
  const hasUnsavedReview =
    !saved &&
    (Object.values(reviews).some((r) => r.decision || r.note) ||
      missedIssues.length > 0 ||
      Boolean(location.label || location.latitude !== undefined || reviewerNote));

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

  // Warn before closing or reloading the tab with an unsaved review.
  useEffect(() => {
    if (!hasUnsavedReview) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedReview]);

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

  const toggleSelected = (findingId: string) =>
    setSelectedId((current) => (current === findingId ? undefined : findingId));

  const updateReview = (findingId: string, review: FindingReview) =>
    setReviews((current) => ({ ...current, [findingId]: review }));

  const reviewedCount = findings.filter((f) => isReviewComplete(reviews[f.id], f.category)).length;
  const canSave = phase === "done" && reviewedCount === findings.length && save.state !== "saving" && !saved;

  const saveReport = async () => {
    if (!image || !analysis || !models || !canSave) return;
    setSave({ state: "saving" });
    try {
      const draft: ReportDraft = {
        image: image.dataUrl,
        width: image.width,
        height: image.height,
        location: location.label.trim() || location.latitude !== undefined ? location : undefined,
        analysis,
        evidence: Object.values(evidence),
        reviews: Object.fromEntries(analysis.findings.map((f) => [f.id, reviews[f.id] ?? emptyReview()])),
        missedIssues,
        reviewerNote,
        models,
        timings: {
          analysisMs: timings.analysisMs ?? 0,
          segmentationMs: timings.segmentationMs,
          reviewMs: Date.now() - reviewStartedAt.current,
        },
      };
      const { id } = await postJson<SaveReportResponse>("/api/reports", draft);
      setSave({ state: "saved", id });
    } catch (err) {
      setSave({ state: "error", error: err instanceof Error ? err.message : "The report could not be saved." });
    }
  };

  const analyzeAnother = () => {
    runId.current++;
    setPhase("idle");
    setImage(undefined);
    setAnalysis(undefined);
    setEvidence({});
    resetReview();
    window.scrollTo({ top: 0 });
    fileInput.current?.focus();
  };

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
        <section className="results" aria-labelledby="results-heading">
          <h2 id="results-heading" className="visually-hidden">
            Results
          </h2>
          <div className="viewer-column">
            <EvidenceViewer
              image={image}
              findings={findings}
              evidence={evidence}
              selectedId={selectedId}
              showOverlay={showOverlay}
              onSelect={toggleSelected}
            />
            <div className="viewer-controls">
              <label>
                <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />{" "}
                Show highlights
              </label>
              {(timings.analysisMs || timings.segmentationMs) && (
                <span className="muted">
                  {timings.analysisMs && `Analysis ${(timings.analysisMs / 1000).toFixed(1)} s`}
                  {timings.segmentationMs && ` · Evidence ${(timings.segmentationMs / 1000).toFixed(1)} s`}
                </span>
              )}
            </div>
          </div>

          <div className="findings-column">
            {analysis && (
              <>
                <div className="scene-summary">
                  <h2>2. Review potential issues</h2>
                  <p>{analysis.scene_summary}</p>
                  {analysis.image_quality !== "good" && analysis.image_quality_notes && (
                    <p className="muted">Image quality: {analysis.image_quality_notes}</p>
                  )}
                </div>
                {findings.length ? (
                  <ol className="finding-list">
                    {findings.map((finding, index) => (
                      <li key={finding.id}>
                        <FindingCard
                          finding={finding}
                          index={index}
                          evidence={evidence[finding.id]}
                          evidencePending={phase === "segmenting"}
                          selected={selectedId === finding.id}
                          onSelect={toggleSelected}
                        >
                          {phase === "done" && (
                            <FindingReviewControls
                              finding={finding}
                              review={reviews[finding.id] ?? emptyReview()}
                              onChange={(review) => updateReview(finding.id, review)}
                              disabled={saved}
                            />
                          )}
                        </FindingCard>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-state">{analysis.no_findings_reason}</p>
                )}

                {phase === "done" && (
                  <section className="save-panel" aria-labelledby="save-heading">
                    <h2 id="save-heading">3. Add details and save</h2>
                    <fieldset className="plain-fieldset" disabled={saved}>
                      <legend className="visually-hidden">Report details</legend>
                      <MissedIssuesEditor issues={missedIssues} onChange={setMissedIssues} />
                      <LocationField value={location} onChange={setLocation} />
                      <label className="field">
                        <span>
                          Overall note <span className="muted">(optional)</span>
                        </span>
                        <textarea
                          rows={3}
                          maxLength={4000}
                          value={reviewerNote}
                          onChange={(e) => setReviewerNote(e.target.value)}
                        />
                      </label>
                    </fieldset>

                    {save.state === "saved" ? (
                      <div className="save-success" role="status">
                        <p>
                          <strong>Report saved.</strong> <Link href={`/reports/${save.id}`}>Open the report</Link> or
                          see <Link href="/reports">all reports</Link>.
                        </p>
                        <button type="button" className="button-secondary" onClick={analyzeAnother}>
                          Analyze another photo
                        </button>
                      </div>
                    ) : (
                      <div className="save-actions">
                        <p className="muted" id="save-hint">
                          {findings.length === 0
                            ? "No AI findings to review. Add any barriers the AI missed, then save."
                            : reviewedCount === findings.length
                              ? `All ${findings.length} findings reviewed.`
                              : `${reviewedCount} of ${findings.length} findings reviewed. Review each one to save.`}
                        </p>
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => void saveReport()}
                          disabled={!canSave}
                          aria-describedby="save-hint"
                        >
                          {save.state === "saving" ? "Saving…" : "Save report"}
                        </button>
                        {save.state === "error" && (
                          <p className="error" role="alert">
                            {save.error}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}

                <p className="disclaimer">
                  These are AI-generated candidates for human review. They are not an accessibility
                  compliance assessment.
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function fallbackEvidence(
  findings: Finding[],
  image: PreparedImage,
  status: "unlocated" | "unavailable",
  note: string,
): Record<string, Evidence> {
  return Object.fromEntries(
    findings.map((f) => [
      f.id,
      {
        findingId: f.id,
        phrase: f.evidence_phrase,
        status,
        regions: [],
        modelBox: toPixelBox(f.evidence_box, image.width, image.height),
        note,
      } satisfies Evidence,
    ]),
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}
