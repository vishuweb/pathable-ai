# Evaluation plan

PathAble AI measures itself with the same review screen people use. Every human verdict is a label, so evaluation needs no separate annotation tool.

## Questions

1. **Precision:** of the barriers the AI reports, how many are real?
2. **Recall:** of the barriers a person can see in the photo, how many does the AI find?
3. **Evidence quality:** does the highlighted area actually show the barrier?
4. **False alarms:** how often does the AI report something on a photo with no barrier?
5. **Effort:** how long does a person need to verify a photo, compared with the AI's own time?

## Data

| Set | Size | Source | Why |
| --- | --- | --- | --- |
| Web | 80 photos | Wikimedia Commons (CC BY, CC BY-SA, public domain), picked by hand: 54 likely to show a barrier, 26 likely clear | Broad variety of streets, entrances and obstacles; includes clear scenes so false alarms are measured |
| Own | Target 15–30 photos | Taken by the author on local streets | Photos not chosen *because* something was wrong; closer to real use |

The photos are kept out of the repository (`data/` is git-ignored); the web photos' licences and authors are recorded in a local `CREDITS.md` next to them.

## Procedure

1. **Batch analyze** each set once (`/batch`), marking it *web* or *own*. Each photo runs through the full pipeline (Muse Spark, then SAM 3.1) and joins the review queue.
2. **Review** every photo in the queue (`/review`), without changing the model or prompt in between:
   - For each AI finding: *Yes, real barrier*, *Real, wrong category* (choose the right one), or *Not a barrier*.
   - For each real barrier: *Does the highlight show it?* Yes, partly, or no.
   - Add every barrier the AI missed, with its category.
3. Read the numbers from `/results` (or `/api/results` as JSON). Nothing is entered by hand.

## Labelling guide

Apply the same rules to every photo, and do not change them part-way through. Labels must come from a person looking at the photo; AI-generated labels would make the evaluation circular.

| Question | Answer | When |
| --- | --- | --- |
| Is this a real barrier? | **Yes, real barrier** | The photo shows the condition the finding describes, and it would plausibly hinder a wheelchair user, someone with a walker or pram, or someone with low vision. You would want it checked on site. |
| | **Real, wrong category** | As above, but another category fits better. Pick the one a maintenance team would file it under. |
| | **Not a barrier** | The condition is not visible; it is visible but leaves an obviously clear route (for example a bin well off the path); or the finding is speculation, not observation. |
| Does the highlight show it? | **Yes** | The outline or box covers the object or area causing the problem, without mostly covering something else. |
| | **Partly** | It covers part of the cause, or the cause plus a lot of unrelated area, or only an approximate box is shown. |
| | **No** | It points at the wrong object or area. |
| Did the AI miss anything? | Add it | A barrier you would report that no finding covers. Do not add things you cannot see clearly. |

**Uncertain cases.** If the photo cannot show whether something is a barrier (for example the remaining width is impossible to judge), answer *Not a barrier* only if nothing points to a problem; otherwise answer *Yes* and write "uncertain: …" in the note. Count such notes at the end and report them.

**Time.** About 30–60 seconds per photo; 80 photos take roughly an hour. Stopping and resuming is fine: the queue keeps the remaining photos.

## Measures

| Measure | Definition |
| --- | --- |
| Precision | (confirmed + corrected) ÷ all AI findings |
| Recall | (confirmed + corrected) ÷ (confirmed + corrected + missed) |
| Category accuracy | confirmed ÷ (confirmed + corrected) |
| Highlight correct | real barriers rated "yes" ÷ real barriers rated |
| Highlight useful | rated "yes" or "partly" ÷ real barriers rated |
| Outlined by SAM 3.1 | findings with a segmented outline ÷ all findings |
| False-alarm rate | photos with no verified barrier where the AI reported something ÷ photos with no verified barrier |
| Review time | median seconds from results appearing to the report being saved |

Every rate is shown with a 95% Wilson score interval, which stays honest for small samples and rates near 0% or 100%. Results are split by set (web or own) and by barrier type. Single uploads are left out once a batch has been reviewed, and always on the public deployment, where they come from visitors trying the demo.

## Threats to validity

- **One reviewer**, who is also the author. There is no inter-rater agreement measure.
- **Selected, not sampled** photos; web photos are often taken *because* something is wrong, which may inflate precision.
- **Recall depends on the reviewer** noticing what the AI missed.
- **Photo-only judgement:** neither the AI nor the reviewer can measure widths or slopes, so "real barrier" means "a visible condition worth checking on site".
- **Small sample:** the confidence ranges will be wide; the results page shows them next to every number.

## Results

Pending: the review of both sets has not been completed yet. The table will be filled in from `/api/results`. No numbers are reported here until they come from completed reviews.
