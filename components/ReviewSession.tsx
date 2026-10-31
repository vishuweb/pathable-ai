"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/pipeline";
import type { PreparedImage } from "@/lib/prepare-image";
import {
  emptyReview,
  isReviewComplete,
  type FindingReview,
  type MissedIssue,
  type ModelInfo,
  type PhotoSource,
  type ReportLocation,
  type ReportSubmission,
  type SaveReportResponse,
} from "@/lib/report";
import type { Evidence, SceneAnalysis } from "@/lib/types";
import { EvidenceViewer } from "./EvidenceViewer";
import { FindingCard } from "./FindingCard";
import { FindingReviewControls } from "./FindingReviewControls";
import { AREA_LABEL, PLACE_AREAS, type PlaceArea } from "@/lib/observations";
import { LocationField } from "./LocationField";
import { MissedIssuesEditor } from "./MissedIssuesEditor";
import { VoiceNoteButton, appendDictation } from "./VoiceNoteButton";

type SaveState = { state: "idle" | "saving" | "error"; error?: string } | { state: "saved"; id: string };

interface Props {
  /** For a queued draft, `dataUrl` is the draft image URL; the server reuses the stored photo. */
  image: PreparedImage;
  analysis?: SceneAnalysis;
  evidence: Record<string, Evidence>;
  /** False while the pipeline is still running; review starts once results are complete. */
  ready: boolean;
  evidencePending: boolean;
  models?: ModelInfo;
  timings: { analysisMs?: number; segmentationMs?: number };
  source?: PhotoSource;
  draftId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (reportId: string) => void;
  /** Rendered in place of the save button once the report is saved. */
  renderSaved: (reportId: string) => React.ReactNode;
  /** Prefix section headings with step numbers (the single-photo page has a step 1 above). */
  numbered?: boolean;
  /** A place chosen before the photo, e.g. from a place page's "Report a barrier here". */
  initialLocation?: ReportLocation;
}

const EMPTY_LOCATION: ReportLocation = { label: "" };

/** Today in the browser's own calendar, as YYYY-MM-DD. */
const todayLocal = () => new Date().toLocaleDateString("en-CA");

