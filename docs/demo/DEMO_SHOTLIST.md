# Shot list

Every label below is copied from the app's code. Paths are on https://pathable-ai.vercel.app.

## Open before you press record

| Window | Where | State |
| --- | --- | --- |
| A, **private** window, 1600×1000, 110% zoom | `/` | Signed out. A private window has no saved needs, so the chips start empty. You report from here as a visitor, and the report waits for approval |
| B, normal window | `/owner/moderation` | Signed in with the owner key. **Do not report from B**: owner reports are approved at once, which skips moderation |
| C, tab in window A (backup) | `/demo/mobility` | Only if live AI is not used (see the backup plan) |
| Files | Desktop | `demo-entrance.jpg` (your own campus photo, no people or number plates), or use the built-in sample |

## Shots

| Time | What to show | Exact action | What you say (short form) | What judges should notice |
| --- | --- | --- | --- | --- |
| 0:00–0:20 | Home, top | Hold still, cursor resting off the text | "Will this place work for me?" | Clean product, one clear headline, a real campus outline |
| 0:20–0:42 | Home, scroll | Scroll slowly once to **What matters to you?**, then to **How it works** | Who it's for; five kinds of need; IIT (ISM) Dhanbad | Multi-disability from the first screen |
| 0:42–0:50 | Needs chips | On the home page, click **Mobility**, then **Wayfinding** (they turn dark) | "First, my needs. They stay in my browser." | Preferences are one tap, private |
| 0:50–0:58 | Search | Scroll back up, click **Where do you want to go?**, type `library`, press **Search**, click **Central Library** | "Search only ever returns places inside the campus boundary." | Campus-scoped search |
| 0:58–1:15 | Place profile | Let the page settle. Point the cursor slowly at **For your needs: Mobility, Cognitive**, then down the **Unknown** labels, then at **Details recorded 0 of 22** on the right | "Every one of them says unknown… no score, on purpose." | Honesty: unknown is shown, not hidden |
| 1:15–1:22 | Report, place step | Click **Report a barrier here** (top of the profile). The place is filled in: **Reporting at Central Library**. Choose an area if asked, then **Continue to the photo** | "Now I report a barrier here, with a photo." | The report is tied to a real place |
| 1:22–1:40 | Photo + AI | Click the file picker and choose `demo-entrance.jpg`, *or* under **No photo handy? Try a sample:** click **Fallen scooter on a sidewalk**. Status reads **Analyzing the scene with Muse Spark…**, then **Locating visual evidence with SAM 3.1…** | Muse Spark explanation | Two Meta models, named on screen as they run |
| 1:40–1:50 | Evidence | On the first finding, click **Focus this finding on photo**. Hover the outline | "That's the scooter, across the ramp." | The outline shows *which* object, not only a sentence |
| 1:50–2:00 | Human review | First finding: **Yes, real barrier**; label changes from **Suggested by AI** to **Confirmed by reporter**. Second (if any): **Not a barrier** | "Nothing becomes a report until I decide." | The core idea: AI suggests, a person decides |
| 2:00–2:10 | Privacy + share | Scroll to **Sharing makes this report public**, tick it, click **Share report publicly**, then **Open the report** | "Linked to this place… location data removed." | Consent, status *Submitted*, waiting for approval |
| 2:10–2:22 | Moderation (window B) | Switch to B, reload. Tick **I checked … for faces, number plates and personal details.**, click **Approve**. Message: **Approved. It is now public.** | "I check it for faces and personal details, then approve it." | Approval is separate from verification |
| 2:22–2:35 | Updated place | Back in A, open the Central Library page again (browser back to the profile, then reload). Point at the barrier under **Reported barriers** and its **Confirmed by reporter** label | "Three different things, and PathAble never blurs them." | The loop closes: the photo is now place knowledge |
| 2:35–3:00 | Close | Scroll to the side summary (**Open barrier reports 1**), then click the logo to return home. Hold | Close and tagline | Place intelligence, not an image analyser |

## Avoid

- Waiting on screen. If analysis takes more than about 8 s, keep talking, or cut it and show a small "sped up" label.
- Opening `/owner` in window A. It would sign you in there as well.
- Showing the address bar with the owner key, the Vercel dashboard, or a terminal.

## After recording

Delete the demo report if you don't want it public: open it in window B and click **Delete report**.
