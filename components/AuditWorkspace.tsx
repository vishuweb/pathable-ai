"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toPixelBox } from "@/lib/geometry";
import { prepareImage, type PreparedImage } from "@/lib/prepare-image";
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

export function AuditWorkspace() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [image, setImage] = useState<PreparedImage>();
  const [analysis, setAnalysis] = useState<SceneAnalysis>();
  const [evidence, setEvidence] = useState<Record<string, Evidence>>({});
  const [timings, setTimings] = useState<{ analysisMs?: number; segmentationMs?: number }>({});
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [showOverlay, setShowOverlay] = useState(true);
  const runId = useRef(0);

  /** Runs the whole pipeline. `source` may be a loader so that fetching a sample also counts as busy. */
  const run = useCallback(async (source: Blob | (() => Promise<Blob>)) => {
    const id = ++runId.current;
    const isStale = () => id !== runId.current;

    setPhase("preparing");
    setImage(undefined);
    setAnalysis(undefined);
    setEvidence({});
    setTimings({});
    setError(undefined);
    setSelectedId(undefined);

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
        setPhase("done");
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
      setPhase("done");
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPhase("error");
    }
  }, []);

  const busy = phase === "preparing" || phase === "analyzing" || phase === "segmenting";
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Handle drops anywhere on the page: without this, dropping a photo outside the drop zone makes
  // the browser navigate to the file and discard the current results.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/") && !busyRef.current) void run(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [run]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void run(file);
    event.target.value = "";
  };

  const loadSample = (fileName: string) =>
    void run(async () => {
      const res = await fetch(`/samples/${fileName}`);
      if (!res.ok) throw new Error("The sample photo could not be loaded. Please try again.");
      return res.blob();
    });

  const toggleSelected = (findingId: string) =>
    setSelectedId((current) => (current === findingId ? undefined : findingId));

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
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-state">{analysis.no_findings_reason}</p>
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
