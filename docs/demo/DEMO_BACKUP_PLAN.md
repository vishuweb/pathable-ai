# Backup plan

Decide **before** recording which plan you're using. Never present stored or drawn output as a live model call.

## A. Live (preferred, only with a confirmed promotional balance)

Follow the shot list. Each take makes about 2 calls (Spark and SAM), plus 1 if you dictate.

## B. Live site without AI

Use this if analysis fails during a take, or if the balance isn't confirmed.

- When analysis fails, the app says so and offers **Try again** and **Continue without AI**. Click **Continue without AI**.
- Add the barrier yourself under **What barrier can you see?**, then share it. Moderation and the updated place page are still real.
- For the 45-second Meta section, either use plan C or say plainly: "The AI step is paused for this recording."

## C. Illustrative demo (no AI, nothing saved)

Open `/demo/mobility`. It shows the notice *Illustrative demo — not verified campus data* and walks through Discover → Your view → AI evidence → Verification → Contribute. The scene is drawn, the outlines are fixed samples, and the controls really work. Use the alternative paragraph in [DEMO_SCRIPT.md](DEMO_SCRIPT.md). There are three more scenarios: `/demo/visual`, `/demo/hearing` and `/demo/wayfinding`.

## When something breaks mid-take

| Problem | Do this |
| --- | --- |
| Analysis spins for more than 20 s | Keep talking, stop at the end of a sentence, switch to B or C, and cut in editing |
| "Too many requests" or the daily limit is reached | Use B or C. Don't raise the limit during the hackathon window |
| The page errors or is blank | Reload once. If it's still broken, record the rest with C and say so |
| **Approve** is disabled | Tick the "I checked … faces, number plates…" box first |
| The report isn't in the queue | It was sent while signed in as owner, so it was approved at once. Show it on the place page and say "as owner, it publishes directly" |
| The place page doesn't show the barrier | Reload. Only approved reports linked to the place are shown |
| You stumble on a sentence | Pause, say the sentence again, and cut the slip later |

## Last resort

`npm run ui:review` saves screenshots of every page to `ui-review/output/`. Use them only to check what a page should look like. Never show them in the video as if they were live.
