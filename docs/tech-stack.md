> **Project instruction:** Use the selected POC boundaries below. Pin and verify exact versions before adding manifests, images, or lockfiles; unselected tooling is not permission to invent a dependency.

# Technical stack and architecture

Status: architecture in progress. The user selected Node.js/TypeScript, PostgreSQL, direct vendor calls, and separate API/database containers sharing a network. This documents those choices and context-specific guardrails; it does not claim completed architecture, schema, contracts, or runtime setup.

## Scope and provenance

The larger [DESIGN.md](../DESIGN.md) describes a future SQS/Lambda/DLQ architecture. The user's 2026-11-06 POC instruction takes precedence for this slice: API endpoint → PostgreSQL → direct vendor API call. Fan-out, queues, Lambda, DLQ, batching, and background consumers are deferred. The later instruction places the API and PostgreSQL in containers on one network, while the fixed vendor runs on the host.

The accepted [product rules](prd.md) still apply. No mobile client or frontend is being built. PostgreSQL is the database server; psql is its CLI, available for inspection inside the database container.

## Selected stack and pending pins

| Area | Selection / status | Version requirement |
| --- | --- | --- |
| API runtime | Node.js, user-selected; own container | Exact version and image digest TBD before setup |
| Language | TypeScript, user-selected; strict checking | Exact compiler version TBD before setup |
| HTTP framework and runtime validator | Unselected; isolate HTTP from application logic | Select and pin before implementation |
| Database | PostgreSQL, user-selected; own container with persistent volume | Exact server/image version and digest TBD before setup |
| Database CLI | psql in the database container | Match the selected PostgreSQL image |
| Driver, query layer, migrations | Unselected; parameterized queries, bounded connection pool, versioned migrations required | Select and pin before implementation |
| Vendor HTTP client | Unselected; cancellation, finite deadlines, bounded retries required | Select after Node.js version is pinned |
| Local orchestration | Docker Compose; API and database on one project bridge network | Record tested Docker/Compose versions at setup |
| Vendor fixture | Existing Python vendor.py on host; unchanged | Seed README requires Python 3.9+; actual interpreter recorded at setup |
| Backend unit / integration tooling | Unselected; required for normalization, delivery, persistence, failures | Select and pin before architecture acceptance |
| End-to-end tooling | HTTP API → real isolated PostgreSQL → strict local vendor; runner unselected | Select before architecture acceptance |
| Frontend and frontend tests | Not applicable: API-only POC | No browser framework or browser test runner required |
| Package manager, formatter, linter | Unselected | Select versions and commit corresponding lock/config files before setup |
| Command entry point | Root Makefile, guarded until setup | Record installed Make version at setup |

## Application responsibilities

Keep these as small logical modules in one API process; they are not separate deployable services.

- HTTP boundary: validate input and request size, correlate requests, map typed outcomes to the agreed intake contract.
- Application flow: validate and normalize, persist accepted data, await commit, call the vendor directly, persist the outcome, then respond. Request handling owns the call; no detached promise or in-memory work queue.
- Normalizer and identity resolver: deterministic transformation using the accepted PRD mapping. An absent UUID mapping permits device-only delivery; an unreadable or invalid profile source is an operational/configuration error, not an empty lookup table.
- Persistence boundary: parameterized operations, a database-enforced unique source messageId, replay-safe outcome recording, and concurrency control. Deduplicate before dispatch; repeated/concurrent intake is not a new delivery trigger, and already-confirmed deliveries must not be resent. Schema belongs in [data-model.md](data-model.md).
- Vendor adapter: allowlisted payload, fixed configured destination, strict contract, response validation, timeouts, and one retry policy. Vendor payload authority remains the seed README/vendor.py; the intake API is not yet designed.

## Deployment and layout

The local execution model is hybrid: API/database via Compose, vendor as a host process. Both containers share one bridge network; the API connects to PostgreSQL by service DNS and reaches the vendor through Docker's host route. Planned service names are api and db. See [infrastructure.md](infrastructure.md) for addresses, host-loopback caveat, and readiness checks.

Runnable application source, tests, migrations, Dockerfiles, and environment examples belong in app/; Compose belongs at app/compose.yaml. Root Makefile recipes execute from app/. Existing fixtures/vendor stay at the root unless a later layout change is explicitly reconciled. Do not put a separate vendor service into Compose for this POC.

Production hosting, cloud IAM, regional topology, HA, queues, and deployment automation are deferred. No cloud account, SQS emulator, cache, or broker is required for the selected local flow.

## Decisions remaining before implementation

Versions and tools above, API authentication/exposure policy, numeric request/retry/resource budgets, idempotency/concurrent-request semantics, recovery trigger, and privacy/retention choices remain open. The topology is selected; the architecture phase is not complete. Data design, intake contracts, and setup remain separate unstarted phases. Do not infer readiness from a diagram or a selected stack.

## Bounded container setup — 2026-11-06

The user explicitly requested runnable Compose services and selected Express, with all application code and Compose files under app/. This authorizes a minimal infrastructure/health skeleton while schema, event contracts, delivery, and recovery decisions remain open; it does not complete all design phases.

Selected setup pins, verified against official Node releases, Docker Hub tag metadata, and npm registry metadata: Node.js 24.22.2 (npm 11.19.1), Express 5.3.0, TypeScript 5.9.3, pg 8.23.1, @types/express 5.0.6, @types/pg 8.23.1, @types/node 24.19.2, PostgreSQL 18.6. Node's built-in test runner covers skeleton health/readiness/configuration behavior; full product integration/E2E tooling is still open. npm package-lock.json records transitive integrity pins. TypeScript compiler checking is configured; an additional formatter/linter remains unselected.

Images: node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 and postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5. The PostgreSQL 18 volume is mounted at /var/lib/postgresql, matching its versioned PGDATA layout.

API port: container 3000, host loopback 3000 by default. Readiness uses SELECT 1 with a pool of 5 connections, 2-second connection acquisition timeout, and a 3-second statement / 3.5-second client query timeout. Vendor connectivity probe timeout: 3 seconds, GET only. These are infrastructure probe limits, not an event-delivery retry policy. Local credentials are randomly generated into ignored app/.env; API uses event_relay_app rather than the bootstrap postgres superuser.
