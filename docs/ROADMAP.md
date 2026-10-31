# Product requirements and roadmap

## Vision

Make public spaces more accessible through trustworthy accessibility information: evidence-backed reports that a person has checked, with an honest record of what is known, what is not, and what has happened since.

**Users:** wheelchair users and others with mobility limitations, older adults, caregivers, accessibility advocates and volunteers, and the campus or council teams who maintain public spaces. Needs differ; the product never assumes a person's disability or treats the absence of a report as proof that a place is accessible.

## Principles

1. **Evidence before claims.** Every finding points at what is visible in the photo; inference and uncertainty are labelled as such.
2. **A person decides.** AI output is a candidate until a reviewer confirms, corrects or rejects it.
3. **Statuses reflect real events.** Nothing is shown as fixed without a dated note saying what that is based on.
4. **Unknown stays unknown.** Missing information is shown as missing, never filled in.
5. **Accessible by default.** The app itself targets WCAG 2.2 AA and is checked automatically and by keyboard.
6. **Cheap to run, safe to share.** Cost limits, consent before publishing, and minimal personal data.

## Phases

| Phase | Scope | State |
| --- | --- | --- |
| A. Core MVP | Photo → findings → evidence → human review → report; failure handling | **Done** |
| B. Persistent reporting | Stored reports, status and history, deletion, consent, duplicates | **Mostly done** (single owner role; no accounts) |
| C. Place discovery | Searchable place profiles with step-free, entrance, toilet information | **Started**: OpenStreetMap search and profiles; no verified attributes of our own yet |
| D. Maps and routing | Map of reports first; routing only with reliable data | Not started; routing deliberately deferred |
| E. Community verification | Confirm or dispute findings, follow reports, upload rechecks | Not started: needs accounts, moderation and abuse reporting first |
| F. Organization dashboard | Roles, assignment, remediation evidence, response times | Not started: needs server-side roles and accounts |
| G. Advanced | Video, multilingual, PWA/offline, notifications | Voice notes done; the rest not started |

## 1. Completed and verified

| Feature | How it was verified |
| --- | --- |
| Photo preparation: rotation, resize to 1600 px, metadata stripping | Browser tests; EXIF-rotated photo checks |
| Muse Spark analysis, strict JSON schema, Zod validation with safe fallbacks | 9 unit tests with a mocked API; live calls during development |
| SAM 3.1 evidence matching, approximate and unavailable fallbacks, shared objects | 5 tests with a mocked SAM stream; live calls during development |
| Review: confirm, correct, reject, highlight rating, missed barriers, location | Route tests; browser tests; keyboard-only pass |
| Separation of AI interpretation, visible evidence and verification status | Browser check; end-to-end test |
| Consent before saving, recorded with the report; a box listing exactly what becomes public | Route tests; browser test |
| Public site separated from the owner workspace (public nav: Report a barrier, Reports, How it works) | Browser test as visitor and as owner |
| Product home page: who it is for, how it works, why a person checks, what sharing means, current scope | Browser test; axe check |
| Removal or correction request link on every report | Browser test |
| Results hide headline percentages below 20 reviewed photos | Manual check |
| Needs for mobility, vision, hearing, cognitive and other access; chosen on **My needs**, stored only in the browser, editable and removable | Unit tests; browser test |
| Barrier categories for several needs (tactile guidance, hard-to-detect obstacles, crossings, signage) with "may affect" labels | Unit tests; mocked API test; browser test |
| Community reports filtered by need and by distance from a place or the visitor's location | Browser test |
| IIT (ISM) Dhanbad as the configured pilot region: real OSM boundary, point-in-polygon enforcement in search, place pages and report validation; campus directory with fuzzy and initials search; campus map with boundary | Unit tests (including "NAC Auditorium" never returning Madrid); browser test |
| Task-based home page; needs-first place profiles (overview, known with source and date, unknown, recent reports, contribute); fixed provenance labels | Browser tests for the four journeys (mobility, visual, hearing, contribution); axe checks |
| Observations: visitors record a feature's state at a place, public as community reported; owner verifies with a reason or deletes | Route and unit tests; browser journey 4 |
| Reports carry the affected area and the day seen; community list states how precisely each is located | Route tests; browser journey 4 |
| Campus directory de-duplicated, unnamed fragments hidden, repeated names disambiguated | Unit and browser tests |
| Reports linked to OpenStreetMap places; place profiles with per-attribute community data, unknowns, staleness and nearby reports | Unit tests with mocked OpenStreetMap; browser test |
| Report status with dated history; notes required for claims; duplicate links | Route tests; browser test of the full workflow |
| Owner moderation: delete reports, change status; visitors get 403 | Route tests; live check of the 403 responses |
| Voice notes with Muse Voice Transcribe 1.0 | Mocked route tests; browser test with a simulated microphone; live calls during development |
| Batch analysis, review queue, measured results with Wilson intervals | Unit tests of the metrics; browser tests |
| Markdown, JSON and PDF export | Route tests |
| Input validation: types, sizes (including streamed bodies), SVG paths, IDs | Route tests |
| API key never sent to the browser or echoed in errors | Route tests |
| Cost limits: per-visitor hourly limit, daily cap, pause switch | Unit tests; live 429 check |
| Owner key that fails closed on a deployment without one | Local run with `VERCEL=1` |
| WCAG 2.2 A/AA automated checks (axe) on every page at phone and desktop width | No violations after fixing one (scrollable tables) |
| Lint, typecheck, production build, `npm audit` | Run before every push |

