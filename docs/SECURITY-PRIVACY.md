# Security and privacy

This describes what PathAble AI protects against, how, and what it does not yet do. It is an engineering summary, not a legal assessment; no formal security audit or privacy review has been carried out.

## Data the app handles

| Data | Where it goes | Kept |
| --- | --- | --- |
| Photo (re-encoded in the browser: ≤1600 px JPEG, EXIF/GPS removed) | Server, then Meta Model API (analysis, segmentation) | Only if a report is saved |
| AI findings and outlines | Browser; saved with the report | With the report |
| Review decisions, notes, missed barriers | Saved with the report | With the report |
| Location | Only if typed or "Use my current location" is pressed | With the report |
| Voice recording | Server, then Meta Model API (transcription) | Never stored; only the text kept in a note |
| Consent time, status history | Saved with the report | With the report |
| Observation about a place feature (feature, finding, area, description, day seen, optional photo, consent time) | Server storage, public on the place page | Until the owner deletes it |
| Client IP address | Server memory, for rate limiting | Up to an hour, never written to storage |
| Owner cookie | Owner's browser only (SHA-256 digest of the key, HttpOnly, SameSite=Lax, Secure on HTTPS) | 30 days |

Shared reports are public by design and listed on the Reports page; the box shown before sharing lists exactly what becomes public, and every report page has a link to request removal or correction. There are no user accounts, analytics, advertising or tracking.

## Protections

**Secrets**
- The Meta API key is read only in server modules (`server-only`). Tests check that it never appears in responses or error messages.
- `.env.local` and `.env*` files are git-ignored and excluded from Vercel uploads (`.vercelignore`); `.env.example` holds placeholders only.
- On Vercel, the API key and owner key are stored as sensitive environment variables.

**Input validation**
- Images: JPEG, PNG or WebP data URLs only, at most 8 MB; request bodies are size-checked while streaming, so a missing or false Content-Length cannot bypass the limit.
- Voice notes: WAV header checked (mono, 16-bit PCM, 16 or 24 kHz), 0.3–60 s.
- Reports: every field is re-validated on the server for type, range and length; review completeness and consent are enforced server-side; SVG outlines must match `^[MLZ0-9 .-]*$`, so no markup can be injected.
- Model output: schema-constrained by the API, then validated with Zod.
- Storage IDs must be UUIDs, so paths cannot escape the data folder.

**Authorization**
- Batch analysis, the review queue, status changes and deletion require the owner key, checked on the server for every request; hidden buttons are not relied on.
- A Vercel deployment without `OWNER_KEY` keeps these tools locked.
- Owner sign-in attempts are rate-limited.

**Abuse and cost**
- Per-visitor hourly limits on analysis, segmentation and transcription.
- A daily cap on all AI calls (`AI_DAILY_LIMIT`, default 300 on a deployment) and a pause switch (`AI_PAUSED=1`).
- No automatic retries of model calls; every call has a deadline inside the 60-second route limit.

**Privacy by design**
- Metadata, including GPS, is stripped before upload; location is never added automatically.
- Consent is required before a report is saved and published, and its time is recorded.
- No facial recognition or identification of individuals.
- The owner can delete any report; the [privacy page](../app/privacy/page.tsx) explains how to request removal.

## Known limitations

- **Single owner.** One shared key; no individual accounts, roles or per-person audit trail.
- **In-memory limits.** Rate limits and the daily cap are counted per server instance, so they bound cost rather than enforce an exact total.
- **No automatic blurring.** Faces and number plates are not detected or blurred; the app relies on the consent statement and owner moderation.
- **Deletion leaves no audit record**, and removal requests go through public GitHub issues.
- **Server logs** may include error details from the Meta API (never the API key or photos); Vercel keeps them under its own retention.
- **Third-party processing.** Photos and recordings sent to the Meta Model API are handled under Meta's terms; this project does not control that retention.
- **No CSRF tokens.** Owner actions rely on the SameSite=Lax cookie and JSON requests; this is adequate for a single-owner demo but should be revisited with accounts.
- **Public listing.** Every saved report is public; there is no private-report option.

## Reporting a security problem

Open a GitHub issue without exploit details and ask for a private contact, or contact the repository owner through their GitHub profile.
