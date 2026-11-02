# Meta API credit usage log

Personal spending limit: ₹0. Every live Meta request made during development is recorded here. Automated tests use a local mock and are not logged, because they reach no Meta service.

## Status: no live requests made

Live testing is blocked until the owner confirms the items below, because the rules say to stop if the promotional balance or billing safety cannot be established.

| Needed | Why | Status |
| --- | --- | --- |
| Promotional credit balance from the Meta Usage and Billing page | A displayed balance may not be all promotional | Not available to Claude: the page needs the owner's sign-in |
| Which models the credits cover (Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe 1.0) | Ineligible calls could bill personally | Not confirmed |
| Whether usage can go past the credits, and how it is stopped | Must never reach personal billing | Not confirmed |
| A key available to the test run | The key is held on Vercel, and pulling it is blocked in this environment | Not available |

## Live requests

| Date | Model | Purpose | Input | Tokens or units | Cost | Balance before | Balance after |
| --- | --- | --- | --- | --- | --- | --- | --- |

None.

## Plan once confirmed

Small, separate batches, checking the balance before each:

1. Muse Spark 1.3: about 10 non-identifiable campus photos covering different barrier categories.
2. SAM 3.1: the findings from those same photos, no repeat analysis.
3. Muse Voice Transcribe 1.0: 3 to 5 short recordings of field notes, read by the owner.

No retries beyond one for a clear transient failure, and no unbounded loops. Stop before the confirmed balance could be exceeded.
