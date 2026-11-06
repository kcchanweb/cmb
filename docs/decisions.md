# Starting agreement and decisions

Status: product baseline accepted by the user’s “accept” reply on 2026-11-06; init-project complete. See [prd.md](prd.md).

| Date | Decision or constraint | Provenance / status | Rationale |
| --- | --- | --- | --- |
| 2026-11-06 | Accept events, write to PostgreSQL, normalize, and forward to an API | User-supplied goal | Defines the end-to-end outcome. |
| 2026-11-06 | “Tech stack: node.js/typescript, psql.” | User, verbatim future-stage preference | Record for architecture; versions/libraries unselected. |
| 2026-11-06 | Preserve vendor.py, strict validation, and messageId | Existing README/vendor requirements | Adapt to the fixed external contract and preserve retry recognition. |
| 2026-11-06 | All valid events; missing-profile events retain device attribution and omit customer ID | Recommended origin; accepted by user 2026-11-06 | No filter supplied; vendor supports device-only attribution. Dropping unmatched profiles is an alternative policy. |
| 2026-11-06 | Occurrence time and allowlisted outbound payload | Recommended origin; accepted by user 2026-11-06 | Preserve event semantics and exclude unrelated contact/advertising metadata. |
| 2026-11-06 | Require source messageId/deviceId; retain outcomes and recover unfinished work | Recommended origin; accepted by user 2026-11-06 | Fixtures provide stable identifiers; avoid silent loss. The vendor's permissive validity rules are an alternative. |

No time budget supplied. Keep the seed at the root; future runtime work belongs under app/ after layout reconciliation.

## POC architecture decisions — 2026-11-06

- User-selected topology: direct API → PostgreSQL → vendor calls, without fan-out, SQS, Lambda, DLQ, batching, or workers. This narrows the broader DESIGN.md for the current POC.
- User-selected execution: Node.js API and PostgreSQL in separate containers on one Compose network; fixed vendor remains on the host. Local environment kind is hybrid. Exact versions and setup details remain open.
- User-supplied delivery gate: unique event identity and no duplicate sends. Use source messageId as the durable deduplication identity; repeated/concurrent intake must not create a second delivery, and confirmed deliveries must not be resent. Same-ID/different-content is a conflict.
- Context-specific guardrails are documented in [guardrails.md](guardrails.md), as requested: commit before direct HTTP, no DB transaction held across HTTP, bounded retries/resources, sanitized outcomes, and explicit handling of uncertain delivery.
- Architecture remains in progress. Retry/recovery mechanics, exact versions/tooling, auth, resource budgets, data model, and intake contracts have not been finalized. Successful-delivery deduplication does not remove the DB/HTTP crash window or establish exactly-once transport.

## Remaining design work

Topology, stack families, and container/host execution are selected. Versions, schema, intake API/errors, auth, retry/recovery settings, test tools, and detailed environment configuration remain unselected. These do not block product-scaffold completion. See [tech-stack.md](tech-stack.md), [infrastructure.md](infrastructure.md), [data-model.md](data-model.md), [api-contracts.md](api-contracts.md), and [testing.md](testing.md) for owning-stage placeholders. No later phase is complete; architecture is in progress, and data/contracts/setup remain unstarted.
