> **Project instruction:** Apply these rules to the selected POC. Follow higher-priority system/developer instructions. Use [tech-stack.md](tech-stack.md) for stack choices, [infrastructure.md](infrastructure.md) for the direct-flow design, and [prd.md](prd.md) for accepted product behavior.

# Engineering guardrails

The user requested context-specific guardrails for an API → PostgreSQL → direct vendor POC. The rules below are the implementation baseline for that scope; concrete versions, schemas, contracts, and resource budgets must be resolved before dependent code. The larger DESIGN.md does not authorize adding its deferred components.

## Scope and code boundaries

1. Keep one Node.js/TypeScript API container and one PostgreSQL container on the same Compose bridge network; the fixed vendor stays on the host. No fan-out, SQS, Lambda, DLQ, background polling, detached delivery promises, or in-memory work queue.
2. Keep runnable code/support under app/ and Compose at app/compose.yaml. Root Makefile is the entry point; recipes execute inside app/. Preserve vendor.py and existing seed files. Pin versions/images and dependencies before setup; do not use floating latest tags.
3. Keep controllers thin. Separate runtime validation, deterministic normalization/identity resolution, application coordination, persistence, and vendor transport as small modules in one service. Avoid building an event bus or generic multi-vendor framework for one destination.
4. Use TypeScript strict checking and explicit domain types. Treat request/configuration/vendor data as unknown until validated; no blanket any, unchecked casts, or suppression of validation failures. Use guard clauses and centralized safe error handling.

## Input, normalization, and privacy

5. Enforce agreed input shape and body-size limits before persistence or side effects. Require the accepted source messageId/deviceId rules. Invalid timestamps must not fall back to receivedAt; occurrence time must become integer epoch milliseconds within the vendor's accepted range.
6. Build the vendor payload from an allowlist. Follow PRD identity mapping, omit unresolved customer IDs, preserve deviceId/messageId, and omit missing optional fields rather than sending null. Preserve object properties as event_value under the agreed policy; never move excluded traits/contact/advertising metadata into it.
7. Resolve numeric IDs without lookup and UUIDs through the profile source. Distinguish a missing mapping from an unavailable/corrupt lookup source. Do not invent customer IDs or treat an operational lookup failure as an anonymous event.
8. No raw bodies, credentials, email, phone, advertising IDs, or unsanitized vendor errors in logs or public responses. Retain only data needed for the selected persistence/recovery contract; raw-payload retention, access, and deletion must be explicitly decided. Test fixtures and task summaries must be sanitized.

## Durability and idempotency

9. Commit accepted event data before calling the vendor. If persistence fails or commit success is unknown, do not call the vendor until durable state is confirmed. Do not report completed delivery merely because an event was stored.
10. Use short DB transactions and parameterized SQL. Never hold a transaction, row lock, or checked-out transaction connection while waiting for the vendor or a retry delay. Always release connections on success, failure, cancellation, and shutdown.
11. Enforce stable messageId identity in the database, including concurrent submissions. A preflight SELECT followed by INSERT or process-local cache is not enough. Treat same-ID/different-content submissions explicitly rather than silently replacing data. Exact constraints and response semantics belong in data-model.md and api-contracts.md.
12. Once confirmed delivered, an identical duplicate must not create a fresh vendor side effect. In-progress/uncertain attempts need explicit coordination and recovery; claiming a record must not require a transaction held across HTTP. No exactly-once claim across PostgreSQL and the vendor.
13. Preserve retained data after downstream failures. If the vendor accepted but local outcome recording failed, mark/reconcile uncertainty where possible; never claim a timeout or local rollback undid the vendor's side effect. Replays keep the original messageId and agreed outbound representation.
14. Persist outcomes sufficient for explicit restart recovery. No automatic recovery is implied by rows on disk, container restarts, or the absence of queues. Agree on a queue-free recovery trigger and stale-attempt policy, then demonstrate the accepted recovery criterion before claiming completion.

## Vendor calls and bounded resource use

15. Only call the configured vendor origin/path; never use a client-supplied URL. Validate destination configuration and restrict redirects so payloads are not sent to another origin. Preserve strict vendor validation; do not edit vendor.py or turn strict off to make a demo pass.
16. Use one retry owner. Never retry unchanged vendor 400/422 failures. Retry classified transient 429/500/504/network failures with bounded attempts, exponential backoff/jitter, and an overall elapsed budget; classify additional statuses explicitly. Invalid/ambiguous responses must not be treated as delivery confirmation.
17. Set cancellation-aware per-call timeouts and an end-to-end deadline that includes DB work, HTTP, backoff, and outcome recording. Honor a valid rate-limit delay only if it fits the remaining budget. Client disconnect/cancellation does not prove downstream non-acceptance. No busy waits, infinite retry loops, or retries continuing detached after response.
18. Bound request size, DB pool/wait time, query duration, and active vendor calls. Load/validate profile fixtures outside the per-request hot path; avoid synchronous filesystem work or unbounded JSON/CPU work in handlers. Reject overload explicitly instead of buffering without a limit. These controls follow [Node.js event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop).

## Containers, network, and lifecycle

19. Use db:5432 for API-to-PostgreSQL traffic and host.docker.internal with the configured host vendor port for API-to-vendor traffic. Container localhost is neither the host nor the other container. Use service DNS, not fixed IPs, and retain outbound access on the shared network.
20. Bind the API to 0.0.0.0 inside its container, publish its chosen host port only on 127.0.0.1 by default, and do not publish PostgreSQL just for API connectivity. Keep DB credentials out of images/source/logs, use a non-superuser app role, and run the API without root/privileged mode or Docker-socket access.
21. Do not edit the seed's loopback-only vendor listener. Verify routing from inside api. If a host TCP relay is needed, scope it to local Docker access and document it; do not solve connectivity by exposing the vendor's control API publicly or changing the POC to host networking.
22. Use a named database volume; ordinary shutdown must preserve it. Readiness must prove usable database/schema access rather than just a running process. Fail startup/configuration safely within a finite deadline; drain shutdown within a limit and leave interrupted work recoverable.

## Errors, observation, and verification

23. Represent validation, identity-resolution problems, persistence failure, vendor permanent/transient failure, and uncertain delivery as distinct typed outcomes. Map them to stable safe intake responses only after contracts are agreed. Do not swallow exceptions or turn partial failure into silent success.
24. Use correlation ID, messageId, stage, bounded attempt count, duration, failure category, and outcome for sanitized observation. Distinguish API receipt, durable retention, vendor confirmation, and local outcome recording. events_received includes duplicates; reconcile with unique_message_ids and local outcomes.
25. Test normalization and identity cases, DB failure before send, vendor 400/422 versus 429/500/timeouts, duplicate/concurrent requests, vendor-success/outcome-write-failure, and restart recovery against isolated resources. Include container-to-host reachability and volume persistence checks during setup. Keep strict on; mocks or placeholder checks alone do not prove the pipeline works.
26. Review Security, Performance, Logic, then Architecture serially. Record actual checks and unresolved limits. Documentation validation does not establish application, container networking, or recovery correctness.

PostgreSQL commit and lock behavior inform the short-transaction rule: [transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html). The rules for external-call boundaries and recovery are project design decisions derived from those behaviors, not guarantees of an atomic DB/HTTP operation.