export function ReviewSession({
  image,
  analysis,
  evidence,
  ready,
  evidencePending,
  models,
  timings,
  source,
  draftId,
  onDirtyChange,
  onSaved,
  renderSaved,
  numbered = true,
  initialLocation = EMPTY_LOCATION,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>();
  const [showOverlay, setShowOverlay] = useState(true);
  const [reviews, setReviews] = useState<Record<string, FindingReview>>({});
  const [missedIssues, setMissedIssues] = useState<MissedIssue[]>([]);
  const [location, setLocation] = useState<ReportLocation>(initialLocation);
  const [reviewerNote, setReviewerNote] = useState("");
  const [area, setArea] = useState<PlaceArea | "">("");
  const [observedOn, setObservedOn] = useState("");
  const [consent, setConsent] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const reviewStartedAt = useRef(0);

  // Review time is measured from the moment results are ready to review.
  useEffect(() => {
    if (ready) reviewStartedAt.current = Date.now();
  }, [ready]);

  const findings = analysis?.findings ?? [];
  const saved = save.state === "saved";
  const dirty =
    !saved &&
    (Object.values(reviews).some((r) => r.decision || r.note) ||
      missedIssues.length > 0 ||
      Boolean(location !== initialLocation || reviewerNote || area || observedOn));

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Warn before closing or reloading the tab with an unsaved review.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const toggleSelected = (findingId: string) =>
    setSelectedId((current) => (current === findingId ? undefined : findingId));

  const reviewedCount = findings.filter((f) => isReviewComplete(reviews[f.id], f.category)).length;
  const allReviewed = reviewedCount === findings.length;
  const canSave = ready && allReviewed && consent && save.state !== "saving" && !saved;

  const saveReport = async () => {
    if (!analysis || !models || !canSave) return;
    setSave({ state: "saving" });
    try {
      const submission: ReportSubmission = {
        ...(draftId ? { draftId } : { image: image.dataUrl }),
        width: image.width,
        height: image.height,
        source,
        location: location.label.trim() || location.latitude !== undefined ? location : undefined,
        analysis,
        evidence: Object.values(evidence),
        reviews: Object.fromEntries(analysis.findings.map((f) => [f.id, reviews[f.id] ?? emptyReview()])),
        missedIssues,
        reviewerNote,
        area: area || undefined,
        observedOn: observedOn || undefined,
        consent: true,
        models,
        timings: {
          analysisMs: timings.analysisMs ?? 0,
          segmentationMs: timings.segmentationMs,
          reviewMs: Date.now() - reviewStartedAt.current,
        },
      };
      const { id } = await postJson<SaveReportResponse>("/api/reports", submission);
      setSave({ state: "saved", id });
      onSaved?.(id);
    } catch (err) {
      setSave({ state: "error", error: err instanceof Error ? err.message : "The report could not be saved." });
    }
  };

  return (
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
              <h2>{numbered && "2. "}Review potential issues</h2>
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
                      evidencePending={evidencePending}
                      selected={selectedId === finding.id}
                      onSelect={toggleSelected}
                      decision={reviews[finding.id]?.decision}
                    >
                      {ready && (
                        <FindingReviewControls
                          finding={finding}
                          review={reviews[finding.id] ?? emptyReview()}
                          onChange={(review) => setReviews((current) => ({ ...current, [finding.id]: review }))}
                          disabled={saved}
                        />
                      )}
                    </FindingCard>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">
                {analysis.no_findings_reason} A photo with no barrier found does not mean the place is accessible:
                the photo may not show everything.
              </p>
            )}

            {ready && (
              <section className="save-panel" aria-labelledby="save-heading">
                <h2 id="save-heading">{numbered && "3. "}Add details and save</h2>
                <fieldset className="plain-fieldset" disabled={saved}>
                  <legend className="visually-hidden">Report details</legend>
                  <MissedIssuesEditor issues={missedIssues} onChange={setMissedIssues} />
                  <LocationField value={location} onChange={setLocation} />
                  <fieldset className="field-group">
                    <legend>
                      About the barrier <span className="muted">(optional)</span>
                    </legend>
                    <label className="field">
                      Which part of the place?
                      <select value={area} onChange={(e) => setArea(e.target.value as PlaceArea | "")}>
                        <option value="">Not sure or not listed</option>
                        {PLACE_AREAS.map((a) => (
                          <option key={a} value={a}>
                            {AREA_LABEL[a]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      When did you see it?
                      <input
                        type="date"
                        value={observedOn}
                        max={todayLocal()}
                        onChange={(e) => setObservedOn(e.target.value)}
                      />
                    </label>
                  </fieldset>
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
                  <VoiceNoteButton
                    label="the overall note"
                    onText={(text) => setReviewerNote((current) => appendDictation(current, text, 4000))}
                  />
                </fieldset>

                {save.state === "saved" ? (
                  <div className="save-success" role="status">
                    {renderSaved(save.id)}
                  </div>
                ) : (
                  <div className="save-actions">
                    <div className="share-notice">
                      <h3>Sharing makes this report public</h3>
                      <p>Anyone with the link, and anyone browsing Reports, will see:</p>
                      <ul>
                        <li>the photo</li>
                        <li>the AI&apos;s suggestions and your decision on each</li>
                        <li>your notes, including any dictated text</li>
                        <li>{location.label.trim() || location.latitude !== undefined ? "the location you added" : "the location, if you add one"}</li>
                      </ul>
                      <label className="consent">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        <span>
                          I understand this will be public, I may share this photo, and it does not clearly show
                          anyone&apos;s face or number plate.{" "}
                          <a href="/privacy" target="_blank" rel="noopener">
                            Privacy and removal (opens in a new tab)
                          </a>
                        </span>
                      </label>
                    </div>
                    <p className="muted" id="save-hint">
                      {findings.length === 0
                        ? "No AI findings to review. Add any barriers the AI missed, then share."
                        : allReviewed
                          ? findings.length === 1
                            ? "The finding is reviewed."
                            : `All ${findings.length} findings reviewed.`
                          : `${reviewedCount} of ${findings.length} findings reviewed. Review each one to save.`}
                      {allReviewed && !consent && " Tick the box above to share."}
                    </p>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void saveReport()}
                      disabled={!canSave}
                      aria-describedby="save-hint"
                    >
                      {save.state === "saving" ? "Sharing…" : "Share report publicly"}
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
              These are AI-generated candidates for human review. They are not an accessibility compliance
              assessment.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
