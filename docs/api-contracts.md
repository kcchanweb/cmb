> **Project instruction:** This document is the single source of truth for API request, response, and error payloads. Producers, consumers, mocks, and tests must match its schemas. Update and agree on the contract before changing payloads; do not infer undocumented fields.

# API contracts

Owning phase: design-contracts. Design/acceptance status: TBD. Discuss the user’s intended [interaction flows](interactions.md) before finalizing these payloads; do not implement endpoints or message consumers in this phase.

Contract owner: TBD. API base URL, authentication, versioning, and compatibility policy: TBD.

The OpenAPI 3.1 document below is a starter with no product endpoints. Replace the example error conventions as an agreed contract change if the selected framework requires different conventions. Add each operation's inputs, outputs, status codes, security requirements, and examples before implementing it.

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
