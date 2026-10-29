# Public-beta readiness

What must be true before PathAble AI is opened to the public beyond a hackathon demo. ✅ done and verified · ⬜ not done.

## Product

- ✅ Photo-to-report flow works end to end, including failure paths (`npm run e2e`)
- ✅ AI findings are labelled as unverified until a person reviews them
- ✅ Report statuses reflect recorded events, with notes for any claim that something happened
- ⬜ Measured precision and recall from a completed evaluation, published with their confidence ranges
- ⬜ Feedback from at least one real user group (for example wheelchair users or a campus facilities team)

## Accessibility

- ✅ Automated WCAG 2.2 A/AA checks (axe) pass on every page at phone and desktop widths
- ✅ Keyboard-only review of a photo; visible focus on every control; skip link
- ✅ Status and evidence never rely on colour alone
- ⬜ Manual screen-reader pass (NVDA on Windows, VoiceOver on iOS)
- ⬜ Testing with disabled users

## Security and privacy

- ✅ API key server-side only; secrets excluded from git and deployments
- ✅ Server-side validation of all input; size limits enforced while streaming
- ✅ Owner-only tools enforced on the server; locked when no owner key is set
- ✅ Consent before publishing; privacy page; owner deletion
- ⬜ Individual accounts and roles instead of a single shared owner key
- ⬜ Audit log for deletions and moderation
- ⬜ Face and number-plate blurring, or a decision not to publish photos
- ⬜ Abuse-report button for visitors
- ⬜ Independent security review; legal review of the privacy notice

## Operations

- ✅ Production build verified before each push; Vercel deploys from `main`
- ✅ Health check at `/api/health` (configuration and storage, no secrets)
- ✅ Per-visitor rate limits, a daily AI cap and a pause switch
- ⬜ A spending limit on the Meta API account, if the provider offers one
- ⬜ Shared (not per-instance) rate limiting, e.g. a key-value store
- ⬜ Error monitoring and alerting
- ⬜ Backups of the Blob store and a tested restore
- ⬜ A database with migrations once data outgrows JSON files

## Deployment steps

See [Deploying](../README.md#deploying) in the README: import the repository in Vercel, set `MODEL_API_KEY` and `OWNER_KEY`, connect a private Blob store, and check `/api/health`. Set `AI_DAILY_LIMIT` to match the budget and `AI_PAUSED=1` to stop AI use at any time.
