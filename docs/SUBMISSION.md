# Submission checklist

Meta Global AI Developer Hackathon: submissions close **Nov 4, 2026, 9:00 PM ET**. Judging runs Nov 4–8; finals are Nov 9.

**Track:** Indie developer ("judged on creativity, technical ambition, and whether it works"). **Theme:** Build for Your World.

## 1. Official rules

The detailed Official Rules and the submission form are only visible to registered participants. Before submitting, open them from the event dashboard and check:

- [ ] Required fields, and any limits on description length
- [ ] Demo video: maximum length, hosting (YouTube, Loom...), public or unlisted
- [ ] Whether the repository must be public, and whether a licence is required
- [ ] Whether a live demo link is required or optional
- [ ] Any rule on work started before the hackathon (see section 5)
- [ ] Which Meta models must be used (this project uses Muse Spark 1.3, SAM 3.1 and Muse Voice Transcribe 1.0 through the Meta Model API)

## 2. Public repository

- [ ] https://github.com/vishuweb/pathable-ai is public and the default branch is `main`
- [ ] README: what it does, live link, setup, how it works, evaluation, limitations
- [ ] `docs/ARCHITECTURE.md`, `docs/EVALUATION.md`, `docs/DEMO.md` are present
- [ ] No secrets: `.env.local` is git-ignored and `.env.example` has placeholders only
- [ ] A licence file, if the rules ask for one or you want the code open source
- [ ] `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass

## 3. Accessible demo

- [ ] https://pathable-ai.vercel.app opens in a private window
- [ ] `GET /api/health` shows `"apiKeyConfigured": true` and `"storage": "blob"`
- [ ] One photo analyzed, reviewed and saved end to end on the live site
- [ ] The owner key works at `/owner`, and Batch analyze and Review queue are locked when signed out
- [ ] Cost limits suit the judging period (`AI_DAILY_LIMIT`, default 300 a day; `AI_PAUSED=1` to stop)

## 4. Video

- [ ] Recorded from `docs/DEMO.md`, under 3:00, with captions
- [ ] Link tested in a private window and added to the README and the form

## 5. Built during the hackathon

The whole project was created during the hackathon window (Oct 26 – Nov 4, 2026); the repository's history starts on Oct 29, 2026. Built in that time:

- Photo preparation in the browser (rotation, resizing, metadata stripping)
- Muse Spark 1.3 analysis with a strict JSON schema and Zod validation
- SAM 3.1 evidence matching, overlay viewer and honest fallbacks
- Human review: confirm, correct, reject, highlight rating, missed barriers, location
- Voice notes with Muse Voice Transcribe 1.0
- Saved reports with Markdown, JSON and PDF export
- Batch analysis, review queue and the measured-results page with Wilson intervals
- Vercel deployment with private Blob storage, owner key and cost limits
- 40 automated tests against a mocked Meta API

Third-party pieces: Next.js, React, the `openai` SDK (pointed at the Meta Model API), `@meta-sam/parser`, `@vercel/blob`, Zod. Sample and evaluation photos come from Wikimedia Commons under their licences.

## 6. Draft text for the form

Edit these to your own voice; check the form's length limits.

**One-liner:** Photos of public spaces in, evidence-backed accessibility reports out, with a person verifying every finding.

**Description:**
PathAble AI turns a photo of a street, crossing or entrance into a report of *potential* accessibility barriers: blocked curb ramps, obstructed footpaths, damaged surfaces and difficult entrances. Muse Spark 1.3 reads the scene and returns structured findings, each with what it sees, why it may matter and what the photo cannot show. SAM 3.1 outlines the visual evidence for each finding on the photo, with an honest "approximate" fallback when it cannot. Nothing becomes a report until a person confirms, corrects or rejects every finding, rates whether the highlight is right, and adds anything the AI missed, by typing or by dictating with Muse Voice Transcribe 1.0. Saved reports export as a maintenance request. Every review also serves as an evaluation label, so the app measures its own precision, recall and evidence quality, with 95% confidence ranges. It never claims compliance and never treats an object's presence as proof a route is inaccessible.

**How Meta's models are used:** Muse Spark 1.3 (scene analysis, strict JSON), SAM 3.1 (open-vocabulary segmentation of each finding's evidence phrase), Muse Voice Transcribe 1.0 (voice notes, biased toward accessibility vocabulary), all through the Meta Model API.

**Results:** *[Fill in from /results once the review is complete; leave out if not finished.]*

## 7. After judging

- [ ] Set `AI_PAUSED=1` in Vercel (Settings → Environment Variables), then redeploy, if you want to stop API use
