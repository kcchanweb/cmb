# Event relay product scaffold

Task: initialize the product scaffold and identify rules from the existing README and vendor contract.

Changed: README.md, AGENTS.md, CHANGELOG.md, docs/prd.md, docs/decisions.md, docs/demo.md, and .ai/project.json populated; remaining missing guidance/docs, safe ignore patterns, logging config, app/.gitkeep and guarded root Makefile seeded. Existing vendor, fixtures, and generator preserved.

Supplied requirements: event intake, PostgreSQL persistence, normalization, downstream API delivery. Node.js/TypeScript and PostgreSQL recorded as user preferences without versions or architecture acceptance. Fixed vendor validation and messageId constraints recorded as repository evidence. All-events forwarding, device-only missing-profile handling, occurrence-time mapping, outbound allowlist, stronger source identifiers, and recoverable outcomes remain proposals in the PRD.

Reviews performed serially: Security (input/contact exposure and sanitized logging); Performance (no invented throughput guarantee or processing topology); Logic (mapping, timestamp bounds, identity semantics, permanent/transient failures and duplicate counters checked against vendor); Architecture (only product scaffolding, future designs unstarted, seed preserved). No unresolved blocking document findings.

Validation: the first validator run identified a deferred-state shape error; corrected it to topic/reason objects. Subsequent validate.py run reported zero errors with intentional future-stage/guidance placeholders. No application, database, container, or vendor runtime checks ran.

Outstanding: user product acceptance. init-project remains review; all later phases remain not_started. Suggest design-architecture after acceptance; initialization is product scaffolding only. New sessions discover AGENTS.md automatically; it was explicitly read and applied in this session.
