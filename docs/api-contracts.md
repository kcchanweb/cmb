> **Project instruction:** This document is the single source of truth for API request, response, and error payloads. Producers, consumers, mocks, and tests must match its schemas. Update and agree on the contract before changing payloads; do not infer undocumented fields.

# API contracts

Owning phase: design-contracts. Design/acceptance status: TBD. Discuss the user’s intended [interaction flows](interactions.md) before finalizing these payloads; do not implement endpoints or message consumers in this phase.

Contract owner: TBD. API base URL, authentication, versioning, and compatibility policy: TBD.

## Supplied vendor contract and example

The user's supplied [vendor contract snapshot](vendor-payload-contract.json) is the destination contract. It is descriptive JSON, not an executable JSON Schema. The [sample request](vendor-request.example.json) is the body sent to the vendor's POST /events. Neither file defines the relay's still-unselected intake request/response contract.

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

## Implemented infrastructure endpoints

The user's explicit Compose/Express setup request authorizes these minimal probes only. No event intake contract or product endpoint is implemented.

| Method / path | Response | Meaning |
| --- | --- | --- |
| GET /health | 200 with {"status":"ok"} | Express is alive; independent of database/vendor availability. |
| GET /ready | 200 with {"status":"ready"}, or 503 with {"status":"not_ready"} | A bounded SELECT 1 succeeds/fails using the application DB role. This checks connectivity only, not migration version, event-schema completeness, or delivery readiness. |
| Any other route | 404 using ErrorResponse, code NOT_FOUND and generic message | Includes a generated requestId; no stack/DB diagnostics exposed. |

The vendor connectivity check is a command-line read-only probe, not an exposed HTTP proxy endpoint. Startup configuration validation failures log only a generic startup_failed event and exit.

The OpenAPI 3.1 document below remains a product-contract starter with no product endpoints. Replace the example error conventions as an agreed contract change if the selected framework requires different conventions. Add each operation's inputs, outputs, status codes, security requirements, and examples before implementing it.

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Project API",
    "version": "0.1.0",
    "description": "Draft contract; product endpoints are not yet defined."
  },
  "paths": {},
  "components": {
    "schemas": {
      "ErrorResponse": {
        "type": "object",
        "additionalProperties": false,
        "required": ["error"],
        "properties": {
          "error": {
            "type": "object",
            "additionalProperties": false,
            "required": ["code", "message", "requestId"],
            "properties": {
              "code": { "type": "string", "description": "Stable machine-readable error code." },
              "message": { "type": "string", "description": "Safe public error description." },
              "requestId": { "type": "string", "description": "Correlation identifier for diagnostics." }
            }
          }
        }
      }
    },
    "responses": {
      "InternalError": {
        "description": "Unexpected server failure; no internal details are exposed.",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/ErrorResponse" },
            "example": {
              "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
                "requestId": "example-request-id"
              }
            }
          }
        }
      }
    }
  }
}
```

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

Current POC: no asynchronous messaging boundary; the user explicitly excluded queues, workers, and fan-out. Do not add message schemas for this slice. Intake duplicate/conflict responses and explicit retry/recovery flows still require design. The following guidance is for a future asynchronous scope only.

Future status: TBD. If jobs/events are part of the design in [infrastructure.md](infrastructure.md), define each message's name/version, producer, consumer, payload schema and sanitized example before implementing either side. Identify correlation, duplicate/idempotency handling, ordering/delivery assumptions, and compatible schema evolution where applicable. Distinguish enqueue acknowledgement from completed work, including result/status and failure responses exposed through HTTP or other boundaries. Keep infrastructure retry/failure policy in infrastructure.md and schema/storage design in [data-model.md](data-model.md).

If there is no messaging boundary, record that decision and its reason rather than inventing messages. Existing authoritative machine-readable contracts may be referenced instead of duplicated.
