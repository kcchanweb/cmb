# Changelog

## [Unreleased]

### Features

- Added project guidance, guarded Makefile hooks, and a proposed product brief with normalization and delivery acceptance criteria.
- Recorded user-supplied Node.js/TypeScript and PostgreSQL preferences; left later design and implementation unstarted.
- Preserved the exercise seed and fixed vendor, merging project status into the existing README.

- Recorded user acceptance of the product scope, normalization/identity/privacy rules, and delivery acceptance criteria; completed init-project while leaving later phases unstarted.

- Documented the user-selected direct-call POC and separate API/PostgreSQL containers with host-vendor networking; deferred queues, fan-out, workers, and DLQ.
- Added database-backed messageId deduplication, short-transaction/partial-failure rules, bounded resources/retries, and container-specific guardrails.

- Added app/compose.yaml with Express/TypeScript API and PostgreSQL containers, shared bridge network, persistent DB volume, health checks, and optional Linux host-gateway override.
- Added pinned multi-stage Docker build, non-root API, non-superuser DB role, generated ignored local credentials, five health/config tests, and root Makefile lifecycle/probe commands.

- Recorded the supplied vendor contract and purchase example; restricted forwarding requirements to seven allowed event names and documented local-stub validation gaps.

- Added and applied the reviewed source-event schema with generated UUID id, unique text message_id, timezone-aware timestamps, and object-constrained JSONB.
- Added transactional/version-guarded psql migration, root db-migrate/test-db commands, and 24 real-PostgreSQL regression checks with rolled-back synthetic data.

- Implemented source event intake/status/retry routes with strict validation, canonical deduplication, atomic persistence, frozen vendor projection, and direct bounded vendor delivery.
- Added delivery-ledger migration, token/lease recovery, read-only profile lookup, incoming OpenAPI/example,17 unit/HTTP tests and10 isolated PostgreSQL/HTTP scenarios plus strict-stub smoke.

### Fixes

- None yet.

### Breaking changes

- None yet.
