# Final acceptance

What has been shown to work, how, and what has not. Every journey below runs in a real browser against the real application in `e2e/core-flow.e2e.ts`, on a temporary data folder. The Meta API, place search and OpenStreetMap are local mocks, so **none of this shows how the real models behave or how the live site behaves**.

| Journey | Test | Covers |
| --- | --- | --- |
| Mobility user | journey 1, journey 4 | Chooses mobility needs, finds Central Library from the home page, sees ramps, entrances, steps and toilets first, unknowns named, reports a barrier |
| Blind or low-vision user | journey 2 | Tactile guidance, obstacles, lighting and signs first, all shown as unknown rather than assumed |
| Deaf or hard-of-hearing user | journey 3 | Visual alarms, hearing loop and communication first, with no assumptions |
| Cognitive and wayfinding user | journey, wayfinding | Signs, directions and landmarks first; everything else still on the page |
| Contributor | contributor; journey 4 | Exact position kept apart from the place's, pending until approved, then on the correct profile |
| Disagreement and verification | journey 5 | Both views shown; verification refused without a reason; an update settles it and keeps the history |
| Owner and reviewer | field survey A to F; invited reviewer | Survey on a phone-sized screen, save and resume, one spot only, reviewer approval and check, public page, coverage |
| Reporting when AI is down | report without AI | Clear error, retry, and a way to continue that attributes nothing to AI |
| Demo | demo | Four labelled scenarios, real interactions, nothing sent, nothing in real lists |
| Responsive | responsive | Home, explorer, profile, reports, needs, report and privacy fit at 360, 390, 768 and 1440 px, with accessibility checks at 360 and 1440 |
| Discovery | discovery; campus places | Campus-only search, filters on real records, empty results that do not read as good news |

Automated WCAG 2.2 AA checks (axe-core) run on the home page, Explore places, a place profile including one with a conflict and one with surveys, the wayfinding view, a report, the demo, My needs, reports, the report flow, privacy, the surveys page, the survey form and the coverage page. Automated checks find only some accessibility problems. **No screen-reader user or disabled person has tested this product**, and that is the most important check still missing.

## Not shown

- The real Muse Spark, SAM 3.1 and Muse Voice models through this code path since these changes. See [CREDIT_USAGE_LOG.md](../CREDIT_USAGE_LOG.md).
- The redesign on the live site. It is on a development branch. Earlier phases were checked on the live site after deployment, signed out only.
- Real campus data. No place has been surveyed. The directory comes from OpenStreetMap and holds what volunteers recorded.
- Routing. It is deliberately not built, because no route-segment data exists.
- Model accuracy. The evaluation page reports what has been reviewed and states its limits. Nothing here should be quoted as certified accuracy.
