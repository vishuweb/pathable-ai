# PathAble AI

**One world. Different needs. More accessible journeys.** Turn photos of public spaces into **evidence-backed, person-checked reports** of potential accessibility barriers, for people with different needs: moving around (wheelchairs, walkers, prams), seeing, hearing, finding the way, and comfort.

Every barrier category is tagged with the needs it may affect: blocked curb ramps, obstructed footpaths, damaged surfaces, difficult entrances, tactile guidance problems, hard-to-detect obstacles, crossing problems, and signage or wayfinding problems. Visitors can choose their own needs on **My needs** (stored only in their browser, never sent anywhere) and filter community reports by them. Things a photo cannot show, such as whether a signal is audible or a lift works, are never guessed.

**Places.** Reports can be linked to a real place found through OpenStreetMap, and **Explore places** shows a place's accessibility information as recorded by OpenStreetMap contributors: wheelchair access, steps, ramps, kerbs, tactile paving, audible and vibrating crossing signals, written information, hearing loops, seating and more, each item separately, marked as community data and never as verified. Missing items are shown as unknown, old survey dates are flagged, there is no overall score, and the page lists PathAble reports within 150 m. Place search runs through the server with OpenStreetMap's usage rules (identifying User-Agent, at most one request per second, caching); no key or payment is involved.

Built for the Meta Global AI Developer Hackathon with the Meta Model API:

- **Muse Spark 1.3** reasons about the scene and returns structured findings.
- **SAM 3.1** segments the visual evidence behind each finding.
- **Muse Voice Transcribe 1.0** turns the reviewer's spoken notes into text.

**Live demo:** https://pathable-ai.vercel.app. Press **Report a barrier**, then upload a photo of a street, crossing or entrance, or pick one under **No photo handy? Try a sample**.

**Docs:** [Architecture](docs/ARCHITECTURE.md) · [Roadmap and status](docs/ROADMAP.md) · [Evaluation plan](docs/EVALUATION.md) · [Security and privacy](docs/SECURITY-PRIVACY.md) · [Public-beta readiness](docs/BETA-READINESS.md) · [Demo script](docs/DEMO.md) · [Submission checklist](docs/SUBMISSION.md)