## 2. Implemented, awaiting external validation

| Item | What is needed |
| --- | --- |
| Saving a report to Vercel Blob on the live site | One real save by the owner (the test suite uses local disk) |
| Measured precision, recall and evidence quality | The owner's review of the 80 web photos and their own photos |
| Rate limits and daily cap under real traffic on Vercel | They are per server instance; behaviour across instances is unmeasured |
| Screen-reader experience | Automated checks pass; a manual pass with NVDA or VoiceOver has not been done |
| Usefulness of reports to maintenance teams | Feedback from an actual campus or council team |
| The new barrier categories with the real Muse Spark model | One manual analysis of a photo with tactile paving or signage (automated tests use a mock) |
| Live place search and profiles against OpenStreetMap | A few manual searches on the live site |

## 3. Not yet implemented

- **Accounts and roles.** There is one owner key; no user accounts, reviewer or organization roles.
- **Independent verification workflow beyond the owner.** Only the project owner can mark an observation verified; there are no other verifier roles, disputes or duplicate merging.
- **Per-entrance or per-path places.** Observations name a part of a place (entrance, path, crossing...) but entrances and paths are not separate place records yet.
- **Places added by PathAble users.** Only OpenStreetMap places exist today; campus places missing from OSM (for example "NAC Auditorium") cannot be added in the app yet. The data model keeps a place's source so user-added and verified places can be introduced later.
- **Campus accessibility data.** None of the 89 campus places in OpenStreetMap carries accessibility tags yet, so their attributes all show as unknown until reports or surveys add evidence.
- **Verified place attributes.** Place pages show OpenStreetMap community data only; PathAble has no inspection workflow of its own yet.
- **Map view** and **routing** (Phase D). Reports and places are listed, not mapped; routing waits for reliable segment data.
- **Community features** (Phase E): disputes, following reports, recheck uploads by others.
- **In-app abuse reporting.** Removal and correction requests go through a pre-filled GitHub issue.
- **Automatic blurring of faces and number plates.** The app relies on the consent statement.
- **Audit log for deletions.** Status changes are recorded; deletions leave no trace.
- **Automatic duplicate detection.** Duplicates are linked by hand.
- **Database.** Reports are JSON files in Blob storage; listing reads every report, which suits hundreds, not thousands.
- **PWA and offline use, multilingual interface, notifications, video assessment.**

## Next highest-priority work

1. Complete the evaluation and publish the measured results (owner task).
2. A manual screen-reader pass, and fixes for what it finds.
3. Visitor "report a problem with this report" button feeding the owner's moderation list.
4. Face and number-plate blurring before storage, using a model whose terms allow it.
5. A database with migrations and accounts, once more than one moderator is needed.
