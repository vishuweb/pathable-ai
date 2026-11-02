# Campus field survey

How the project team records what is on campus. Records start private and become public only when approved. Nothing in this system has been filled in for you: no campus place has been surveyed until someone goes there and records it.

Code: [`lib/survey-taxonomy.ts`](../lib/survey-taxonomy.ts), [`lib/survey.ts`](../lib/survey.ts), [`lib/coverage.ts`](../lib/coverage.ts), [`lib/survey-import.ts`](../lib/survey-import.ts). Tests: `tests/survey.test.ts` and the browser test "field survey, scenarios A to F".

## Data model

| Level | What | Where it lives |
| --- | --- | --- |
| Campus | Boundary and metadata | `lib/regions/*.json` |
| Place | Directory entry, identified by OpenStreetMap type and id | `lib/regions/*.places.json` |
| Sublocation | One named spot at a place: an entrance, ramp, staircase, lift, corridor, toilet, parking area, footpath, crossing or emergency exit | `sublocations` store |
| Survey | One visit with one checklist, about the whole place or one spot | `surveys` store |
| Answer | One attribute's value, unit, method, note and cited photos | inside the survey |

Attributes are typed per checklist:

- **Status**: present, absent, partly available, not working, obstructed, could not tell, does not apply.
- **Measurement**: a number with an allowed unit and range, and how it was measured.
- **Choice**: a fixed list, such as how a door opens.
- **Text**: for things that do not fit a list.

There are 13 checklists: building, entrance, ramp, stairs, lift, footpath, crossing, toilet, parking, signage, visual, hearing, and rest. Each says what to inspect, what to record, what evidence helps, and what it cannot establish.

No accessibility standard or compliance threshold is applied. Values are recorded as observed or measured.

## Workflow

| Step | Who | What happens |
| --- | --- | --- |
| Start | Owner | Choose place, spot and checklist at `/owner/survey`. A likely repeat is flagged. |
| Save | Owner | Partial is fine. Unchecked lines stay unknown. |
| Add photos | Owner | Cleaned on the server. Tick a photo on each line it actually shows. |
| Submit | Owner | "Absent" needs where you looked; a measurement needs its method. Missing lines do not block it. |
| Review | Owner or reviewer | Approve, return with a reason, or reject with a reason. |
| Check | The other role | With a recorded reason. This alone makes a record independently verified. |
| Replace | Owner | A public survey is not edited. Start a new survey that replaces it; the old one stays in the history. |
| Withdraw | Owner | Takes it off the public site, with a reason. |

## On the public place page

Approved surveys appear under "What has been checked on site": each line's value, method, note and cited photos, the source and date, what could not be told, what was not checked, and what the checklist cannot establish.

Lines that answer a profile question also appear on that feature, with the scope in words ("Applies to Entrance: North door only, not to the whole place"). Surveys of different spots do not contradict each other. Two surveys of the same spot that differ are shown as a disagreement.

Provenance stays what it is: recorded by the project team, community, reporter confirmed, OpenStreetMap or AI, as stated. Only a check by a different role upgrades it. Public data never includes private notes, the observer or the workflow history.

## Coverage dashboard

`/owner/coverage`. Each number shows its definition on the page:

| Metric | Definition |
| --- | --- |
| Directory coverage | Places in the directory; how many are missing from it is unknown |
| Survey coverage | Directory places with at least one published survey. One survey of one ramp counts, so this does not mean surveyed in full |
| Attribute coverage | Lines assessed on published surveys, out of the lines on those same checklists. "Could not tell" is not assessed |
| Independently verified coverage | Places with at least one record checked by someone other than whoever recorded it |
| With any record | Places with a published survey, or an approved linked observation or report |
| Incomplete | Of those, places with no survey where every line was assessed |
| Awaiting review | Places with a submitted survey, or a pending observation or linked report |
| Outdated | Places with a published survey or approved observation last seen over two years ago |
| Surveyed entrances, paths and crossings | Separate spots with a published survey |

There are no completion percentages. No record means unknown, not fine.

The survey queue suggests an order and shows why: the owner's priority, kind of place, open barrier reports, and whether a survey exists. Visit frequency is not used because no such data exists. The owner can mark a place "on hold" if it is not safe or practical to survey now.

## Import and export

One row per recorded attribute.

Columns: `place_osm_type`, `place_osm_id`, `checklist`, `attribute`, `value`, `unit`, `method`, `note`, `observed_on`, and optionally `sublocation_type`, `sublocation_name`, `latitude`, `longitude`, `source`, `source_reference`.

**Import** is owner only, and always previews first.

- Every row is checked: place in the directory, checklist and attribute real, value and unit valid, position inside the boundary and near the place, date valid, method present for measurements.
- `verification_state` other than "unverified", or a source of "verified", is refused.
- Rows with the same place, spot, checklist, day and source become one survey.
- A survey identical to a stored one is skipped. One that differs is kept beside it and flagged.
- A file with any error imports nothing.
- Imported surveys arrive waiting for review. Nothing existing changes.

**Export**: `?scope=public` is open to anyone, and holds approved surveys and public fields only. `?scope=full` is owner only and includes drafts and private notes. CSV cells that a spreadsheet would run as formulas are neutralised.

## Still needs people on campus

Every survey. The suggested start is the top of the queue at `/owner/coverage`. For each place, as far as is safe and practical: the main entrance, any ramp or lift, an accessible toilet, signage, and the footpath and crossing that lead to it. Measurements need a tape measure, and slope needs a measured rise and run or an inclinometer.