**Built during the hackathon.** Everything here was written during the hackathon window (Oct 26 – Nov 4, 2026); the git history starts on Oct 29. See [what was built](docs/SUBMISSION.md#5-built-during-the-hackathon).

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your MODEL_API_KEY from https://dev.meta.ai
npm run dev                  # http://localhost:3000
```

Health check: `GET /api/health` reports whether the API key is configured.

Open the app, press **Report a barrier** (`/report`) and pick a photo under **No photo handy? Try a sample** to run the full pipeline without your own photo.

**Site structure.** The public site is the home page (who it is for, how it works, what sharing means), **Report a barrier** (`/report`), **Reports** (`/reports`), **Privacy** and **Measured results**. The evaluation and moderation tools (batch analysis, review queue, status changes, deletion) live in a separate **Owner workspace** (`/owner`), linked from the footer and protected on the server.

Command-line checks:

```bash
npm test                                                       # 63 tests; the Meta API is mocked, so they cost nothing
npm run lint && npm run typecheck                              # ESLint (Next.js rules) and TypeScript
npm run e2e                                                    # browser test of the whole flow against the mocked API (needs Chrome)
npm run smoke:spark -- path/to/photo.jpg                       # Muse Spark alone
npm run smoke:sam -- path/to/photo.jpg "electric scooter"      # SAM 3.1 alone
node scripts/try-analyze.mjs public/samples/e-scooters-warsaw.jpg  # full pipeline (needs npm run dev)
```

### Checking the real Meta API by hand

The automated tests use a mock of the Meta API, so they cost nothing. To confirm the real integration, make a few deliberate calls yourself (each one uses your API quota):

1. `npm run dev`, then open http://localhost:3000/api/health: it should show `"apiKeyConfigured": true`.
2. Open http://localhost:3000/report and pick a photo under **No photo handy? Try a sample**. Findings should appear in about 10 seconds, then outlines.
3. Optional, from a terminal: `npm run smoke:spark -- public/samples/e-scooters-warsaw.jpg` (one Muse Spark call), or `npm run smoke:sam -- public/samples/e-scooters-warsaw.jpg "electric scooter"` (one SAM call).

## How it works

```
Photo ─► browser re-encodes it (fixes rotation, max 1600 px, strips GPS/EXIF)
      ─► POST /api/analyze ─► Muse Spark 1.3 (strict JSON schema) ─► findings
      ─► POST /api/segment ─► SAM 3.1, one call per evidence phrase ─► masks
      ─► each finding keeps the masks inside its box ─► evidence overlay + report cards
      ─► human review (notes typed, or dictated ─► POST /api/transcribe ─► Muse Voice)
      ─► POST /api/reports ─► saved report (Markdown / JSON / PDF)
```

**1. Analysis: Muse Spark 1.3.** Each finding has:

- a category: blocked curb ramp, obstructed footpath, damaged surface, difficult entrance, or other
- the observed condition and why it matters
- potential impact and confidence
- what the photo cannot show (uncertainty)
- a suggested next step
- an **evidence phrase** (such as "electric scooter") and a rough **bounding box**

The reply is validated with Zod before use: a bad value falls back to a safe default (an unknown confidence becomes "low"), and a finding with no usable location is kept but drawn nowhere, so a possible barrier is never silently dropped.

The prompt treats every finding as a *candidate for human review*. It never certifies compliance, and it never concludes a route is inaccessible just because an object is visible.

**2. Evidence: SAM 3.1.** Each unique evidence phrase is segmented once, and the calls run in parallel. Masks are decoded with Meta's [`@meta-sam/parser`](https://www.npmjs.com/package/@meta-sam/parser) and drawn as SVG over the photo. Two rules connect each mask to its finding:

- **Matching.** A SAM object counts as evidence when at least 40% of it lies inside the finding's box, with 15% tolerance added to the box. This works for single objects ("a fallen scooter") and for groups ("scooters across the path").
- **No double counting.** If two findings' boxes overlap, each object goes to the finding whose box contains it most.

- **Shared objects.** If two findings point at the same single object (one scooter blocking both a ramp and a footpath), both show its outline.

**3. Honest fallback.** If SAM finds nothing that matches, times out, or returns incomplete output, the finding shows a dashed *approximate* box and is flagged for careful review. It never shows a confident highlight it can't support. Each Meta API call has a deadline inside the 60 s route limit, so one slow call can't stall the rest.

**4. Human review.** Nothing becomes a report until a person has checked it. For each finding the reviewer chooses:

- *Yes, real barrier*, *Real, wrong category* (and picks the right one), or *Not a barrier*
- whether the highlight on the photo actually shows the barrier: yes, partly, or no

The reviewer can also add barriers the AI missed, attach a location (typed, or the device's current position), and leave a note. The report can be saved only when every finding is reviewed and the reviewer confirms they may share the photo, that it does not clearly show anyone's face or number plate, and that the report will be public. The confirmation time is stored with the report, and the [privacy page](app/privacy/page.tsx) (`/privacy`) explains what is stored and how to ask for removal.

**Voice notes.** Every note field has a **Dictate** button, for reviewers who find typing on a phone hard or are standing at the barrier. The browser records up to 60 seconds and converts it to 16 kHz mono WAV, and `POST /api/transcribe` sends it to Muse Voice Transcribe 1.0. Recognition is biased toward accessibility terms such as "curb ramp", "tactile paving" and "bollard". The transcript is added to the field for the reviewer to check and edit; it is never saved unseen.

**5. Saved reports.** Each report keeps the photo, the AI findings, the evidence outlines, and the human verdicts. It also has a **status** with a dated history: *Submitted* → *Under review* → *Verified* → *Action reported* → *Rechecked* → *Resolved*, or *Closed* (a duplicate, linked to the original, or not a barrier). Only the project owner can change it, and statuses that claim something happened (action reported, rechecked, resolved, closed) need a note saying what they are based on, so a report is never shown as fixed without a stated reason. The **Saved reports** page lists them. Each report can be downloaded as a Markdown maintenance request, as JSON data, or printed or saved as a PDF.

Every review doubles as an evaluation label. Confirmed, corrected, rejected and missed counts, highlight ratings, and review time are recorded automatically, and they feed the measured results below.

Reports are stored on local disk (`data/reports/`, git-ignored; override the base folder with `DATA_DIR`), or in Vercel Blob when deployed (see below).

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

## Deploying

The app runs on Vercel as is. A serverless disk does not persist, so a deployment stores reports and the review queue in a **private Vercel Blob store**.

1. Import the repository in Vercel and add the environment variables:
   - `MODEL_API_KEY`
   - `OWNER_KEY`: a long random secret
2. Create a Blob store (Storage → Blob, access **private**) and connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`, and the app switches from disk to Blob automatically. `GET /api/health` reports which storage is in use.
3. Optional: copy your local reports and queue to the store:

   ```bash
   vercel env pull .env.production.local --environment production
   node --env-file=.env.production.local scripts/upload-data.mjs
   ```

On a public link, three protections are on:

- **Owner-only evaluation tools.** Batch analysis and the review queue need the owner key; sign in at `/owner`. Visitors can still analyze a photo, review it and save a report. A deployment without `OWNER_KEY` keeps these tools locked rather than open.
- **Reviewers.** Set `REVIEWER_KEY` to let a helper sign in at `/owner` and work through the review queue (review, save, skip, remove unusable photos) and see results. Reviewers cannot run batch analysis, change report statuses or delete reports; the server enforces this. Queued photos are visible only to the owner and reviewers.
- **Moderation.** Signed in as owner, a **Delete report** button on each saved report removes it and its photo, for spam or a photo showing an identifiable person.
- **Clean measurements.** Visitors' single uploads are left out of the measured results, so the numbers come only from the owner's reviewed batches.
- **Cost limits.** Each visitor can run 30 photo analyses, 30 evidence runs and 30 voice notes an hour (`ANALYZE_LIMIT_PER_HOUR`). All visitors together get 300 AI calls a day (`AI_DAILY_LIMIT`), and `AI_PAUSED=1` stops AI calls entirely. The counts are kept in memory on each server instance, so they bound cost rather than enforce an exact total; set a spending limit on the API account as well if one is available.

## Code map

| Path | What it does |
| --- | --- |
| `lib/analyze.ts` | Muse Spark prompt, strict JSON schema, and normalization of findings |
| `lib/segment.ts`, `lib/geometry.ts` | SAM 3.1 calls, mask decoding, and matching masks to findings |
| `lib/transcribe.ts`, `lib/wav.ts`, `lib/record-voice.ts` | Voice notes: browser recording → WAV → Muse Voice |
| `lib/pipeline.ts` | The browser-side pipeline shared by single uploads and batch analysis |
| `lib/report.ts`, `lib/report-validate.ts` | Report and review types, and server-side validation of everything saved |
| `lib/metrics.ts` | Precision, recall and the other measures, with Wilson intervals |
| `lib/store.ts` | Storage: local disk or Vercel Blob |
| `lib/owner.ts`, `lib/rate-limit.ts` | Protections for a public deployment |
| `components/ReviewSession.tsx` | The review screen: evidence viewer, finding cards, review controls, save |
| `app/api/*` | Route handlers: analyze, segment, transcribe, reports, drafts, results, health |

## Evaluation

The evaluation set is built from human reviews in the app itself (see *Measured results* above):

- **80 web photos** of streets and entrances from Wikimedia Commons (CC BY / CC BY-SA / public domain). They were hand-picked as 54 likely-barrier and 26 likely-clear scenes, so false alarms are measured as well as hits.
- **The author's own photos** of local streets, reported separately, because web photos are often taken *because* something is wrong.

The numbers are on the app's **Results** page (`/results`, or `/api/results` as JSON) and will be summarized here once review is complete. The full protocol, measures and threats to validity are in the [evaluation plan](docs/EVALUATION.md).

## Limitations

- **One photo, one viewpoint.** A photo cannot show widths, slopes, step heights or surface firmness with any certainty. Findings are candidates for a person to check, not measurements, and never a compliance assessment.
- **Evidence is approximate.** Muse Spark's boxes are rough, and SAM 3.1 outlines whatever matches the evidence phrase. A mismatch shows as a dashed *approximate* box, and the reviewer rates every highlight, so the error rate is measured rather than hidden.
- **Evaluation bias.** One reviewer (the author), photos chosen rather than randomly sampled, and a small set. The 95% ranges on the Results page show how wide the uncertainty is.
- **Privacy.** GPS and other metadata are stripped in the browser before upload, but faces and number plates in a photo are not blurred. Do not upload photos of identifiable people without consent.
- **Voice notes.** Recognition is tuned for English accessibility terms, and transcripts can repeat a word, so the reviewer edits the text before saving.
- **Scale.** The rate limit is counted per server instance, and listing reports reads every saved item. That is fine for hundreds of reports, but not for a city-wide service.
