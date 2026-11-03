"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_INFO } from "@/lib/categories";
import { CATEGORY_FEATURES } from "@/lib/evidence-map";
import { prepareImage } from "@/lib/prepare-image";
import { SURVEY_STATE_LABEL, answerLabel, isAssessed, submitProblems, surveyProgress, type StaffRole, type Survey, type SurveyAnswer } from "@/lib/survey";
import { STATUS_LABEL, UNIT_LABEL, findChecklist, type StatusValue, type SurveyAttribute, type Unit } from "@/lib/survey-taxonomy";
import type { AnalyzeResponse, ApiError } from "@/lib/types";
import { VoiceNoteButton, appendDictation } from "./VoiceNoteButton";

type Draft = { value: string; unit?: Unit; method: string; note: string; photoIds: string[] };

const toDraft = (a?: SurveyAnswer): Draft => ({ value: a ? String(a.value) : "", unit: a?.unit, method: a?.method ?? "", note: a?.note ?? "", photoIds: a?.photoIds ?? [] });

function AttributeField({
  attribute,
  draft,
  photoIds,
  disabled,
  onChange,
}: {
  attribute: SurveyAttribute;
  draft: Draft;
  photoIds: string[];
  disabled: boolean;
  onChange: (next: Draft) => void;
}) {
  const spec = attribute.value;
  const id = `attr-${attribute.id}`;
  const measure = spec.kind === "measure" ? spec : undefined;
  return (
    <fieldset className={draft.value ? "survey-line survey-line-done" : "survey-line"} disabled={disabled}>
      <legend>
        {attribute.label}
        {attribute.core && <span className="muted"> (core)</span>}
      </legend>
      <p className="muted">{attribute.definition}</p>
      {spec.kind === "status" || spec.kind === "choice" ? (
        <label className="field">
          What you found
          <select id={id} value={draft.value} onChange={(e) => onChange({ ...draft, value: e.target.value })}>
            <option value="">Not checked yet</option>
            {spec.kind === "status"
              ? spec.options.map((o: StatusValue) => (
                  <option key={o} value={o}>
                    {spec.labels?.[o] ?? STATUS_LABEL[o]}
                  </option>
                ))
              : spec.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
          </select>
        </label>
      ) : measure ? (
        <div className="survey-measure">
          <label className="field">
            Measured value <span className="muted">(leave blank if you did not measure it)</span>
            <input id={id} type="number" inputMode="decimal" step="any" min={measure.min} max={measure.max} value={draft.value} onChange={(e) => onChange({ ...draft, value: e.target.value })} />
          </label>
          {measure.units.length > 1 ? (
            <label className="field">
              Unit
              <select value={draft.unit ?? ""} onChange={(e) => onChange({ ...draft, unit: (e.target.value || undefined) as Unit | undefined })}>
                <option value="">Choose…</option>
                {measure.units.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u] || u}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            UNIT_LABEL[measure.units[0]] && <p className="muted">In {UNIT_LABEL[measure.units[0]]}.</p>
          )}
          {draft.value !== "" && (
            <label className="field">
              How it was measured
              <input type="text" maxLength={200} value={draft.method} onChange={(e) => onChange({ ...draft, method: e.target.value })} />
            </label>
          )}
        </div>
      ) : (
        <label className="field">
          What you found
          <textarea id={id} rows={2} maxLength={500} value={draft.value} onChange={(e) => onChange({ ...draft, value: e.target.value })} />
        </label>
      )}
      {draft.value !== "" && spec.kind !== "text" && (
        <label className="field">
          {draft.value === "absent" ? "Where did you look?" : "Note (optional)"}
          <input type="text" maxLength={500} value={draft.note} onChange={(e) => onChange({ ...draft, note: e.target.value })} />
        </label>
      )}
      {draft.value !== "" && photoIds.length > 0 && (
        <fieldset className="survey-evidence">
          <legend>Photos that show this</legend>
          {photoIds.map((photoId, i) => (
            <label key={photoId} className="consent">
              <input
                type="checkbox"
                checked={draft.photoIds.includes(photoId)}
                onChange={(e) => onChange({ ...draft, photoIds: e.target.checked ? [...draft.photoIds, photoId] : draft.photoIds.filter((p) => p !== photoId) })}
              />
              <span>Photo {i + 1}</span>
            </label>
          ))}
        </fieldset>
      )}
    </fieldset>
  );
}

