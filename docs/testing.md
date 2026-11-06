# Testing strategy

## POC verification scope

The selected topology is containerized API → PostgreSQL → direct host-vendor calls, with no queue, worker, fan-out, DLQ, or batching. The frontend is absent; no frontend/browser suite is required. Node built-in tests are selected for the infrastructure skeleton; product integration/HTTP pipeline coverage remains unconfigured.

Required later checks: all seven allowed names eligible and excluded names never forwarded, independent of stub permissiveness; normalized payload/identity/privacy cases; database commit before send; persistent unique messageId identity; identical and concurrent duplicates causing no extra vendor sends; changed-content conflicts; bounded transient retries and permanent failures; uncertain vendor acceptance; outcome-write failure; explicit recovery after restart; API-to-db service DNS; API-to-host vendor route despite the stub loopback binding; readiness and database-volume persistence. Use isolated DB data and keep vendor strict enabled. Actual setup verification is recorded below; full product checks remain pending.

## Framework selections and setup

Automated testing is required for every applicable component. design-architecture chooses frontend/backend frameworks separately after the stack, preserving established choices, and offers E2E including Playwright for suitable web projects. Absent layers and E2E deferrals need reasons. These choices block architecture acceptance when unresolved, not product-scaffold completion. setup-dev configures harnesses; separately authorized implementation adds business tests. Time pressure does not silently choose or omit tooling.

Record exact versions and helper libraries in [tech-stack.md](tech-stack.md). For CLI, mobile, or other component types, replace or extend the rows with the appropriate automated test tooling. A shared runner may cover multiple layers; identify each scope.

| Component | Selected framework and helpers | Test location under app/ | Command and working directory | Setup / execution status |
| --- | --- | --- | --- | --- |
| Frontend unit / component | Not applicable: API-only POC | Not applicable | Not applicable | No frontend implemented or planned in this slice |
| Backend infrastructure | Node built-in test runner | app/test/setup.test.mjs | make test from root; npm test from app/ optionally | Five health/config tests passed on host and pinned container Node |
| End-to-end journeys | TBD | TBD | TBD | Planned; select framework or record deferral / not-applicable reason |

setup-dev includes test dependencies/configuration and noninteractive harness commands; a health-only skeleton may include a real health test. Keep product-journey checks planned until application implementation exists. Keep tests/configuration under app/ and preserve existing suites. The root Makefile exposes test-frontend/test-backend/test-e2e; configure make test for runnable suites and document pending exclusions. Run make from the root; recipes execute tools from app/ or component directories. Document prerequisites, startup, fixtures, and cleanup. Mirror targets in README, distinguishing harness readiness, planned checks, and actual results.

## Required coverage

- Map every implemented PRD acceptance criterion to an automated test or a documented manual check.
- Cover critical business rules, permission boundaries, input validation, edge cases, and meaningful failure paths.
- Add a regression test for reproducible behavioral bugs when feasible.
- Verify changed API contracts on both provider and consumer sides.
- Verify schema constraints/migrations against [data-model.md](data-model.md). When asynchronous work is selected, cover relevant producer/consumer contracts, duplicates/idempotency, retry, and terminal-failure paths from [infrastructure.md](infrastructure.md) using isolated resources.
- Select approved tooling in tech-stack.md during design-architecture. Set numerical coverage targets only when useful or required; percentages supplement behavioral evidence.

## Test layers

| Layer | Scope | Dependencies | Required focus |
| --- | --- | --- | --- |
| Unit | A function, domain rule, or isolated component | Stub external boundaries; no network or real database | Logic branches, invariants, validation, and edge cases |
| Integration | Collaborating modules, API handlers, persistence, and adapters | Use isolated real database/services where practical; mock external third-party APIs | Serialization, authorization, queries, constraints, migrations, transactions, and error translation |
| End-to-end | Critical user journeys through the running application | Controlled test environment and test accounts | Essential acceptance criteria and cross-layer behavior |

## External API mocking standards

1. Mock at the network or adapter boundary, not inside domain logic.
2. Derive sanitized fixtures from approved provider contracts; keep first-party mocks aligned with api-contracts.md.
3. Cover success, malformed responses, permission failures, rate limits, timeouts, and transient failures as relevant.
4. Block unexpected outbound requests in automated tests. Never call production services or use production credentials.
5. Make clocks, randomness, retry timing, and identifiers deterministic where needed.
6. Keep any live provider checks separate and explicitly configured against a sandbox; mocks alone do not prove provider compatibility.

## Isolation and execution

- Give tests independent data and clean up resources; avoid order dependence.
- Run linting, type checks, affected unit tests, and relevant integration tests for code changes.
- Run critical end-to-end journeys for changes affecting those flows.
- Record exact commands, outcomes, and skipped checks. Do not report unrun tests as passing.
- Verify representative tests are discovered and executed; empty suites and placeholder assertions do not verify behavior.
- Configure CI commands and thresholds after selecting the stack; document executable commands in README.md.

## Runnable infrastructure checks

- make config: validate Compose quietly, after preserving/initializing ignored local credentials.
- make build: compile TypeScript and build the non-root API runtime image.
- make test: Docker test target uses the pinned Node image and runs five real HTTP/configuration tests. Covers liveness during DB failure, readiness failure/recovery and redaction, unknown-route error shape, required config/port validation, and safe vendor-origin parsing.
- Optional host workflow from app/: npm ci, npm run typecheck, npm test. Host Node must satisfy package.json engines; use .nvmrc for the pinned runtime.
- After make up: GET /health and GET /ready, inspect the application DB role, verify PostgreSQL restart/volume persistence, and make vendor-check with the strict host vendor running. The vendor probe is read-only.

Source-event schema tests now verify row identity, unique message_id, types and constraints against PostgreSQL. Incoming ingestion/duplicate-dispatch, normalization, delivery, and replay features and their tests remain unimplemented. Skeleton readiness proves a real DB SELECT 1 only, not a future schema. The container build/test and runtime observations are recorded in .ai/project.json and the local handoff summary after execution.

Observed setup results: both Compose services healthy; app DB role is non-superuser and API UID is 1000; fresh-volume SQL bootstrap passed in a disposable project; strict vendor GET /_stats succeeded from api; DB stop produced /ready 503 while /health stayed 200; restart restored readiness with unchanged database cluster identity. Base and Linux-override Compose configurations validate; Linux runtime networking itself has not been exercised. Main services remain running; only the isolated bootstrap-check project/volume was removed.

Contract examples: parse and type-check [vendor-request.example.json](vendor-request.example.json) against the supplied descriptive [contract snapshot](vendor-payload-contract.json). This is a static consistency check, not evidence that relay filtering or delivery exists. Later runtime tests must also cover unknown fields, omitted versus null optional fields, seconds versus millisecond timestamps, customer-ID mapping, and repeated messageIds.

## Source-event schema regression

Run make db-migrate after the DB is up, then make test-db. Migration SQL runs through psql as the application role. The schema-test Docker target and compose.test.yaml run the existing pg dependency in a disposable container, with the main database and API kept running. All test data is synthetic and rolled back in a finally block. No vendor requests are made.

Actual result: 24 checks passed first in an isolated database and then on the migrated POC database. Covers generated/distinct UUIDs; unique message_id and primary key; nonblank/non-null source identifiers and names; numeric/UUID/anonymous users; nullable receipt time/objects; JSONB and timestamp round trips; invalid JSON object shapes; infinite timestamps. The migration re-run was a no-op with one recorded version; the isolated DB was dropped and no test rows remain. The API /ready remained healthy. These tests do not verify full duplicate-dispatch prevention or replay.
