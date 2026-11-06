# POC stack, infrastructure, and guardrails

Task: derive documentation from DESIGN.md, then incorporate the user's explicit direct-call scope, API/database containers on one network with host-run vendor, and duplicate-send prevention rule.

Primary changes: docs/tech-stack.md, docs/infrastructure.md, docs/guardrails.md. Supporting alignment: DESIGN.md (scope note and diagram fence), README.md, AGENTS.md, docs/prd.md, docs/decisions.md, docs/demo.md, docs/testing.md, docs/data-model.md, docs/api-contracts.md, docs/environment.md, CHANGELOG.md, and .ai/project.json. No application/runtime files created; vendor.py and input fixtures preserved. Root Makefile remains guarded.

Recorded choices: Node.js/TypeScript API container, PostgreSQL container (psql CLI inside it), one Compose bridge network, vendor as host process, no queues/fan-out/Lambda/DLQ/batching/workers. API uses service DNS for db and host.docker.internal for the host vendor, subject to actual reachability testing. Vendor binds loopback only; documented a restricted host relay fallback without changing the fixed service. Reviewed official Docker networking/host-gateway, PostgreSQL transaction/locking, and Node event-loop guidance.

Deduplication: stable source messageId is database-enforced identity; concurrent/repeated intake must not dispatch another vendor call, confirmed deliveries are reused, and same-ID/different-content is a conflict. Failed/uncertain-attempt retries are explicit delivery/recovery operations using the original identity/representation. No exactly-once DB/HTTP claim.

Guardrails: commit before side effects, no DB transaction/row lock held across HTTP or delays, bounded retries/request/resource budgets, sanitized logging/outcomes, configured vendor origin, strict validation, non-root API/non-superuser DB role, loopback-published API/private DB, persistent volume and safe shutdown. Recovery is not automatic without a worker; a concrete explicit trigger must be designed and tested.

Reviews performed serially: Security (privacy, credentials, configured destination, restricted host relay); Performance (bounded pool/concurrency/input/retry work and short transactions); Logic (dedup versus retries, crash windows, uncertain acceptance, recovery criteria); Architecture (single service/modules, container-host routing, source design scope override and phase readiness). No blocking document findings. Clarified that recovery-designated same-ID requests differ from ordinary duplicate intake.

Validation: shared validate.py returned zero errors, with intentional unselected tooling/future-stage placeholders and missing-Compose warning. Additional DESIGN.md local links/code-fence checks passed. No application, database, container, vendor runtime or network tests were executed. app/ still contains only .gitkeep.

State: init-project complete; design-architecture in_progress; data/contracts/setup not_started; environment.kind hybrid, execution undecided. No new acceptance inferred for unselected libraries, versions, budgets, auth, schema, or recovery mechanisms. Remaining work: finalize these decisions before implementation/setup. Task summary omits payloads and credentials.
