# Project status

Updated at each milestone. Plan: [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md). Decisions: [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). Live API use: [CREDIT_USAGE_LOG.md](CREDIT_USAGE_LOG.md). Acceptance: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Milestones

| Phase | State | Notes |
| --- | --- | --- |
| 1 Security | Done, deployed on `main` | No open Critical or High findings at the last review. Rate limits are soft, as documented |
| 2 Connected data | Done, on branch, not deployed | |
| 3 Field survey | Done, on branch, not deployed | The tools are built. No campus place has been surveyed |
| 4 Product | Done, on branch, not deployed | Automated accessibility checks pass. No disabled person has tested it |
| 5 Meta integration | Code done, on branch. Live tests blocked | Credit stop, repeat reuse, usage records, survey assistance. All tested against a mock only |
| 6 Discovery | Done, on branch, not deployed | No routes, by decision: no route data exists |
| 7 Evaluation | Tools done, on branch. Independent labelling not done | Calibration, confusions and error analysis added. Needs a second person to label the same photos |
| 8 Performance and CI | Partly done, on branch | CI workflow, reports paging, campus names moved to config. Place pages still list all records on each view |
| 9 Final acceptance | Done against mocks only | See docs/ACCEPTANCE.md |

## Blockers needing the owner

1. **Meta credits.** Confirm the promotional balance, which models it covers, and that usage cannot reach personal billing. No live Meta call has been made.
2. **Production deployment.** `main` is at Phase 1.1 (`f024b4a`). Merging the development branch deploys it, and that is the owner's decision.
3. **Field surveys.** Only people on campus can record them. See [docs/FIELD-SURVEY.md](docs/FIELD-SURVEY.md).
4. **Testing with disabled people**, and a second person labelling photos for the evaluation.

## Latest verified results

Branch `phase3-field-survey`. Lint clean, typecheck clean, 159 unit and API tests pass, 16 browser tests pass, production build compiles. All with mocked Meta and map services. Nothing here has been verified on the live site. The CI workflow has not yet been seen running on GitHub.

## Next action

Waiting on the blockers above. Without them, the remaining code work is an index for place pages if records grow, which there is no evidence of needing yet.
