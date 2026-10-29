"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { postJson, runPipeline } from "@/lib/pipeline";
import { sourceKey, type DraftSubmission, type DraftsSummary, type SaveReportResponse } from "@/lib/report";

type ItemStatus = "waiting" | "analyzing" | "done" | "skipped" | "failed";

interface Item {
  key: string;
  file: File;
  name: string;
  status: ItemStatus;
  detail?: string;
}

const DATASETS = [
  { value: "own", label: "My own photos" },
  { value: "web", label: "Photos from the web" },
];
const CONCURRENCY = 2;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const STATUS_LABEL: Record<ItemStatus, string> = {
  waiting: "Waiting",
  analyzing: "Analyzing…",
  done: "Queued for review",
  skipped: "Already analyzed",
  failed: "Failed",
};

export function BatchAnalyzer() {
  const [dataset, setDataset] = useState("own");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const stopRequested = useRef(false);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const choose = async (fileList: FileList | null) => {
    const files = [...(fileList ?? [])].filter((f) => IMAGE_TYPES.includes(f.type));
    if (!files.length) {
      setMessage("No JPEG, PNG or WebP photos were selected.");
      return;
    }
    let known = new Set<string>();
    try {
      const res = await fetch("/api/drafts");
      known = new Set(((await res.json()) as DraftsSummary).knownSources);
    } catch {
      // Without the list, nothing is skipped; duplicates are harmless.
    }
    const next = files
      .map((file) => {
        const name = file.webkitRelativePath || file.name;
        const key = sourceKey({ dataset, file: name });
        return { key, file, name, status: known.has(key) ? "skipped" : "waiting" } satisfies Item;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setItems(next);
    const skipped = next.filter((i) => i.status === "skipped").length;
    setMessage(
      `${plural(next.length, "photo")} selected${skipped ? `, ${skipped} already analyzed and skipped` : ""}. Press Start to analyze.`,
    );
  };

  const start = async () => {
    const queue = items.filter((i) => i.status === "waiting" || i.status === "failed");
    if (!queue.length) return;
    stopRequested.current = false;
    setRunning(true);
    setMessage(`Analyzing ${plural(queue.length, "photo")}…`);
    let done = 0;
    let failed = 0;

    const worker = async () => {
      while (queue.length && !stopRequested.current) {
        const item = queue.shift()!;
        update(item.key, { status: "analyzing", detail: undefined });
        try {
          const result = await runPipeline(item.file);
          const draft: DraftSubmission = {
            image: result.image.dataUrl,
            width: result.image.width,
            height: result.image.height,
            analysis: result.analysis,
            evidence: Object.values(result.evidence),
            models: result.models,
            timings: result.timings,
            source: { dataset, file: item.name },
          };
          await postJson<SaveReportResponse>("/api/drafts", draft);
          const n = result.analysis.findings.length;
          update(item.key, { status: "done", detail: `${n} ${n === 1 ? "finding" : "findings"}` });
          done++;
        } catch (error) {
          update(item.key, { status: "failed", detail: error instanceof Error ? error.message : "Unknown error" });
          failed++;
        }
        setMessage(`Analyzed ${done + failed} of ${done + failed + queue.length}…`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setRunning(false);
    setMessage(
      stopRequested.current
        ? `Stopped. ${plural(done, "photo")} queued for review${failed ? `, ${failed} failed` : ""}.`
        : `Finished. ${plural(done, "photo")} queued for review${failed ? `, ${failed} failed (press Start to retry them)` : ""}.`,
    );
  };

  const counts = items.reduce<Record<ItemStatus, number>>(
    (acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }),
    { waiting: 0, analyzing: 0, done: 0, skipped: 0, failed: 0 },
  );
  const toProcess = counts.waiting + counts.failed;
  const finished = counts.done + counts.failed;

  return (
    <div className="batch">
      <section className="upload-panel" aria-labelledby="batch-setup">
        <h2 id="batch-setup">1. Choose photos</h2>
        <fieldset className="segmented" disabled={running}>
          <legend>Where are these photos from?</legend>
          <div className="segments">
            {DATASETS.map((d) => (
              <label key={d.value} className="segment">
                <input
                  type="radio"
                  name="dataset"
                  value={d.value}
                  checked={dataset === d.value}
                  onChange={() => setDataset(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted">Results are reported separately for each source.</p>

        <div className="batch-pickers">
          <label className="button-primary">
            Choose photos
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              multiple
              disabled={running}
              className="visually-hidden"
              onChange={(e) => void choose(e.target.files)}
            />
          </label>
          <label className="button-secondary">
            Choose a folder
            <input
              type="file"
              // @ts-expect-error -- non-standard attribute supported by all major browsers
              webkitdirectory=""
              disabled={running}
              className="visually-hidden"
              onChange={(e) => void choose(e.target.files)}
            />
          </label>
        </div>
      </section>

      <section className="batch-run" aria-labelledby="batch-run-heading">
        <h2 id="batch-run-heading">2. Analyze</h2>
        <p role="status" className="status">
          {message}
        </p>
        {items.length > 0 && (
          <progress
            max={finished + toProcess + counts.analyzing}
            value={finished}
            aria-label="Batch progress"
          />
        )}
        <div className="batch-actions">
          <button type="button" className="button-primary" onClick={() => void start()} disabled={running || !toProcess}>
            {counts.failed && !counts.waiting ? `Retry ${counts.failed} failed` : `Start (${toProcess} photos)`}
          </button>
          {running && (
            <button type="button" className="button-secondary" onClick={() => (stopRequested.current = true)}>
              Stop after current photos
            </button>
          )}
          {!running && counts.done > 0 && (
            <Link className="button-secondary" href="/review">
              Review the queue
            </Link>
          )}
        </div>
        <p className="muted">Keep this tab open while photos are analyzed. Each photo takes about 10–15 seconds.</p>

        {items.length > 0 && (
          <ol className="batch-list">
            {items.map((item) => (
              <li key={item.key} className={`batch-item status-${item.status}`}>
                <span className="batch-name">{item.name}</span>
                <span className="batch-status">
                  {STATUS_LABEL[item.status]}
                  {item.detail && ` · ${item.detail}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
