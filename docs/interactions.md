# Event intake and recovery interactions

Status: implemented local POC flow at the user's explicit request. [OpenAPI](../app/contracts/openapi.json) is authoritative for HTTP bodies/statuses; [data-model.md](data-model.md) owns storage, and [infrastructure.md](infrastructure.md) owns topology. There is no frontend or message transport.

```mermaid
sequenceDiagram
    participant Client
    participant API as Express
    participant DB as PostgreSQL
    participant Vendor as Host vendor
    Client->>API: POST /events (one source event)
    API->>API: Validate, canonicalize and normalize
    API->>DB: BEGIN; INSERT event ON CONFLICT; compare hash; INSERT delivery; COMMIT
    alt identical existing event
        API-->>Client: Saved result, duplicate=true (no new send)
    else source identity conflict
        API-->>Client: 409 safe error
    else ineligible event
        API-->>Client: 201 skipped, persisted without vendor call
    else new eligible event
        API->>DB: Atomic claim with UUID token /60s lease
        API->>DB: Record attempt for current unexpired token
        API->>Vendor: Direct normalized POST /events
        Vendor-->>API: Acceptance / permanent / transient / uncertain outcome
        API->>DB: Save outcome conditional on claim token
        API-->>Client: Result distinguishes persisted from delivered
    end
```

GET /events/:id returns safe delivery metadata, not source properties/context. POST /events/:id/retry is an explicit queue-free recovery trigger: atomically claim pending/transient/uncertain work or an expired sending lease, send the original snapshot, and record the new outcome. An active claim returns202; simultaneous retry requests cannot both claim it. Terminal delivered/skipped/permanent records are returned without new vendor calls.

If the process stops before HTTP, committed pending data remains. If a vendor accepted but its response or local outcome write is lost, the saved state is uncertain or sending until lease expiry. Replayed calls preserve messageId under the exercise's vendor deduplication assumption; exactly-once HTTP delivery across DB/network is not promised. Stale tokens cannot overwrite newer outcomes. Nothing automatically polls or drains records after restart.

Admission permits at most16 active event requests per process. Body/JSON limits, finite DB operations, cancellation-aware vendor attempts/backoff, and a15-second processing cancellation budget bound work. Client disconnect does not prove vendor non-acceptance. Event errors expose correlation IDs and safe categories only. The POC API is host-loopback-only; public authentication/permissions are a later deployment scope.
