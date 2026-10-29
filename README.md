# PathAble AI

Turn photos of public spaces into **evidence-backed, human-verified reports** of potential accessibility barriers: blocked curb ramps, obstructed footpaths, damaged walking surfaces, and difficult entrances.

Built for the Meta Global AI Developer Hackathon with the Meta Model API:

- **Muse Spark 1.3** reasons about the scene and returns structured findings.
- **SAM 3.1** segments the visual evidence behind each finding.

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your MODEL_API_KEY from https://dev.meta.ai
npm run dev                  # http://localhost:3000
```

Health check: `GET /api/health` reports whether the API key is configured.

Open the app and click **Try a sample** to run the full pipeline without your own photo.

Command-line checks:

```bash
npm run smoke:spark -- path/to/photo.jpg                       # Muse Spark alone
npm run smoke:sam -- path/to/photo.jpg "electric scooter"      # SAM 3.1 alone
node scripts/try-analyze.mjs public/samples/e-scooters-warsaw.jpg  # full pipeline (needs npm run dev)
```

## How it works

```
Photo ─► browser re-encodes it (fixes rotation, max 1600 px, strips GPS/EXIF)
      ─► POST /api/analyze ─► Muse Spark 1.3 (strict JSON schema) ─► findings
      ─► POST /api/segment ─► SAM 3.1, one call per evidence phrase ─► masks
      ─► each finding keeps the masks inside its box ─► evidence overlay + report cards
      ─► human review ─► POST /api/reports ─► saved report (Markdown / JSON / PDF)
```

**1. Analysis: Muse Spark 1.3.** Each finding has:

- a category: blocked curb ramp, obstructed footpath, damaged surface, difficult entrance, or other
- the observed condition and why it matters
- potential impact and confidence
- what the photo cannot show (uncertainty)
- a suggested next step
- an **evidence phrase** (such as "electric scooter") and a rough **bounding box**

The prompt treats every finding as a *candidate for human review*. It never certifies compliance, and it never concludes a route is inaccessible just because an object is visible.

**2. Evidence: SAM 3.1.** Each unique evidence phrase is segmented once, and the calls run in parallel. Masks are decoded with Meta's [`@meta-sam/parser`](https://www.npmjs.com/package/@meta-sam/parser) and drawn as SVG over the photo. Two rules connect each mask to its finding:

- **Matching.** A SAM object counts as evidence when at least 40% of it lies inside the finding's box, with 15% tolerance added to the box. This works for single objects ("a fallen scooter") and for groups ("scooters across the path").
- **No double counting.** If two findings' boxes overlap, each object goes to the finding whose box contains it most.

- **Shared objects.** If two findings point at the same single object (one scooter blocking both a ramp and a footpath), both show its outline.

**3. Honest fallback.** If SAM finds nothing that matches, times out, or returns incomplete output, the finding shows a dashed *approximate* box and is flagged for careful review. It never shows a confident highlight it can't support. Each Meta API call has a deadline inside the 60 s route limit, so one slow call can't stall the rest.

**4. Human review.** Nothing becomes a report until a person has checked it. For each finding the reviewer chooses:

- *Yes, real barrier*, *Real, wrong category* (and picks the right one), or *Not a barrier*
- whether the highlight on the photo actually shows the barrier: yes, partly, or no

The reviewer can also add barriers the AI missed, attach a location (typed, or the device's current position), and leave a note. The report can be saved only when every finding is reviewed.

**5. Saved reports.** Each report keeps the photo, the AI findings, the evidence outlines, and the human verdicts. The **Saved reports** page lists them. Each report can be downloaded as a Markdown maintenance request, as JSON data, or printed or saved as a PDF.

Every review doubles as an evaluation label. Confirmed, corrected, rejected and missed counts, highlight ratings, and review time are recorded automatically, and they feed the measured results below.

Reports are stored on local disk (`data/reports/`, git-ignored; override the base folder with `DATA_DIR`).

**6. Measured results.** To evaluate on many photos:

1. **Batch analyze** (`/batch`): select photos or a whole folder, and mark them as your own photos or web photos. They are analyzed two at a time in the background. Photos that were already analyzed are skipped, so you can re-run a growing folder.
2. **Review queue** (`/review`): step through the analyzed photos without waiting for the AI, and review each one as above. Each save moves straight to the next photo.
3. **Results** (`/results`, or `/api/results` as JSON):
   - precision: AI findings that were real barriers
   - recall: verified barriers the AI found
   - category accuracy
   - highlight quality
   - false alarms on photos with no barrier
   - median review and AI time

   Results are broken down by photo source and by barrier type. Every rate comes with a 95% Wilson interval, so small samples are not overstated.

**Accessibility of the app itself:** keyboard operable, skip link, visible focus, screen-reader status updates, colour-blind-safe palette with numbered markers (colour is never the only cue), 44 px touch targets, reduced-motion support, and a mobile-first layout.

Sample photos are from Wikimedia Commons under CC BY-SA 4.0; see [public/samples/CREDITS.md](public/samples/CREDITS.md).

## Status

Work in progress. Evaluation results on real-world photos, and the known limitations, will be documented here.
