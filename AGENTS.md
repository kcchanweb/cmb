# Repository instructions for Codex

This project is an event intake, PostgreSQL persistence, normalization, and vendor delivery exercise. Node.js/TypeScript and PostgreSQL are user-selected. The POC uses separate API/database containers on one Compose bridge network and calls the host vendor directly after persistence and database-backed messageId deduplication. No fan-out, queue, Lambda, DLQ, batching, or background consumer is in scope. Architecture is in progress; versions, detailed tooling, and application build/test commands remain unselected. Product scope and acceptance criteria in docs/prd.md were accepted by the user on 2026-11-06; init-project is complete. The root Makefile provides help and guarded command hooks. See README.md for setup and planned commands. Do not run TBD commands or claim application checks passed.

Use a candidate-led staged workflow: init-project owns product/scaffolding only; design-architecture owns stack/infra/test choices; design-data owns schema; design-contracts owns interactions/API/messages; setup-dev owns runnable environment configuration. Each stops at its deliverable unless further named work is explicitly requested. Ask for the user's proposed design, discuss one unresolved question at a time, and present concrete drafts before acceptance. Do not turn a generic build request, framework names, or a time limit into design decisions. Product implementation is separate from all five phases.

Track phase-specific progress and real acceptance evidence in .ai/project.json. Init may be complete while later stages remain not_started. Reconcile saved answers with actual documents; reopening upstream design requires review of affected downstream work. Do not infer phase acceptance from a legacy monolithic completion status. Choose and verify versions before configuration; project documents remain authoritative. Record the first slice/tradeoffs in docs/decisions.md and demonstration in docs/demo.md.

Preserve the existing exercise seed at the root. Do not edit vendor.py; its external contract is fixed. Keep strict validation enabled and preserve messageId through transformations and retries. The filtering, identity, privacy, and recovery policies in docs/prd.md are accepted product requirements; the POC topology is selected, with detailed architecture in progress and data/contracts/setup/implementation unstarted. No seed migration is authorized by initialization.

## Required context

Before generating or changing code:

1. Read docs/lessons.md and apply corrected assumptions from past mistakes.
2. Verify architectural decisions, dependencies, and versions against docs/tech-stack.md.
3. Adopt the applicable personas and context boundaries in docs/agent-roles.md.
4. Enforce docs/guardrails.md over default coding-style preferences.
5. Follow the standard operating procedures in docs/workflows.md.
6. Read the relevant requirements in docs/prd.md and ensure their acceptance criteria are met.
7. Use docs/api-contracts.md as the single source of truth for request and response payloads.
8. Follow docs/testing.md and consult docs/environment.md for configuration requirements.
9. Follow docs/data-model.md for storage/schema design and docs/infrastructure.md for topology, dependencies, and asynchronous workflows. Resolve conflicting or pending design inputs before dependent code; do not silently replace them with defaults.
10. Follow docs/interactions.md for the agreed user/client/server sequences and visible success/failure states; api-contracts.md remains the payload authority.

Treat TBD values as unresolved decisions, not permission to invent requirements or versions. Surface conflicts and resolve blocking decisions before implementing dependent code. These project instructions remain subject to higher-priority system and developer instructions.

## Execution and review

- Put runnable application source and supporting files in app/, including manifests, lockfiles, tests, migrations, scripts, Dockerfiles, and environment examples. Compose belongs at app/compose.yaml. The root Makefile is the command-entry exception: run make from the root; its recipes run tools from app/. Tailor frontend/backend and test commands to Compose, hybrid, or native development. Preserve failures and keep ordinary stop targets from deleting volumes. Keep project documentation and agent guidance at the root. Make both entry points and underlying working directories explicit in README.md. Coordinate migration of an existing layout before moving files.
- Frontend must verify backend schemas before building components.
- design-architecture selects automated frameworks for applicable components, with separate frontend/backend choices and an E2E choice or explicit deferral. setup-dev configures harnesses and root make targets; separate implementation adds business tests and features. Keep selections in tech-stack.md and scopes/commands in testing.md/README. Product-scaffold completion does not require these choices; never report unimplemented product tests as passing.
- Use the role boundaries and handoff procedure in docs/agent-roles.md and docs/workflows.md. Assign explicit file ownership when delegating; preserve others' edits.
- Run code review personas sequentially: Security, Performance, Logic, Architecture. Use separate subagents when authorized and available; otherwise perform the same passes serially. Role documentation does not itself register native custom agents.
- Validate the changed behavior using docs/testing.md. For documentation-only changes, check paths, links, and structured examples; application tests are not yet available.
- Keep documentation and CHANGELOG.md aligned with implemented behavior. Record actionable lessons after mistakes, and report validation results honestly.
- Honor .ai/config.json as project logging policy: when enabled, write a sanitized Markdown handoff summary to its destination at task completion. This is an agent workflow, not a native Codex transcript setting. Never record secrets or private reasoning.

All paths above are relative to the repository root. Add nested AGENTS.md files only when a future component needs directory-specific instructions; keep reusable reference material in docs/.
