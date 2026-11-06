> **Project instruction:** This document is the single source of truth for API request, response, and error payloads. Producers, consumers, mocks, and tests must match its schemas. Update and agree on the contract before changing payloads; do not infer undocumented fields.

# API contracts

Owning phase: design-contracts. Status: local event intake/status/retry endpoints implemented at the user’s explicit request; product phase completion is not inferred. Discuss the user’s intended [interaction flows](interactions.md) before finalizing these payloads; do not implement endpoints or message consumers in this phase.

API base URL: http://127.0.0.1:3000. Local host-loopback exposure is the POC access boundary. No public auth mechanism is implemented. Contract version0.2.0 is recorded in the OpenAPI file; breaking changes require an explicit contract/migration update.

## Supplied vendor contract and example

The user's supplied [vendor contract snapshot](vendor-payload-contract.json) is the destination contract. It is descriptive JSON, not an executable JSON Schema. The [sample request](vendor-request.example.json) is the body sent to the vendor's POST /events. Neither is the incoming relay DTO; the implemented source-event contract is linked below.

Only these exact, case-sensitive event names are eligible for forwarding: purchase, complete_registration, subscription_started, credits_spent, match_created, message_sent, push_opened. This explicitly supersedes the earlier all-valid-event-names policy. Do not rename event_name or forward other names, even when the local stub accepts their shape. How an ineligible input is acknowledged/stored remains a data/intake-contract decision; it must not be mistaken for successful vendor delivery.

| Vendor field | Type | Required | Mapping |
| --- | --- | --- | --- |
| event_name | string, in supplied allowlist | Yes | Source event, unchanged |
| event_time | integer epoch milliseconds | Yes | Source timestamp, never receivedAt |
| customer_user_id | string | No | Numeric profile ID directly or UUID lookup result |
| device_id | string | No | Source deviceId |
| event_value | object | No | Source properties, unchanged under the agreed privacy policy |
| app_version | string | No | context.app.version |
| platform | string | No | context.device.type |
| messageId | string | No | Source messageId, unchanged |

Unknown top-level fields are rejected. Optional fields must have their declared types when present; omit absent values rather than sending null. The relay's accepted source validity rules still require nonempty messageId/deviceId even though the destination makes them optional. Relay-side database deduplication remains required: vendor-side deduplication is an additional downstream safeguard, not permission to send duplicate intake.

Invalid vendor payloads receive 422 with details and must not be retried unchanged. The supplied metadata does not define a complete error-body schema. The current stub returns error, problems, and hint for schema failures; this is distinct from the relay's ErrorResponse below. The example event_time is an integer in the stub's additional accepted range 1000000000000 < event_time < 10000000000000. The snapshot's notes:null values describe absent documentation, not null-valued payload fields.

Stub gaps confirmed by source inspection: vendor.py checks field names/types and timestamp range, but does not enforce the seven-name allowlist or numeric customer_user_id semantics. It counts repeated accepted messageIds in its statistics; the exercise assumes the real vendor processes each ID once. Do not edit the fixed stub or treat its acceptance alone as proof that the full supplied contract is met. Later relay tests must enforce eligibility and deduplication independently.

## Event intake contract and implementation

Machine-readable authority: [app/contracts/openapi.json](../app/contracts/openapi.json). Runnable source example: [app/examples/source-event.json](../app/examples/source-event.json). These now define the local relay intake; the supplied snake-case JSON above remains the downstream vendor body.

The user explicitly requests the API → deduplication → persistence → direct vendor flow from the README source sample and POC DESIGN.md override. Implement one JSON source event per POST /events, not an HTTP redirect and not the already-normalized vendor sample. Local-only API binding remains the access boundary; public deployment/authentication is outside this POC.

Required: nonblank type/event (max128 chars), nonblank messageId/deviceId (max256), and timestamp as a real ISO8601 instant with timezone and up to six fractional digits, within the vendor millisecond range. Optional: receivedAt (valid instant), userId (numeric or UUID string), object properties/context, and object traits. Missing optional values are omitted, explicit null is rejected. Unknown top-level fields, arrays/batches, malformed JSON, non-finite numbers, and JSON nesting deeper than20 are rejected. Body limit64KiB. Known context metadata used for vendor projection must have string/object types; traits are accepted for registration but are neither stored, hashed, nor forwarded. properties and reviewed context are retained; no raw body is logged.

Intake identity is messageId, independent of internal generated UUID. Compare a canonical SHA256 of the retained source representation (including normalized instants/JSON content, excluding discarded traits). Insert events and its delivery record atomically with INSERT ON CONFLICT; commit before vendor calls. Same identity/content returns the saved record without a new vendor attempt; different retained content returns409. A pre-existing events row without a delivery record is a409 reconciliation case, never silently resent.

