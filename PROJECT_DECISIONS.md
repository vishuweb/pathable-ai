# Decisions

Engineering decisions made while working autonomously, and why. Newest last.

## Branching

Development is stacked: `phase2-place-intelligence` is based on `main`, and `phase3-field-survey` on that. `main` is unchanged since Phase 1.1 (`f024b4a`). Merging is the owner's decision because `main` deploys production.

## Commits carry no Claude attribution

The owner's rule is that they are the only contributor. It overrides the tool's default trailer.

## Reports attach to places by id, never by distance

The earlier "nearby" list used a 150 m radius, which put neighbouring buildings' reports on the wrong page. Half of the 89 directory places have a neighbour within 50 m, so distance cannot decide this. Unlinked reports stay unlinked until the owner links one.

## 400 m plausibility bound on exact positions

The directory has points, not building outlines. 400 m rejects nonsense without pretending to be precise. The place id, not the distance, decides the association.

## Staleness is a warning with a stated policy

Two years for information, one year for an open barrier's recheck flag. Neither changes a record's state.

## Conflicts are per spot

Two claims contradict only when they are about the same spot. Observations use the coarse area; surveys use their own named spot. A survey of one entrance is not compared with an observation that says only "an entrance", because it may be another entrance. This can miss a real disagreement, and it never invents one.

## "Independently verified" means a different role with a recorded reason

A check by the role that recorded a survey is refused. Owner and reviewer are shared keys, not individuals, so the system can show a different role acted, not a different person. This is documented as a limitation.

## "verified" is not an import source

A spreadsheet cannot claim verification. Imported records arrive as submitted, keep the source they state, and never overwrite. A file with any error is refused whole, so a partial import cannot leave the owner guessing what arrived.

## Surveys are stored per record in the existing store

Four new collections in `lib/store.ts`, no database. A survey is small JSON; photos are separate records so one survey can hold several. Listing is O(n) per read, which is fine at pilot size.

## A photo counts as evidence only for lines it is ticked on

A survey photo does not support every line. Each answer cites its own photos.

## No compliance thresholds

Checklists record values and methods. No standard is applied, because none has been chosen with its source, version and applicability.

## The survey queue is a stated heuristic

It uses the owner's priority, kind of place, open reports and whether a survey exists, and shows its reasons. It does not use visit frequency, because no such data exists.

## CSV exports neutralise formulas

Cells starting with `=`, `+`, `-` or `@` are prefixed, so an exported note cannot run as a spreadsheet formula.

## Live Meta calls are not made yet

The owner asked for controlled live tests only after the Usage and Billing page confirms a promotional balance. That page needs the owner's sign-in, and the key is not in this environment. See CREDIT_USAGE_LOG.md.

## No global loading page

`app/loading.tsx` makes Next start streaming, so a hidden report answered HTTP 200 instead of 404. The browser test caught it. Pages keep their own loading states.

## Repeat AI requests reuse the first result

The same photo within an hour reuses the result and keeps its original timing, so evaluation numbers stay honest. Failures are not kept. It is per server instance, so it reduces spend rather than guaranteeing a total.

## A credit error stops AI for an hour on that instance

402, or text naming quota, billing or credit. "Too many requests" alone is treated as busy. There is no fallback to anything paid. The limit that actually protects the account is on Meta's side.

## AI on survey photos only when asked

Each one is a paid call, so it runs only from a button. It lists things to go and look at, and fills in no answer.

## "Nearby" barriers are a separate list

They are labelled as being about other places and are not counted as this place's, which keeps the Phase 2 rule that a report belongs to its own place.

## "Popular places" became "Places to start with"

There is no visit data, so popularity was an unsupported claim.

## Redesign

Layered on the existing CSS rather than rewritten: `app/design.css`, `design-home.css` and `design-pages.css` load after `globals.css`, so working behaviour and print styles stay. New tokens, no new runtime dependency.

Typeface: Atkinson Hyperlegible, from the Braille Institute, because it keeps similar letters distinct for low-vision readers. It is bundled at build time, so visitors make no request to a font service.

Maps as data: `CampusOutline` draws the real boundary and directory points as SVG, so the home page and place headers show true data, load nothing from map servers, and invent no markers.

On a phone the map loads only when asked for, which saves data and tile requests.

Loading skeletons live in route groups for the two list pages only. A `loading.tsx` above a page that can return 404 makes it answer 200.

## Reporting without AI

If analysis fails, the reporter can continue and describe the barrier themselves. The report records `analysis: none` and needs at least one barrier from the person, so nothing is attributed to AI.

## Demo is isolated by construction

Sample data lives only in `lib/demo/fixtures.ts`, is imported only by `app/demo` and `components/demo`, uses fictional "Sample" places, and is never stored. A test enforces the import boundary. It runs the real aggregation in the browser, so the demo cannot drift from the real rules. Visitor choices in the demo are not saved to their real preferences.

## Evaluation photos are labelled

The 8 web photos reviewed for the AI evaluation are public reports, but they are not campus barriers. They stay listed, with a note saying so, and the home page's recent reports and community count exclude them.

