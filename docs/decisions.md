# Starting agreement and decisions

Status: product baseline accepted by the user’s “accept” reply on 2026-11-06; init-project complete. See [prd.md](prd.md).

| Date | Decision or constraint | Provenance / status | Rationale |
| --- | --- | --- | --- |
| 2026-11-06 | Accept events, write to PostgreSQL, normalize, and forward to an API | User-supplied goal | Defines the end-to-end outcome. |
| 2026-11-06 | “Tech stack: node.js/typescript, psql.” | User, verbatim future-stage preference | Record for architecture; versions/libraries unselected. |
| 2026-11-06 | Preserve vendor.py, strict validation, and messageId | Existing README/vendor requirements | Adapt to the fixed external contract and preserve retry recognition. |
| 2026-11-06 | Initially all valid events; missing-profile events retain device attribution and omit customer ID | All-name policy superseded by later user contract; device-only policy remains accepted | Supplied seven-name allowlist now governs eligibility; vendor supports device-only attribution. Dropping unmatched profiles is an alternative policy. |
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

Topology, stack families, and container/host execution are selected. The bounded setup now pins versions, Express/pg, local configuration, and infrastructure tests in tech-stack.md. Product schema, intake API/errors, auth, delivery/recovery settings, and full-pipeline testing remain unselected. These do not block product-scaffold completion. See [tech-stack.md](tech-stack.md), [infrastructure.md](infrastructure.md), [data-model.md](data-model.md), [api-contracts.md](api-contracts.md), and [testing.md](testing.md) for owning-stage placeholders. No later phase is complete; architecture is in progress, and data/event contracts remain unstarted; bounded setup is in progress.

## Explicit bounded setup request — 2026-11-06

The user requested Compose containers, selected Express for Node.js, and required both app code and Compose under app/. Implemented only that infrastructure slice plus health/readiness probes, startup config validation, a non-superuser DB role, and a read-only host-vendor probe. Selected exact versions are in tech-stack.md and package-lock.json. Product schema, event API, deduplication, retry/recovery mechanisms, and full design-phase acceptance remain pending. This is explicit authorization for the limited setup, not evidence that all design dependencies or the complete setup-dev phase are accepted.

## Supplied vendor contract — 2026-11-06

Recorded the user's contract verbatim as vendor-payload-contract.json and purchase example as vendor-request.example.json, linked from api-contracts.md. The seven allowed names supersede the prior all-event-names policy; source types are not separately filtered. messageId is optional at the destination but remains required for relay-side durable deduplication. The example is the downstream vendor request, not an approved relay intake contract. Local vendor.py does not enforce the event-name allowlist or numeric customer-ID semantics, and reports duplicate deliveries; tests must enforce the supplied rules independently. No stub/runtime changes or event sends were made for this contract update.

## Reviewed source-event schema — 2026-11-06

The user requested schema work, paused for field review, then supplied “We need to add a uuid for the table; the rest looks fine.” Implemented the reviewed source fields and separate UUID id, retaining message_id as unique text. SQL naming/type/nullability choices and the source-only scope are documented in data-model.md; the incoming HTTP contract is still not selected. properties/context are object-constrained JSONB, received_at/user_id/objects permit absence, and occurrence time is required/finite. No traits/contact column, delivery-state table, profile table, or raw envelope was added. Versioned psql SQL is applied explicitly with a migration journal/advisory lock. Applied after 24 real PostgreSQL checks in an isolated database; the same checks passed on the POC schema, with test data rolled back. Source schema implementation does not establish end-to-end dispatch deduplication or full data-phase acceptance.
