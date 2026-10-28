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

## How it works (so far)

```
Photo ─► browser re-encodes it (fixes rotation, max 1600 px, strips GPS/EXIF)
      ─► POST /api/analyze ─► Muse Spark 1.3 (strict JSON schema) ─► findings
      ─► POST /api/segment ─► SAM 3.1, one call per evidence phrase ─► masks
      ─► each finding keeps the masks inside its box ─► evidence overlay + report cards
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

**3. Honest fallback.** If SAM finds nothing that matches, or segmentation fails, the finding shows a dashed *approximate* box and is flagged for careful review. It never shows a confident highlight it can't support.

**Accessibility of the app itself:** keyboard operable, skip link, visible focus, screen-reader status updates, colour-blind-safe palette with numbered markers (colour is never the only cue), 44 px touch targets, reduced-motion support, and a mobile-first layout.

Sample photos are from Wikimedia Commons under CC BY-SA 4.0; see [public/samples/CREDITS.md](public/samples/CREDITS.md).

## Status

Work in progress. Architecture, evaluation results, and limitations will be documented here.
