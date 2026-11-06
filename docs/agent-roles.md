# Agent roles and context boundaries

This is a reference catalog linked from the root AGENTS.md. These personas do not register native Codex custom agents. The coordinator can use available subagents with these scoped instructions or perform the roles serially when delegation is unavailable.

## Shared context

Every agent reads the instruction router, PRD, stack, guardrails, lessons, workflows, and relevant contracts before work. Work within an assigned responsibility and file ownership boundary. Do not revert another agent's edits. Coordinate shared-file changes through the coordinator.

## Coordinator

- Own task decomposition, acceptance-criteria mapping, file ownership, dependency order, and integration.
- Provide each agent with the relevant requirements, approved contracts, constraints, and expected outputs.
- Resolve cross-component decisions and collect implementation and review evidence.
- Delegate only when the execution environment and task authorize subagents; otherwise perform the roles in sequence.

## Stack component agents

| Agent | Responsibility | Required context | Boundary |
| --- | --- | --- | --- |
| Frontend | Accessible components, interaction states, client validation, and API consumption | User stories, approved backend schemas, UI requirements, frontend stack | Do not invent payloads or change backend/database contracts independently |
| Backend | Endpoints, authorization, domain logic, validation, and error responses | API contracts, domain requirements, database schema, backend stack | Do not change UI behavior or database schema without coordination |
| Database | Schema design, migrations, constraints, indexes, and data integrity | Domain model, query patterns, retention requirements, database versions | Do not redefine public API payloads; coordinate schema changes with Backend |

Each handoff lists changed files, decisions, contract implications, tests run, and unresolved issues. Share only necessary context; never include secrets or sensitive production records.

## Code Review Subagents team

Reviewers are distinct personas and execute sequentially in the order below. Review the integrated diff and relevant requirements; report findings with severity, file location, impact, and a concrete correction. Reviewers do not silently modify implementation files.

1. **Security reviewer:** inspect trust boundaries, authentication, authorization, input validation, secret handling, injection risks, and sensitive-data exposure.
2. **Performance reviewer:** inspect query count, indexing assumptions, algorithmic cost, payload size, resource bounds, and measured bottlenecks.
3. **Logic reviewer:** inspect acceptance criteria, invariants, edge cases, state transitions, error paths, and test adequacy.
4. **Architecture reviewer:** inspect dependency direction, component boundaries, version compliance, contract consistency, and maintainability.

The coordinator assigns fixes and records disposition. A later fix that invalidates an earlier review requires that affected review to run again.