Results expose only eventId, messageId, status, duplicate, attempts, vendorStatus, and errorCode. Status values: pending, sending, delivered, skipped, retryable_failed, permanent_failed, uncertain. No source bodies or vendor error text are returned.

| Endpoint / outcome | HTTP behavior |
| --- | --- |
| POST /events, newly delivered or skipped | 201 with result |
| POST /events, identical duplicate | 200 with existing result; 202 if pending/sending; no new send |
| POST /events, changed content / untracked legacy row | 409 safe ErrorResponse |
| GET /events/:id | 200 safe result for internal UUID; 404 absent; 422 malformed UUID |
| POST /events/:id/retry | Explicit queue-free retry of pending/failed/uncertain work or stale sending claim; body omitted/empty object only. Terminal delivered/skipped/permanent failure returns saved result; active claim returns202. Successful retry returns200 |
| New delivery ends in permanent vendor rejection | 502 with stored result, permanent_failed |
| New delivery exhausts known transient vendor failures | 503 with stored result, retryable_failed |
| New delivery remains uncertain (timeout/network/invalid success response) | 504 with stored result, uncertain |
| Malformed JSON / unsupported content type / oversize body | 400 / 415 / 413 safe ErrorResponse |
| Source validation failure | 422 safe ErrorResponse |
| Admission limit / persistence failure | 503 safe ErrorResponse; retained state may require status lookup/recovery |

Each error includes a generated requestId. At most16 concurrent event requests are admitted per process; excess work gets503 rather than an in-memory queue. Vendor attempts default to3 with 2-second attempt timeout, bounded exponential jitter, and rate-limit delay within a 15-second request cancellation budget. All dispatch stays awaited; no retries run detached after response. Claim lease is60seconds, longer than the request/shutdown budgets. Short DB transactions have5-second transaction and1-second lock limits. Before each vendor attempt, durably increment the count only for the current, unexpired claim token. Complete outcomes with the same token; stale handlers cannot overwrite a newer owner.

Only POST to the configured vendor origin, with redirect following disabled. Validate successful acknowledgement as accepted=1; discard untrusted error bodies. Known400/422 and other4xx except429 are permanent;429/500/502/503/504 retry within bounds; timeouts/network failures are uncertain and may be retried under the exercise's unchanged-messageId vendor dedup assumption. A DB commit cannot atomically cover HTTP acceptance; uncertain/replayed attempts can reach the vendor more than once. Ordinary duplicate intake never initiates another send. Explicit retry preserves the original normalized payload and ID; no automatic stale-claim takeover or polling is added.

## Implemented infrastructure endpoints

The user's explicit Compose/Express setup request authorizes these minimal probes only. Event endpoints above are now implemented alongside these probes.

| Method / path | Response | Meaning |
| --- | --- | --- |
| GET /health | 200 with {"status":"ok"} | Express is alive; independent of database/vendor availability. |
| GET /ready | 200 with {"status":"ready"}, or 503 with {"status":"not_ready"} | A bounded SELECT 1 succeeds/fails using the application DB role. This checks connectivity only, not migration version, event-schema completeness, or delivery readiness. |
| Any other route | 404 using ErrorResponse, code NOT_FOUND and generic message | Includes a generated requestId; no stack/DB diagnostics exposed. |

The vendor connectivity check is a command-line read-only probe, not an exposed HTTP proxy endpoint. Startup configuration validation failures log only a generic startup_failed event and exit.

The machine-readable specification linked above replaces the former empty-path starter. ErrorResponse remains {error:{code,message,requestId}}; vendor failure outcomes use the documented EventResult shape.

## Operation checklist

- Unique operation ID, method, path, and purpose.
- Authentication and authorization rules.
- Path/query/header parameters and request body schema.
- Required versus optional fields, nullability, constraints, and unknown-field policy.
- Success status codes and response schemas.
- Expected failure status codes and stable error codes.
- Pagination, idempotency, rate limits, and compatibility where applicable.
- Representative examples and provider/consumer verification.

## Asynchronous message contracts

Current POC: no asynchronous messaging boundary; the user explicitly excluded queues, workers, and fan-out. Do not add message schemas for this slice. Intake duplicate/conflict responses and explicit retry/recovery are implemented by the local contract above. The following guidance is for a future asynchronous scope only.

Future status: TBD. If jobs/events are part of the design in [infrastructure.md](infrastructure.md), define each message's name/version, producer, consumer, payload schema and sanitized example before implementing either side. Identify correlation, duplicate/idempotency handling, ordering/delivery assumptions, and compatible schema evolution where applicable. Distinguish enqueue acknowledgement from completed work, including result/status and failure responses exposed through HTTP or other boundaries. Keep infrastructure retry/failure policy in infrastructure.md and schema/storage design in [data-model.md](data-model.md).

If there is no messaging boundary, record that decision and its reason rather than inventing messages. Existing authoritative machine-readable contracts may be referenced instead of duplicated.
