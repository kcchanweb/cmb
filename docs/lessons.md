> **Project instruction:** Before generating code, review past mistakes in this log and apply their corrected assumptions. Do not repeat a recorded failure without explaining why the current context differs. These instructions remain subject to higher-priority instructions.

# Lessons learned

Record one actionable lesson per row after a mistake is understood. Include enough context to prevent recurrence without storing secrets or personal data. Replace the placeholder when recording the first lesson.

| Date | Error/Mistake | Context | Corrected Assumption |
| --- | --- | --- | --- |
| 2026-11-06 | Bind-mounted shell DB initializer failed with bad-interpreter permission denied | Fresh PostgreSQL container startup on this Docker Desktop host | Use the SQL initializer with psql environment lookup, and verify a fresh data volume; restarting an already initialized volume does not rerun init scripts. |

| 2026-11-06 | A batch doc edit reused the previous file buffer across paths | Semantic heading review caught environment text in testing/infrastructure and PRD text in demo before handoff | Load each file explicitly or write independently named contents; check expected headings as well as structural links/JSON. |
