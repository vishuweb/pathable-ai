# Project status

Updated at each milestone. Plan: [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md). Decisions: [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). Live API use: [CREDIT_USAGE_LOG.md](CREDIT_USAGE_LOG.md). Acceptance: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Milestones

| Phase | State | Notes |
| --- | --- | --- |
| 1 Security | Done, deployed on `main` | No open Critical or High findings at the last review. Rate limits are soft, as documented |
| 2 Connected data | Done, deployed | |
| 3 Field survey | Done, deployed | The tools are built. No campus place has been surveyed |
| 4 Product | Done, deployed | Automated accessibility checks pass. No disabled person has tested it |
| 5 Meta integration | Code done, deployed. Live tests blocked | Credit stop, repeat reuse, usage records, survey assistance. All tested against a mock only |
| 6 Discovery | Done, deployed | No routes, by decision: no route data exists |
| 7 Evaluation | Tools done, deployed. Independent labelling not done | Calibration, confusions and error analysis added. Needs a second person to label the same photos |
| 8 Performance and CI | Partly done, deployed | CI workflow, reports paging, campus names moved to config. Place pages still list all records on each view |
| 9 Final acceptance | Done against mocks only | See docs/ACCEPTANCE.md |

## Blockers needing the owner

1. **Meta credits.** Confirm the promotional balance, which models it covers, and that usage cannot reach personal billing. No live Meta call has been made.
2. **Owner sign-in on the live site.** Claude has no key, so signing in, the Approvals page and the survey form have not been exercised live while signed in.
3. **Field surveys.** Only people on campus can record them. See [docs/FIELD-SURVEY.md](docs/FIELD-SURVEY.md).
4. **Testing with disabled people**, and a second person labelling photos for the evaluation.

## Latest verified results

Branch `phase3-field-survey`. Lint clean, typecheck clean, 159 unit and API tests pass, 16 browser tests pass, production build compiles. All with mocked Meta and map services. Nothing here has been verified on the live site. CI passed on GitHub for commit `93af3d1` (lint, typecheck, unit and API tests, build; the browser tests run locally only).

## Deployment

`main` and production are at `7b52dbe`, authorised by the owner. Live read-only checks passed: see the final report in the session. No live Meta call has been made, on hold by the owner.

## Next action

The owner checks sign-in and starts field surveys. No new feature phase until the owner has confirmed the live deployment.