/** One survey: a form for the owner while it is a draft, and the record and review actions after that. */
export function SurveyForm({ survey, role, target, similarTo }: { survey: Survey; role: StaffRole; target: string; similarTo?: string }) {
  const router = useRouter();
  const checklist = findChecklist(survey.checklistId)!;
  const editable = role === "owner" && (survey.state === "draft" || survey.state === "returned");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(checklist.attributes.map((a) => [a.id, toDraft(survey.answers[a.id])])));
  const [notes, setNotes] = useState(survey.notes);
  const [privateNotes, setPrivateNotes] = useState(survey.privateNotes);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [dirty, setDirty] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string>();
  const [suggestions, setSuggestions] = useState<{ title: string; condition: string; category: string; lines: string[] }[]>();
  const [asking, setAsking] = useState(false);

  // Unanswered lines are left out, so a half-done survey saves as exactly that.
  const answers = () =>
    Object.fromEntries(
      Object.entries(drafts)
        .filter(([, d]) => d.value !== "")
        .map(([id, d]) => [id, { value: d.value, unit: d.unit, method: d.method, note: d.note, photoIds: d.photoIds }]),
    );

  const call = async (init: RequestInit, done: string, refresh = true) => {
    setBusy(true);
    setMessage(undefined);
    const res = await fetch(`/api/surveys/${survey.id}`, { ...init, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
    setBusy(false);
    if (res?.ok) {
      setMessage({ text: done, error: false });
      setDirty(false);
      setNote("");
      // Only the last step of a multi-step action refreshes: an earlier refresh arriving late would show stale state.
      if (refresh) router.refresh();
      return true;
    }
    const data = (await res?.json().catch(() => undefined)) as (ApiError & { problems?: string[] }) | undefined;
    setMessage({ text: data?.problems?.join(" ") ?? data?.error ?? "That did not work. Please try again.", error: true });
    return false;
  };
  const save = (done = "Saved. You can come back to this any time.", refresh = true) => call({ method: "PATCH", body: JSON.stringify({ answers: answers(), notes, privateNotes }) }, done, refresh);
  const act = (action: string, done: string) => call({ method: "PATCH", body: JSON.stringify({ action, note }) }, done);

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(undefined);
    // Save first, so a refresh after the upload does not lose what was typed.
    const saved = !dirty || (await save("Saved.", false));
    if (saved) {
      try {
        const prepared = await prepareImage(file);
        const res = await fetch(`/api/surveys/${survey.id}/photos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: prepared.dataUrl }) });
        if (res.ok) {
          setMessage({ text: "Photo added. Tick it on each line it actually shows.", error: false });
          setLastPhoto(prepared.dataUrl);
          setSuggestions(undefined);
          router.refresh();
        } else {
          setMessage({ text: ((await res.json().catch(() => undefined)) as ApiError | undefined)?.error ?? "The photo could not be added.", error: true });
        }
      } catch {
        setMessage({ text: "That photo could not be read. Try a JPEG or PNG.", error: true });
      }
    }
    setBusy(false);
  };

  // Only when asked, because each one is a paid model call. The result is a list to go and look at; it fills in nothing.
  const askAi = async () => {
    setAsking(true);
    setMessage(undefined);
    const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: lastPhoto }) }).catch(() => undefined);
    const data = (await res?.json().catch(() => undefined)) as AnalyzeResponse | ApiError | undefined;
    setAsking(false);
    if (!res?.ok || !data || "error" in data) return setMessage({ text: data && "error" in data ? data.error : "The AI could not look at this photo. You can carry on without it.", error: true });
    setSuggestions(
      data.analysis.findings.map((f) => ({
        title: f.title,
        condition: f.observed_condition,
        category: CATEGORY_INFO[f.category].label,
        lines: checklist.attributes.filter((a) => a.featureId && CATEGORY_FEATURES[f.category].includes(a.featureId)).map((a) => a.label),
      })),
    );
  };

  const shown = { checklistId: survey.checklistId, answers: Object.fromEntries(Object.entries(answers()).map(([k, a]) => [k, { value: a.value } as SurveyAnswer])) };
  const progress = surveyProgress(editable ? shown : survey);
  const problems = editable ? submitProblems({ checklistId: survey.checklistId, answers: Object.fromEntries(Object.entries(answers()).map(([k, a]) => [k, { value: a.value, method: a.method || undefined, note: a.note || undefined } as SurveyAnswer])) }) : [];

  return (
    <div className="survey">
      <p className="muted">
        {target} · seen {survey.observedOn} · <strong>{SURVEY_STATE_LABEL[survey.state]}</strong>
      </p>
      {similarTo && (
        <p className="warning" role="note">
          A survey of this same spot and checklist exists from around the same time. <a href={`/owner/survey/${similarTo}`}>Open it</a> if you meant to continue that one.
        </p>
      )}
      {survey.state === "returned" && survey.history.at(-1)?.note && (
        <p className="warning" role="note">
          Returned: {survey.history.at(-1)!.note}
        </p>
      )}

      <div className="survey-progress" role="status">
        <progress value={progress.assessed} max={progress.total} aria-label="Lines assessed on this survey" />
        <p>
          {progress.assessed} of {progress.total} lines assessed ({progress.coreAssessed} of {progress.coreTotal} core). Unchecked lines stay unknown on the public page. You do not have to finish in one go.
        </p>
      </div>

      <details className="known-group" open={survey.state === "draft" && Object.keys(survey.answers).length === 0}>
        <summary>What this checklist needs</summary>
        <p><strong>Inspect:</strong> {checklist.inspect}</p>
        <p><strong>Record:</strong> {checklist.record}</p>
        <p><strong>Useful evidence:</strong> {checklist.evidence}</p>
        <p><strong>What it cannot establish:</strong> {checklist.limits}</p>
      </details>

      {editable ? (
        <>
          {checklist.attributes.map((attribute) => (
            <AttributeField
              key={attribute.id}
              attribute={attribute}
              draft={drafts[attribute.id]}
              photoIds={survey.photoIds}
              disabled={busy}
              onChange={(next) => {
                setDirty(true);
                setDrafts({ ...drafts, [attribute.id]: next });
              }}
            />
          ))}
          <label className="field">
            Notes to publish with the survey <span className="muted">(no names or personal details)</span>
            <textarea rows={2} maxLength={2000} value={notes} onChange={(e) => { setDirty(true); setNotes(e.target.value); }} />
          </label>
          <VoiceNoteButton
            label="the notes"
            onText={(text) => {
              setDirty(true);
              setNotes((current) => appendDictation(current, text, 2000));
            }}
          />
          <label className="field">
            Private notes <span className="muted">(for the team only, never published)</span>
            <textarea rows={2} maxLength={2000} value={privateNotes} onChange={(e) => { setDirty(true); setPrivateNotes(e.target.value); }} />
          </label>
          <label className="field">
            <span>
              Add a photo <span className="muted">(no people or number plates; metadata is removed on the server)</span>
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => void addPhoto(e.target.files?.[0])} />
          </label>
          {lastPhoto && (
            <p>
              <button type="button" className="button-secondary" disabled={asking} onClick={() => void askAi()}>
                {asking ? "Asking the AI…" : "Ask the AI what to look at in this photo"}
              </button>
            </p>
          )}
          {suggestions && (
            <section aria-label="AI suggestions for this photo" className="warning">
              <p>
                <strong>Suggested by AI, not checked by anyone.</strong> Nothing here has been recorded. Go and look, then fill in the lines
                yourself. AI cannot establish measurements, whether a lift works, or compliance.
              </p>
              {suggestions.length === 0 ? (
                <p>It did not suggest anything in this photo. That does not mean there is nothing there.</p>
              ) : (
                <ul>
                  {suggestions.map((s) => (
                    <li key={s.title}>
                      {s.title} ({s.category}): {s.condition}
                      {s.lines.length > 0 && ` Related lines: ${s.lines.join(", ")}.`}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      ) : (
        <section aria-label="What was recorded">
          <ul className="source-list">
            {checklist.attributes.map((attribute) => {
              const answer = survey.answers[attribute.id];
              return (
                <li key={attribute.id}>
                  <strong>{attribute.label}</strong>: {answer ? answerLabel(attribute, answer) : <span className="muted">Not checked</span>}
                  {answer?.method && <span className="muted"> · measured by {answer.method}</span>}
                  {answer?.note && <span className="muted"> · “{answer.note}”</span>}
                  {answer?.photoIds?.length ? <span className="muted"> · {answer.photoIds.length} photo(s) cited</span> : isAssessed(answer) ? <span className="muted"> · no photo cited</span> : null}
                </li>
              );
            })}
          </ul>
          {survey.notes && <p>Notes: {survey.notes}</p>}
          {survey.privateNotes && <p className="muted">Private notes: {survey.privateNotes}</p>}
          {survey.source.reference && <p className="muted">Source: {survey.source.reference}</p>}
        </section>
      )}

      {survey.photoIds.length > 0 && (
        <ul className="survey-photos">
          {survey.photoIds.map((id, i) => (
            <li key={id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
              <img src={`/api/surveys/photos/${id}`} alt={`Survey photo ${i + 1}`} width={160} height={120} loading="lazy" />
              <a href={`/api/surveys/photos/${id}`} target="_blank" rel="noopener">
                Photo {i + 1} full size (opens in a new tab)
              </a>
            </li>
          ))}
        </ul>
      )}

      {survey.checks.length > 0 && (
        <ul className="source-list">
          {survey.checks.map((c, i) => (
            <li key={i}>
              Checked by the {c.by} on {c.at.slice(0, 10)}: {c.note}
            </li>
          ))}
        </ul>
      )}

      <p className={message?.error ? "field-error" : "muted"} role="status">
        {message?.text}
      </p>

      {editable && (
        <div className="survey-actions">
          {problems.length > 0 && Object.keys(answers()).length > 0 && (
            <ul className="warning">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <button type="button" className="button-secondary" disabled={busy} onClick={() => void save()}>
            Save draft
          </button>{" "}
          <button
            type="button"
            className="button-primary"
            disabled={busy || problems.length > 0}
            onClick={() => void (async () => { if (await save("Saved.", false)) await act("submit", "Submitted for review. It is not public yet."); })()}
          >
            Submit for review
          </button>
        </div>
      )}

      {(survey.state === "submitted" || survey.state === "approved") && (
        <section aria-labelledby="review-title" className="profile-section">
          <h2 id="review-title">Review</h2>
          <p className="muted">
            Approving publishes this as recorded by the project team. It does not verify it. Only a check with a recorded reason, by a
            different role from whoever recorded it, makes it independently verified. A photo shows only what it shows, not every line.
          </p>
          <label className="field">
            Reason or what the check was based on
            <input type="text" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="survey-review-actions">
            {survey.state === "submitted" && (
              <>
                <button type="button" className="button-primary" disabled={busy} onClick={() => void act("approve", "Approved. It is now on the public place page.")}>
                  Approve for public use
                </button>{" "}
                <button type="button" className="button-secondary" disabled={busy} onClick={() => void act("return", "Returned for changes.")}>
                  Return for changes
                </button>{" "}
                <button type="button" className="button-secondary button-danger" disabled={busy} onClick={() => void act("reject", "Rejected. It stays private.")}>
                  Reject
                </button>{" "}
              </>
            )}
            {role !== survey.observer && (
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void act("check", "Your check was recorded.")}>
                Record an independent check
              </button>
            )}{" "}
            {survey.state === "approved" && role === "owner" && (
              <button type="button" className="button-secondary button-danger" disabled={busy} onClick={() => void act("withdraw", "Taken off the public site.")}>
                Take off the public site
              </button>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
