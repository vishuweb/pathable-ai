# What was built during the hackathon

Meta Global AI Developer Hackathon 2026, **Indie track**. Hackathon window: Oct 26 – Nov 4, 2026.

## Pre-existing work

None. There was no earlier code base, prototype or template beyond the standard `create-next-app` scaffold. The first commit (`84e4e64`, "scaffold next js app and meta model api clients") is dated **2026-10-29 04:18 IST**, inside the window. Every one of the commits since then is by the same author, and the history has never been rewritten or force-pushed. You can check this with:

```
git log --reverse --format='%h %ad %an %s' --date=iso
```

| Date | Commits |
| --- | --- |
| Oct 29 | 16 |
| Oct 30 | 15 |
| Oct 31 | 3 |
| Nov 1 | 2 |
| Nov 2 | 1 |
| Nov 3 | 8 |
| Nov 4 | final polish (see `git log`) |

## Built during the event, by area

### Meta model integrations (all new)

| Model | What it does here | First commits |
| --- | --- | --- |
| **Muse Spark 1.3** | Reads a photo and returns candidate barriers in a strict JSON schema, each with what is visible, why it may matter, its uncertainty and a suggested next step. Validated with Zod (`lib/analyze.ts`, `lib/types.ts`) | `84e4e64`, `be3d184` |
| **SAM 3.1** | Segments the visual evidence behind each finding from its evidence phrase, matched back to the finding's box, with an honest *approximate* fallback when they disagree (`lib/segment.ts`, `lib/evidence-map.ts`) | `f460ed9`, `584e198` |
| **Muse Voice Transcribe 1.0** | Turns a spoken note into text, primed with accessibility terms (`lib/transcribe.ts`, `lib/record-voice.ts`, `lib/wav.ts`) | `a0d6c32` |
| Survey assistance | Muse Spark drafts survey checklist answers from a photo, kept as suggestions | `93af3d1` |
| Cost safety | Daily cap, pause switch, credit stop, reuse of identical requests, usage records (`lib/ai-guard.ts`) | `e777cfc`, `93af3d1` |

### Original product features

- **Human-in-the-loop review.** No AI finding becomes a report until a person confirms, corrects or rejects it, rates the highlight and adds anything missed (`8d97cf6`).
- **Needs-first accessibility profiles** for mobility, vision, hearing, wayfinding and comfort, stored only in the browser (`1739096`, `c96b5dc`).
- **Campus-scoped place intelligence** for IIT (ISM) Dhanbad. A real OpenStreetMap boundary, a point-in-polygon check on every search and save, and place profiles that combine OSM tags, reports, observations and surveys, each with provenance, dates and conflicts (`896e338`, `81de1b0`, `35a32d4`).
- **Location-linked reports and moderation.** Consent, approval before anything is public, dated status history and independent verification (`426002d`, `1dfcc4a`, `0d89199`, `f024b4a`).
- **Field survey workspace.** Checklists, coverage dashboard, and import and export with validation (`50e687d`).
- **Evaluation.** Every review becomes a label. Precision, recall, calibration and confusions are reported with 95% ranges (`3936aa8`, `93af3d1`).
- **Isolated demo.** Four drawn scenarios (mobility, vision, hearing, wayfinding). They are labelled *Illustrative demo — not verified campus data*, kept only in the browser, and never counted in real statistics (`01e27fa`).
- **Design.** A single-stylesheet design system, a guided eight-step report flow and an owner workspace (`01e27fa`, `529a70e`).

### Engineering

- Next.js 15 App Router, React 19 and strict TypeScript. Storage is Vercel Blob or local files.
- Security: same-origin writes, photo sniffing and metadata stripping, rate limits, and a locked owner area (`0d89199`, `f024b4a`).
- Tests: about 160 unit and API tests against a mock Meta server, 19 Puppeteer journeys, and a Playwright review of every page at five widths with axe accessibility checks. CI runs on GitHub Actions (`93af3d1`, `f3631f4`).

## Not claimed

- Campus field surveys have not been carried out yet, and the demo scenarios are not campus data.
- No disabled person has tested the product yet.
- Evaluation numbers are only what the Results page shows from real reviews.
