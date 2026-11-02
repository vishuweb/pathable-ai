# PathAble AI master plan

Goal: a working, honest accessibility information platform for IIT (ISM) Dhanbad, for people with mobility, visual, hearing, cognitive and other access needs. Current state and results are in [PROJECT_STATUS.md](PROJECT_STATUS.md); reasoning is in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md).

Rules that hold across every phase:

- Unknown stays unknown. No place is called accessible, and there is no overall score.
- AI output is a suggestion until a person decides. Approval to publish is not verification.
- Nothing about the real campus is invented. Field data comes from people on site.
- Personal spending limit is ₹0. Routine tests are mocked. Live Meta calls follow [CREDIT_USAGE_LOG.md](CREDIT_USAGE_LOG.md).
- Development goes to a development branch. `main` deploys production and needs the owner's say-so.

| Phase | Milestone | Done when |
| --- | --- | --- |
| 1 | Security and production reliability | No open Critical or High findings; auth, moderation, photo cleaning, cross-site checks tested |
| 2 | Connected data flow | Reports and observations reach the right place by id, with provenance, conflicts and history |
| 3 | Campus dataset and field survey | Survey workspace, checklists, review, coverage dashboard, import and export working, with no invented data |
| 4 | User-centred product | Home page and preferences drive real journeys for each kind of need; WCAG 2.2 AA checks pass on main pages |
| 5 | Meta AI integration | Validation, timeouts, limits, usage tracking, dedupe and fallbacks in place; controlled live tests run once credits are confirmed |
| 6 | Personalised discovery | Campus-scoped search with categories and accessibility-aware filters; no global results; no route recommendations without route data |
| 7 | Quality and evaluation | Evaluation dashboard states dataset size and limits; calibration, review time and error analysis included |
| 8 | Performance and scale | Pagination, efficient loading, CI, region configuration without hard-coded campus names |
| 9 | Final acceptance | Every journey runs against real application behaviour; docs match the code |

Work only people can do (see the status file for the current list):

- Walking the campus and recording surveys.
- Confirming the Meta credit balance and billing safety.
- Setting production keys and authorising deployment.
- Independent labelling for the evaluation.
