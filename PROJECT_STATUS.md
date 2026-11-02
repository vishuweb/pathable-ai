# Project status

Updated at each milestone. Plan: [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md). Decisions: [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). Live API use: [CREDIT_USAGE_LOG.md](CREDIT_USAGE_LOG.md).

## Milestones

| Phase | State | Notes |
| --- | --- | --- |
| 1 Security | Done, deployed on `main` | No open Critical or High findings at the last review |
| 2 Connected data | Done, on branch, not deployed | |
| 3 Field survey | Done, on branch, not deployed | The tools are built. No campus place has been surveyed yet |
| 4 Product redesign | Current | |
| 5 Meta integration | Pending | Live tests blocked, see below |
| 6 Discovery | Pending | |
| 7 Evaluation | Pending | |
| 8 Performance and CI | Pending | |
| 9 Final acceptance | Pending | |

## Blockers needing the owner

1. **Meta credits.** Confirm the promotional balance, which models it covers, and that usage cannot reach personal billing. No live Meta call has been made until then.
2. **Production deployment.** `main` is at Phase 1.1 (`f024b4a`). Merging the development branch deploys it; that is the owner's decision.
3. **Field surveys.** Only people on campus can record them. See [docs/FIELD-SURVEY.md](docs/FIELD-SURVEY.md).

## Latest verified results

Branch `phase3-field-survey`. Lint clean, typecheck clean, 150 unit and API tests pass, 13 browser tests pass, production build compiles. All with mocked Meta and map services. Nothing here has been verified on the live site.

## Next action

Phase 4: check the home page and preferences against each kind of need, add what is missing, and add a cognitive journey test.
