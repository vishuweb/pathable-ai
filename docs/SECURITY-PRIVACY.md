# Security and privacy

This describes what PathAble AI protects against, how, and what it does not yet do. It is an engineering summary, not a legal assessment; no formal security audit or privacy review has been carried out.

## Data the app handles

| Data | Where it goes | Kept |
| --- | --- | --- |
| Photo (re-encoded in the browser, then again on the server: JPEG, EXIF/GPS and all other metadata removed) | Server, then Meta Model API (analysis, segmentation) | Only if a report is saved |
| AI findings and outlines | Browser; saved with the report | With the report |
| Review decisions, notes, missed barriers | Saved with the report | With the report |
| Location | Only if typed or "Use my current location" is pressed | With the report |
| Voice recording | Server, then Meta Model API (transcription) | Never stored; only the text kept in a note |
| Consent time, status history | Saved with the report | With the report |
| Observation about a place feature (feature, finding, area, description, day seen, optional photo, consent time) | Server storage, public on the place page | Until the owner deletes it |
| Client IP address | Server memory, for rate limiting | Up to an hour, never written to storage |
| Owner or reviewer session cookie | Browser only (signed with the key, role and expiry, HttpOnly, SameSite=Lax, Secure on HTTPS) | 7 days, enforced on the server |

Shared reports and observations start as **pending**: only the owner can see them until the owner approves them, and only approved items are public. Reports saved by the owner or a signed-in reviewer are approved at once. Public items are listed on the Reports page; the box shown before sharing lists exactly what becomes public, and every report page has a link to request removal or correction. There are no user accounts, analytics, advertising or tracking.

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
- Sessions are signed, carry a role and an expiry, and are checked on every request. Invalid or expired sessions get 401 (and the cookie is cleared), a wrong role gets 403, and a server with no keys set answers 503 instead of opening up. Only local development with no keys at all acts as the owner.
- The review queue (`GET /api/drafts`, queued photos) is limited to the owner and reviewers.
- State-changing owner and reviewer requests that a browser marks as coming from another site (`Origin` host differs from `Host`, or `Sec-Fetch-Site` is not same-origin) are refused with 403, on top of the `SameSite=Lax` cookie. Non-browser clients send neither header and carry no ambient cookie.
- Approving a submission needs a tick saying the full-size photo and every text were checked; the approvals page shows the location text, coordinates that will become public, notes and added barriers.

**Abuse and cost**
- Per-visitor hourly limits on analysis, segmentation, transcription, and on submitting reports and observations (`SUBMISSION_LIMIT_PER_HOUR`), plus a daily cap on public submissions.
- A cap on submissions waiting for approval (`MAX_PENDING_SUBMISSIONS`), counted from storage, so a flood cannot grow storage without bound.
- A daily cap on all AI calls (`AI_DAILY_LIMIT`, default 300 on a deployment) and a pause switch (`AI_PAUSED=1`).
- No automatic retries of model calls; every call has a deadline inside the 60-second route limit.

**Privacy by design**
- Metadata, including GPS, is stripped in the browser and again on the server before any photo is stored or sent to the Meta API (only JPEG, PNG and WebP are accepted, judged by what the bytes decode as); location is never added automatically.
- Photos are served `private, no-store`, so deleting or rejecting an item stops it being served at once.
- Observation places and coordinates must match the campus directory; the stored name and position are the directory's own.
- Consent is required before a report is saved and published, and its time is recorded.
- No facial recognition or identification of individuals.
- The owner can delete any report; the [privacy page](../app/privacy/page.tsx) explains how to request removal.

## Known limitations

- **Single owner.** One shared key; no individual accounts, roles or per-person audit trail.
- **Soft limits, not guarantees.** Visitors are told apart by the first `x-forwarded-for` address (trustworthy on Vercel, which sets it; spoofable on any other host). Each server instance counts separately, so the real ceiling is the limit times the number of live instances, and a cold start resets it. The pending cap is read from storage and then written later with no lock, so simultaneous requests can pass it together; filling the cap also blocks honest visitors until the owner approves or rejects. Treat the cap as protection against ordinary abuse, not against a coordinated flood.
- **In-memory limits.** Per-visitor limits and daily caps are counted per server instance, so they slow abuse rather than enforce an exact total. The pending-approval cap is counted from storage and is the firm bound.
- **No automatic blurring.** Faces and number plates are not detected or blurred; the app relies on the consent statement and owner moderation.
- **Deletion leaves no audit record**, and removal requests go through public GitHub issues.
- **Server logs** may include error details from the Meta API (never the API key or photos); Vercel keeps them under its own retention.
- **Third-party processing.** Photos and recordings sent to the Meta Model API are handled under Meta's terms; this project does not control that retention.
- **No CSRF tokens.** Owner actions rely on the SameSite=Lax cookie and JSON requests; this is adequate for a single-owner demo but should be revisited with accounts.
- **Public listing.** Every approved report is public; there is no private-report option.
- **Photos stored before Phase 1** were cleaned in the browser only; they have not been re-encoded.
- **Manual moderation only.** Approval is a human check; nothing screens uploads automatically.
- **Dev toolchain advisory.** `npm audit` reports a moderate minimatch advisory in the ESLint dev tooling; it is not part of the deployed app.

## Reporting a security problem

Open a GitHub issue without exploit details and ask for a private contact, or contact the repository owner through their GitHub profile.
