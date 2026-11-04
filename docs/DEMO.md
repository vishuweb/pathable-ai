# Three-minute demo

Record on https://pathable-ai.vercel.app in a clean browser window, at phone width (about 430 px) or on a phone. The video must stay under 3:00. One journey shows the whole idea:

**My needs → campus search → personal place profile → AI-suggested barriers → SAM 3.1 evidence → a person confirms → location-linked report → owner approval → updated place profile.**

## Script

| Time | Show | Say (in your own words) |
| --- | --- | --- |
| 0:00–0:15 | Home page | *[One true line about why this matters to you.]* "Campus accessibility information is scattered, out of date or missing. PathAble AI puts it in one place, for your own needs, and is honest about what nobody knows yet." |
| 0:15–0:35 | **My needs**: choose **Mobility** and **Wayfinding** | "I choose what matters to me. It stays in my browser, and every place page puts those details first." |
| 0:35–1:00 | Home search: type `library`, then open **Central Library** | "Search covers only IIT (ISM) Dhanbad. This page leads with my details: what's recorded, where it came from, how old it is, and what is still **unknown**. There's no score, because a missing detail doesn't mean accessible." |
| 1:00–1:45 | **Report a barrier here**: area, then a photo (or **Fallen scooter on a sidewalk** under *No photo handy? Try a sample*) | "Muse Spark 1.3 suggests possible barriers, each with what it sees and what the photo can't show. SAM 3.1 outlines the evidence, so I can see exactly what it means." |
| 1:45–2:10 | Review: **Yes, real barrier** on one, **Not a barrier** on a false alarm; optionally **Dictate** a note | "Nothing is a report until a person decides. I confirm this, reject that shadow, and Muse Voice Transcribe takes my note." |
| 2:10–2:25 | Privacy box, **Share report publicly**, **Open the report** | "It's linked to this place, with GPS stripped from the photo. It stays private until it's approved." |
| 2:25–2:45 | `/owner/moderation` (already signed in), **Approve**, then the Central Library page again | "The owner approves it for publishing, which is not the same as verifying it. Now the place page shows the barrier, labelled *confirmed by reporter*, with its date." |
| 2:45–3:00 | Back on the place page | "Three Meta models and a person in the loop, for one campus first. Built during this hackathon." |

## If live AI is not available

The recording must not depend on a model call working. Pick one of these and say which one you are showing:

1. **Live.** Use this only once the Meta promotional balance has been confirmed (see `CREDIT_USAGE_LOG.md`). One take makes 2 calls (Spark and SAM), plus 1 if you dictate.
2. **No AI.** If analysis fails or `AI_PAUSED=1`, the flow offers **Continue without AI**. Add the barrier yourself, so the report, moderation and place-page steps stay real.
3. **Illustrative demo.** `/demo/mobility` walks through the same five steps with a drawn scene and fixed sample outlines, under the notice *Illustrative demo — not verified campus data*. Nothing is sent or saved. Say on camera that it is illustrative.

Never show stored or illustrative output as if it were a live model call.

## Run sheet

1. Report from a private window, which is a signed-out visitor. Sign in at `/owner` in a separate, normal window so moderation is ready. Reports sent while signed in as owner are approved at once, which would skip the moderation step.
2. Rehearse once on a local copy (`npm run dev`) rather than the live site, so no test report goes public.
3. During the take, go through the journey above in order.
4. Afterwards, on `/owner`, delete the demo report from its page if you do not want it public.

## Recording checklist

- [ ] 1080p, 30 fps, taps or cursor visible, notifications off, zoom 100–125%.
- [ ] If analysis takes 10–20 s, talk over it or cut the wait, and show an on-screen "sped up" note.
- [ ] Show the *Suggested by AI* label changing to *Confirmed by reporter*: it is the core idea.
- [ ] Under 3:00, with hand-checked captions. Upload as public or unlisted, test the link in a private window, and add it to the README and the form.
