# Standard operating procedures

## 1. Intake and planning

1. Read AGENTS.md and its referenced documents, beginning with lessons.md.
2. Map the task to PRD stories and acceptance criteria; resolve blocking TBDs.
   Use the five phase boundaries: init-project product only; design-architecture stack/infra/tests; design-data schema; design-contracts interactions/payloads; setup-dev runtime configuration. Ask for the candidate's proposed design and discuss unresolved issues one at a time. Present reviewable artifacts before acceptance; stop before the next phase unless explicitly requested. Implementation is a separate request. Init completion does not require future design choices. Reopened upstream decisions require affected downstream reviews; do not silently infer acceptance from existing generated code.
3. Verify stack versions and architectural constraints.
4. Assign an owner and file scope for each component; identify shared files and dependencies.
5. Define validation evidence and the order of implementation before delegating.

## 2. Contract-first multi-agent execution

1. The coordinator supplies scoped context and explicit ownership to each agent.
2. Database and Backend follow the supplied/delegated design in data-model.md and infrastructure.md, agreeing on persistence, schema, migration, and producer/consumer implications. Resolve missing first-slice decisions before inventing tables or services.
3. Backend defines or updates api-contracts.md, including validation, success payloads, error payloads, authorization requirements, and asynchronous message schemas when applicable, before provider/consumer implementation.
4. Frontend verifies backend schemas, field types, nullability, status codes, and error cases against the contract **before building components**. Resolve mismatches with Backend first.
5. After contracts are agreed, agents may implement independent files concurrently when delegation is authorized. Dependent changes wait for their prerequisites. Without subagent support, perform the same roles serially.
6. Agents run relevant tests and hand off changed files, contract changes, decisions, and unresolved issues. Never overwrite another agent's work.
7. The coordinator integrates the work and verifies consumer/provider compatibility and PRD acceptance criteria.

## 3. Sequential code review

Do not execute review personas in parallel. Each reviewer receives the current integrated diff and previous findings.

1. Run the **Security** reviewer; record findings, apply required fixes, and verify them.
2. Run the **Performance** reviewer on the updated diff; record findings, apply required fixes, and verify them.
3. Run the **Logic** reviewer on the updated diff; record findings, apply required fixes, and verify them.
4. Run the **Architecture** reviewer on the updated diff; record findings, apply required fixes, and verify them.
5. If later changes invalidate earlier review conclusions, repeat the affected reviews in the same relative order.
6. The coordinator confirms that blocking findings are resolved and remaining findings have an explicit disposition.

## 4. Completion and handoff

1. Run relevant checks from testing.md and verify each applicable acceptance criterion.
2. Update contracts, setup instructions, environment documentation, and CHANGELOG.md as needed.
3. Record new actionable lessons in lessons.md.
4. Read .ai/config.json. When sessionLogging.enabled is true, write a sanitized Markdown handoff summary to its destination (currently .ai/sessions/) using a unique UTC timestamp and task slug, such as YYYYMMDDTHHMMSSZ-task-slug.md. Include the task, changed files, decisions, validation results, and outstanding work. This agent-written summary is not automatic transcript capture; omit secrets, personal data, and private reasoning. Subagents return their results to the coordinator, who writes the combined summary.
5. Report what changed, verification results, and unresolved limitations. Release according to the approved deployment procedure in tech-stack.md.
