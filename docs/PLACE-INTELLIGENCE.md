# Place intelligence

How reports and observations become a campus place's accessibility profile. The logic is in
[`lib/place-intelligence.ts`](../lib/place-intelligence.ts) and is pure, so every rule below is tested
directly (`tests/place-intelligence.test.ts`) and at the API boundary (`tests/place-profile-api.test.ts`).

## What a profile contains

| Part | Source | Notes |
| --- | --- | --- |
| Features (ramp, lift, step-free way in, tactile paving, ...) | OpenStreetMap tags and approved observations | One row per question; unknown when nothing is recorded |
| Reported barriers | Approved reports linked to the place | Scoped to the spot reported; never set a feature's state |
| Community contributions | Approved observations | Newest first, with how each relates to earlier ones |
| Freshness | Observation dates, status dates | Warnings only |

There is no score and no "accessible" label. The overview counts what is recorded and says so.

## Which place something belongs to

- A report belongs to a place only through `location.place` (OpenStreetMap type and id), which the server checks
  against the campus directory and fills with the directory's own name. Distance is **not** used: a report from a
  neighbouring building within 150 m no longer appears on this one (the earlier "nearby" list guessed).
- A report with no place stays unassociated. The owner can link it (or unlink it) on the report page; the link
  records who made it and why (`placeAssociation`). Only directory places can be linked.
- An observation belongs to the place it was made at, by id, with the same checks.

## Coordinates

| Field | Meaning |
| --- | --- |
| `location.place` | Canonical destination (OpenStreetMap id and directory name) |
| `location.placeCoordinates` | The place's own position, from the directory (set by the server) |
| `location.observationCoordinates` | Where the reporter said they were, if that is a separate spot at the place |
| `location.latitude` / `longitude` | Map position: the exact spot when known, otherwise the place's (as before) |
| Observation `latitude` / `longitude` | The place's own position |
| Observation `observationCoordinates` | The spot, kept separately, with accuracy |

A position within 5 m of the place's own is treated as the place itself. A position more than 400 m away is refused
("The location does not match the place."). 400 m is a plausibility bound, not a precision claim: the directory has
points, not outlines, and half of the 89 directory places have a neighbour within 50 m. The place link, not the
distance, decides which building a record belongs to.

## What evidence may say (the mapping)

`lib/evidence-map.ts` lists which features each barrier category can bear on, for example a blocked kerb ramp bears on
`ramp` and `kerb`; it does not touch `lift` or `step_free_entrance`. A crossing problem bears only on `kerb`, because a
photo cannot show whether a signal is audible. Each barrier and claim shows its scope in words ("Applies to one
entrance, not to every entrance at this place").

## Provenance and verification

| Label | Means | Never means |
| --- | --- | --- |
| Recorded in OpenStreetMap | Volunteers' tag | Checked by PathAble AI |
| Suggested by AI | An AI suggestion nobody reviewed | Anything else; saved reports have all been reviewed, so it only appears for legacy data |
| Community reported | A visitor's approved observation | Checked by anyone else |
| Confirmed by reporter | The reporter confirmed the AI finding in a report | Checked by anyone else |
| Independently verified | The owner recorded a status with a reason (site visit, recheck), on something they did not submit themselves | That it was approved, or that the owner submitted it |
| Resolved, with evidence | A recheck found the barrier gone, with a recorded note | That "action reported" happened |
| Outdated | Last seen more than two years ago (a warning) | Unknown, or accessible |

Approval to publish is moderation, not verification. A report marked verified without a reason shows as reporter
confirmed with a note saying so; verification by the team of its own submission shows with a note that it is not
independent. The owner API now requires a reason for "verified".

## Disagreement, duplicates and history

- **Conflicts.** Two current claims about the same feature at the same spot (or one against OpenStreetMap) that say
  different things (present / not there / there but damaged or blocked), or an observation marked as disputing another,
  are shown together as "Records disagree". Nothing is chosen. A ramp present at the entrance and absent at the toilets is
  not a conflict.
- **Responses.** A visitor can answer an observation: *I saw the same* (counted with it), *I saw something different*
  (a dispute), *It has changed since* (supersedes it; the old claim stays in an "Earlier records" list), or add
  evidence (a photo or note, not an extra vote). The server checks the target is public, at this place, about this feature.
- **Duplicates.** Observations of the same feature, spot and finding within 14 days are one claim ("3 separate reports
  of the same"), however each is worded. Every contribution stays listed. The submitter is told if theirs matched.
- **History.** Report status history, resolutions and closed duplicates are kept. A closed duplicate is not counted as open.

## Freshness policy

Explicit and warning-only. Information last seen more than two years ago is flagged "Outdated" (`STALE_AFTER_YEARS`);
an open barrier with no update for a year is flagged for a recheck (`BARRIER_RECHECK_DAYS`). Neither turns anything into
unknown, resolved or accessible.

## Public visibility and cost

Only approved items are read into a profile (`lib/moderation-store.ts`), and it is rebuilt on every request, so
deleting, rejecting or re-linking something takes effect immediately. The cost is one listing of reports and observations
per place view. Reasonable for the pilot's size; the next step if it grows is an index kept in step with writes, not a
time-based cache that could keep a removed record visible.
