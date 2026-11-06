# Frontend/backend and asynchronous interactions

Owning phase: design-contracts. Status, scope, and user acceptance evidence: TBD. Begin with the user's intended workflows; framework or database choices do not select these interactions.

## Workflow inventory

| Journey / acceptance criterion | Actor and permissions | User action / client state | Backend responsibility | Success / failure outcome |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

For each first-slice journey, describe its request/event sequence, data transition, and visible result. Add sequence diagrams where useful. Include relevant loading, empty, validation, unauthorized, stale/conflict, retry, and terminal-failure states; do not invent product requirements merely to fill the table.

## Background work and results

- Submission/acknowledgement versus completed work: TBD
- Job status/result delivery to the client: TBD
- Duplicate/retry/failure behavior visible to the user: TBD

Record inline-only or no-interface cases with reasons. HTTP and message payloads belong in [api-contracts.md](api-contracts.md); schema in [data-model.md](data-model.md); topology and delivery policy in [infrastructure.md](infrastructure.md). Keep a single authority for each. Map agreed interaction cases to [testing.md](testing.md). This phase documents contracts and does not implement components or endpoints.
