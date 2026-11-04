# Demo master plan

The three-minute video for the Meta Global AI Developer Hackathon 2026 (Indie track).

| File | Use it for |
| --- | --- |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | What you say, word for word (369 words) |
| [DEMO_SHOTLIST.md](DEMO_SHOTLIST.md) | What you click, second by second |
| [DEMO_RECORDING_SETUP.md](DEMO_RECORDING_SETUP.md) | Windows recording and export settings |
| [DEMO_QA_CHECKLIST.md](DEMO_QA_CHECKLIST.md) | Checks before recording and before submitting |
| [DEMO_BACKUP_PLAN.md](DEMO_BACKUP_PLAN.md) | What to do when something fails |

## The one thing judges should remember

*This is not an image analyser. It is place knowledge for different disabilities: AI suggests, a person decides, and every detail says where it came from.*

Judges named simple image analysers as an anti-project, so AI gets **45 seconds out of 180**. The rest shows what is around it: needs, place profiles, honest unknowns, moderation, and the loop back to the place.

## Story

Problem (0:00) → what it is (0:20) → personal discovery (0:42) → Meta AI with a person in charge (1:15) → trust and the loop back to the place (2:00) → close (2:35).

## What has been checked as working (Nov 4, 2026)

| Part | State | How it was checked |
| --- | --- | --- |
| Home, needs chips, campus search, Central Library profile | Works live | Read from the live site in a browser today |
| Unknown details on the profile | Live data: all 22 unknown, 0 reports for Central Library | Live page text |
| Report flow, Spark → SAM → review → share | Works against the mock Meta server in 19 browser tests | `npm run e2e` |
| Moderation, then the barrier on the place page | Works in tests (journey 4) | `npm run e2e` |
| Live Muse Spark / SAM 3.1 / Muse Voice calls | **Not tested live.** The code is in production, but no live call has been made while the promotional balance is unconfirmed | `CREDIT_USAGE_LOG.md` |
| Illustrative demo `/demo/mobility` | Works live, sends nothing, clearly labelled | e2e test 15 and the live page |

**Before recording, confirm the Meta promotional balance** in your Meta developer dashboard, and that usage cannot be charged to you. Then run the flow **once** on the live site as a rehearsal (about 2 calls). If that is not possible, use backup B or C in [DEMO_BACKUP_PLAN.md](DEMO_BACKUP_PLAN.md).

## Which version of the site

Production (`main`, 529a70e) has the redesign. The `redesign` branch (`f9e114b`) also stops the place page repeating details and pages the explore list 20 at a time. Neither change affects the shots, so recording on production is fine. Deploying `f9e114b` first is optional and needs your go-ahead.

## Hackathon originality

- Everything shown was built during the event: the first commit is 2026-10-29, the window is Oct 26 – Nov 4, and there is no earlier code base. See [HACKATHON_CONTRIBUTIONS.md](../../HACKATHON_CONTRIBUTIONS.md). You can say "built during this hackathon" truthfully.
- **Check yourself:** the official Indie-track rules and submission form are only visible to registered participants and have not been read here. Before submitting, check the video length limit, hosting (YouTube or other), whether the repository must be public, and whether a licence is required. Nothing in this plan assumes the Startup track's existing-code exception.
- Do not claim campus surveys, user testing with disabled people, community use or model accuracy. None has happened yet.

## Meta models, in plain words

- **Muse Spark 1.3** (multimodal reasoning). It looks at the photo and returns a structured list of possible barriers. For each one: what is visible, why it may matter, how sure it is, what the photo cannot show, and a short phrase naming the object. The app checks the reply against a strict schema and drops anything malformed.
- **SAM 3.1** (segmentation). It takes that phrase ("electric scooter") and outlines the matching object in the photo. The app keeps outlines that fall inside the area Spark pointed to, and labels the rest *approximate*. That turns "there may be an obstruction" into "this object, here".
- **Muse Voice Transcribe 1.0** (speech to text). It turns a spoken note into text, primed with accessibility words like *tactile paving*. The person edits it before saving.
- **Together:** Spark says *what might be wrong*, SAM shows *where*, voice lets a person add *what they know*, and the person's decision is the only thing that turns it into a report. All three integrations were written during the hackathon.

## Presenting

- **Voice-over, no face camera.** Three minutes is short, and the screen is the evidence. Put your name and IIT (ISM) Dhanbad in one sentence (it's in the script). A face adds nothing the judges score.
- **Tone:** you're showing a friend something you built and care about. Calm and specific, not salesy.
- **Pace:** about 125 words a minute. Slow down on the lines marked *(slower)*; they carry the ideas.
- **Don't memorise word for word.** Learn the six section openings and the closing line exactly. For the rest, know the point of each line and say it naturally. Read the script aloud three times, then do two run-throughs while clicking.
- **Fillers:** "um", "so" and "basically" come from rushing into the next sentence. At every `/`, close your mouth and breathe instead. Silence sounds confident on a recording.
- **Don't read the screen.** Say what it *means* ("every one says unknown: that's the honest answer"), not what it says.
- **Slow loading:** keep talking. The Spark paragraph is written to cover the wait. If it runs over 8 s, cut it in editing and add a "sped up" label.
- **Mistakes:** stop, pause two seconds, and say the sentence again from the beginning. Cut the slip in editing. Don't restart the whole take for one sentence.

### Pronunciation

| Word | Say |
| --- | --- |
| PathAble AI | "PATH-able A-I". Stress *path*, like "capable" |
| Muse Spark | "MYOOZ spark" |
| SAM 3.1 | "SAM three-point-one" (a name, not S-A-M) |
| Muse Voice Transcribe | "MYOOZ voice tran-SCRIBE" |
| IIT (ISM) Dhanbad | "I-I-T, I-S-M, DHAN-bad" |
| tactile paving | "TAK-tile PAY-ving" |
| wayfinding | "WAY-finding" |
