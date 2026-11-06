# Demonstration goals

POC scope: API and PostgreSQL containers share a Compose network; the vendor runs on the host, with direct calls after persistence and messageId deduplication. No queue/worker is included.

Status: event-pipeline observations below remain planned. The Compose/Express health skeleton is running and its five tests pass; the initial event table is implemented, while ingestion, normalization, duplicate-dispatch coordination, and vendor event delivery remain unimplemented. See README.md for actual infrastructure commands. Accepted product criteria are recorded in [prd.md](prd.md).

1. Use eligible event names for numeric-user, mapped-UUID, unmapped-UUID, and anonymous examples. Also demonstrate that excluded names do not generate vendor calls even though the stub may accept their shape. Show persistence and delivery outcomes without exposing contact data.
2. Keep the vendor strict. Verify mapped fields, occurrence time in milliseconds, unchanged messageId, and device attribution. Under the accepted policy, missing profiles omit customer_user_id.
3. Show a registration event's outbound payload excludes traits, contact fields, and advertising metadata.
4. Demonstrate malformed JSON and invalid timestamps/identifiers failing visibly without blocking a subsequent valid event.
5. Exercise permanent 400/422 versus transient 429/500/timeout failures. Verify terminal outcomes and bounded retry/recovery behavior; settings are not yet selected.
6. Submit identical and concurrent same-messageId events; verify duplicates do not initiate extra vendor sends. Repeat after confirmed success and verify the stored result is reused. Show same-ID/different-content conflict handling.
7. Interrupt unfinished retained work, restart, and recover through the selected explicit recovery trigger once designed. Separate legitimate failed/uncertain-attempt retries from duplicate intake; no automatic worker is implied.

| Check | Expected observation | Actual status |
| --- | --- | --- |
| Persistence and normalization | Retained input; strict vendor accepts transformed events | Not run; app not implemented |
| Identity and privacy | Mapping/device-only cases work; excluded metadata absent | Not run; app not implemented |
| Failure/restart recovery | Visible terminal failures; recoverable transient failures and unfinished work | Not run; app not implemented |
| Reconciliation | Local outcomes agree with unique message IDs and duplicate counts | Not run; app not implemented |

The [README](../README.md) documents existing vendor controls. Example totals are illustrative. Wait for outstanding requests before resetting statistics; reset preserves failure configuration. Timeout mode does not simulate an accepted event with a lost response.

Next: finish architecture, then data/contracts decisions for deduplication and queue-free recovery. Ordinary shutdown and separate destructive reset procedures belong to environment setup.

## Setup evidence

Implemented and verified: Express health/readiness, API/PostgreSQL shared network, non-superuser DB role, non-root API, strict host-vendor connectivity, fresh DB bootstrap, and DB stop/restart persistence/readiness recovery. These setup observations do not satisfy the product criteria above. No source events were forwarded during setup verification.

The initial event-schema slice is now applied: make db-migrate and make test-db demonstrate UUID identity, source message_id uniqueness, typed source columns, nullable user identity, and JSONB constraints. The 24 database checks pass with all synthetic rows rolled back; full event journeys above remain planned.
