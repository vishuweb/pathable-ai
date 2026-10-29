# Three-minute demo

Record on the live site, https://pathable-ai.vercel.app, at phone width or on a phone. Times are targets; the whole video must stay under 3:00.

## Script

| Time | Show | Say (adapt to your own words) |
| --- | --- | --- |
| 0:00–0:20 | Title card, then a real photo of a blocked footpath | *[Your own line: why this matters to you or someone you know. Keep it true and short.]* "Reporting a blocked ramp usually means a vague complaint with no evidence. PathAble AI turns a photo into a report a council can act on, and a person checks every word." |
| 0:20–0:40 | Home page → upload the photo (or a sample under **No photo handy? Try a sample**) | "I take a photo and upload it. The browser fixes the rotation and strips GPS data before anything leaves the phone." |
| 0:40–1:15 | Findings appear, then outlines | "Muse Spark reads the scene and lists *possible* barriers, each with what it sees, why it may matter, and what the photo can't show. Then SAM 3.1 outlines the evidence: here's the scooter it means. Each card keeps the AI's interpretation separate from the visible evidence, and says *Unverified* until I check it." Tap **Focus this finding on photo**. |
| 1:15–1:50 | Review controls | "Nothing is a report until a person decides. I confirm this one, correct the category on this one, and reject this false alarm. I also rate whether the highlight is right, and add a barrier the AI missed." |
| 1:50–2:10 | **Dictate** a note | "On the street, typing is hard, so I can dictate. Muse Voice Transcribe, tuned for words like *curb ramp* and *tactile paving*, writes it down for me to edit." |
| 2:10–2:30 | Save → report page → **Download report (Markdown)** | "The saved report is a maintenance request with the photo, the outlined evidence and my verdicts, ready to send." |
| 2:30–2:50 | **Results** page | "Every review is also a label. Across *[N]* reviewed photos, precision is *[x]%* and recall *[y]%*, with honest 95% ranges." *Only say numbers that are on the page.* |
| 2:50–3:00 | README or architecture diagram | "Three Meta models, a person in the loop, and no compliance claims. PathAble AI: evidence-backed, human-verified accessibility reports." |

## Recording checklist

**Before recording**
- [ ] The review of at least the web set is finished, so the Results page shows real numbers.
- [ ] Pick 1–2 demo photos in advance and test them once: one with a clear barrier and a good outline, ideally one with a false alarm to reject.
- [ ] Keep API use small: one rehearsal plus the take is about 4–8 AI calls. Check your Meta API account's billing settings first if you are unsure whether calls are free.
- [ ] Browser: clean profile, no bookmarks bar or notifications, zoom 100–125%, window about 430 px wide (or a real phone with screen recording).
- [ ] Microphone tested, quiet room. Allow microphone access for the site before recording.
- [ ] Sign out of the owner account if you don't want the owner tools in the shot.

**While recording**
- [ ] 1080p, 30 fps or more; the cursor or taps are visible.
- [ ] If analysis takes 10–20 s, keep talking over it or cut the wait in editing (say so with an on-screen "sped up" note).
- [ ] Show the *Unverified* chip changing to *Confirmed by you*: it is the core idea.

**After recording**
- [ ] Under 3:00. Add captions (YouTube auto-captions, checked by hand), since the project is about accessibility.
- [ ] Upload as **Public** or **Unlisted** on YouTube (or as the submission form requires) and test the link in a private window.
- [ ] Put the video link in the README and the submission form.
