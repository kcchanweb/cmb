# Supplied vendor contract and example

Task: incorporate the user's downstream payload contract and purchase example into project context. Recorded exact supplied content in docs/vendor-payload-contract.json and docs/vendor-request.example.json. These are a descriptive contract snapshot and example, not an executable validator or relay intake API design.

Updated api-contracts, PRD, decisions, guardrails, stack/infra references, testing/demo plans, README, AGENTS, changelog, and answer provenance. The seven-name allowlist supersedes prior all-event-names forwarding; other accepted identity/privacy/retry/deduplication rules remain. Source messageId/deviceId are still required locally despite destination optionality. Ineligible-name intake/storage semantics remain undecided; no vendor forwarding is permitted for excluded names. No runtime code, containers, fixtures, or fixed vendor changes; no event sends or vendor control requests.

Checks: parsed both JSON files, checked allowed/unique fields and names, required fields and exact types, numeric customer ID, stub millisecond bounds; vendor.validate accepted the sample in-process without running the server. A shape-valid app_open was accepted by the stub despite exclusion from the supplied allowlist, confirming the stub gap. validate.py returned zero errors with expected product-design placeholders. Application tests were not rerun for this documentation-only change.

Serial reviews: Security (sample contains supplied demonstration identifiers, no credentials; privacy rules retained); Performance (no runtime/resource changes); Logic (eligibility, optional destination versus stricter source identifiers, timestamp source, unknown fields, permanent422 and dedup semantics reconciled with actual stub); Architecture (downstream contract separated from unselected relay intake, no product implementation or phase acceptance inferred). No unresolved blocking documentation findings.

Remaining: event schema/intake design, ineligible input response/storage policy, runtime filtering/deduplication/delivery/recovery implementation and tests. Current Express health skeleton remains the only implemented API behavior.
