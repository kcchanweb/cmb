# Run and demonstrate the POC

Use [README.md](../README.md) for exact startup/curl commands, [OpenAPI](../app/contracts/openapi.json) for the incoming contract, and [poc.md](../poc.md) for completed/pending verification.

1. Start the host vendor with make vendor in a separate terminal; keep strict=true and mode=ok for a happy-path demo.
2. Run make up from the project root. It creates/preserves local credentials, starts DB, applies001/002, builds API and waits for healthy services.
3. POST app/examples/source-event.json to /events.201/statusdelivered means a new event was retained and acknowledged by the vendor.
4. Repeat the identical body: existing eventId, duplicate=true, no new vendor call. Change retained properties with the same messageId to show409 conflict.
5. GET /events/EVENT_UUID to inspect durable status. Inspect vendor /_order for the event's messageId under its numeric customer ID; /_stats provides aggregate unique/duplicate counters.
6. Set the exercise vendor to500, submit a NEW messageId, and observe503/retryable_failed with retained DB data and three bounded attempts. Restore modeok, then POST /events/EVENT_UUID/retry. Do not re-POST as a retry: ordinary duplicate intake only reads the saved result.
7. Demonstrate ineligible event names stored as skipped, optional customer identity with device attribution, and normalized payloads without raw traits/contact/advertising metadata.

Actual results:17 unit/HTTP tests,24 schema checks,10 isolated PostgreSQL/HTTP scenarios, strict live stub one-send-for-six-concurrent-requests smoke, and retained state across an API restart. The user's curl-purchase-001 was explicitly retried after vendor recovery and is delivered with vendorStatus200 and cumulative attempts4. No queue/worker is involved. Extended checks and the temporary19001 test process are documented in poc.md.
