# Event relay POC

Express/TypeScript accepts source events, atomically deduplicates/stores them in PostgreSQL, then directly posts the normalized allowlisted payload to the host vendor. Internal row IDs are UUIDs; original messageIds stay unchanged. No queue, fan-out, Lambda, or background consumer is used.

Application code, migrations, examples, contracts, tests, Dockerfile and Compose files live under app/. The root Makefile executes commands there. The original seed/vendor below remains at the root and vendor.py is unchanged.

## Run

Requirements: Docker with Compose and Python3. Run from the project root:

```sh
make vendor              # separate terminal: fixed host vendor on9000
make up                  # initializes local credentials, starts DB, applies migrations, builds/starts API
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Only API port3000 is published, on host loopback. PostgreSQL is private on the shared network at db:5432. The API reaches the host via host.docker.internal:9000 and mounts profiles.json read-only for UUID resolution. See [environment/configuration](docs/environment.md), [infrastructure](docs/infrastructure.md), and [guardrails](docs/guardrails.md). make down preserves the database volume.

## Submit one event

Use the original README-style source payload, not the normalized snake-case vendor request:

```sh
curl -i http://localhost:3000/events   -H 'Content-Type: application/json'   --data-binary @app/examples/source-event.json
```

Successful new delivery returns201 with eventId, messageId, status=delivered, attempts and vendorStatus. Valid excluded event names are stored as skipped without vendor traffic. Identical repeats return the existing result with duplicate=true (200, or202 for pending/sending); different retained content under the same messageId returns409.

```sh
curl http://localhost:3000/events/EVENT_UUID
curl -X POST http://localhost:3000/events/EVENT_UUID/retry
```

Use the internal eventId UUID from the response for status/retry. Ordinary duplicate intake never starts another send. Explicit retry uses the frozen saved payload for pending/transient/uncertain work or an expired claim. Delivered/skipped/permanent failures are terminal. If the initial response is lost, identical re-submission safely retrieves its saved ID/state.

A 503 EventResult with retryable_failed, vendorStatus500, and attempts3 means input was saved but the vendor failed all attempts. The fixed stub can deliberately stay in500 mode. The original README below shows how to restore mode=ok; then call /events/EVENT_UUID/retry. Repeating the original POST only retrieves its failed record. Inspect status rather than assuming every2xx duplicate response represents delivery.

The API stores required source fields, object properties/context, and a delivery record in one committed transaction before network side effects. It filters to the seven allowed event names, maps numeric/UUID users, omits unmatched customer IDs, uses occurrence timestamp in milliseconds, and excludes raw traits/contact/advertising metadata from the outbound projection. Raw event bodies and vendor errors are not logged or exposed. See the [incoming OpenAPI contract](app/contracts/openapi.json), [vendor contract/example](docs/api-contracts.md), [field mapping](docs/data-model.md), and [interaction flow](docs/interactions.md).

## Checks and database access

```sh
make test                # pinned Node unit/HTTP tests + real schema + isolated pipeline tests
make test-integration    # isolated DB: duplicates, failures, retries and recovery
make test-db             # schema checks with synthetic rows rolled back
make psql                # application-role DB shell inside db
make vendor-check        # read-only strict-vendor reachability probe
make config              # validate Compose without printing credentials
make logs
make down
```

The automated pipeline tests use a separate temporary database and an HTTP test vendor; they do not change the host vendor's controls. A separate strict-stub smoke test also verified six concurrent requests produce one source row and one vendor delivery. The framework is Node's built-in test runner; no browser/frontend is included. The guarded lint/frontend/standalone external-E2E hooks remain unconfigured.

See [decisions](docs/decisions.md), [testing evidence](docs/testing.md), and [AGENTS.md](AGENTS.md). .ai/project.json records facts and phase status without treating the explicit implementation request as acceptance of unrelated production designs. Local sanitized handoffs follow [.ai/config.json](.ai/config.json). Public deployment/auth, retention/deletion policy, and production operations remain outside this local POC.

## Validate vendor receipt

For an identified event, the vendor itself records accepted message IDs:

```sh
curl -s http://localhost:9000/_order | python3 -m json.tool
curl -s http://localhost:9000/_stats | python3 -m json.tool
```

Look for your messageId under customer_user_id (for example987654). /_stats shows aggregate events_received, unique_message_ids and duplicates; events_received includes duplicates. The API status endpoint separately shows delivered/vendorStatus200. Anonymous events are not grouped by customer in /_order; use their saved acknowledgement plus aggregate counters.

If the vendor is deliberately set to500, restore it and retry the EXISTING event:

```sh
curl -X POST http://localhost:9000/_control -H 'Content-Type: application/json' -d '{"mode":"ok"}'
curl -X POST http://localhost:3000/events/EVENT_UUID/retry
```

See [poc.md](poc.md) for actual test results, deferred checks and operational cleanup. The container URL remains host.docker.internal;127.0.0.1:9000 is the host-terminal address.

## Original exercise seed

Everything here is **Python 3.9+ standard library only**. Nothing to install, no Docker,
no cloud account. You do not have to write your PoC in Python — the seed is just
data and a local vendor server.

## What's here

| File | What it is |
|---|---|
| `events.jsonl` | ~10,000 mobile analytics events, one JSON object per line. Not every line is valid JSON. |
| `profiles.json` | Lookup table: UUID user id → internal numeric profile id. ~11% of UUID-carrying events have **no** entry here. That is intentional. |
| `vendor.py` | The downstream vendor. Accepts events, and can be told to fail. |
| `gen_events.py` | Regenerates the two data files. Defaults to `--seed 7`; the same arguments reproduce the data. |

## Run the vendor

```bash
python3 vendor.py --port 9000
```

| Endpoint | Purpose |
|---|---|
| `POST /events` | One event per request — the real-time vendor shape |
| `POST /_control` | Change its behaviour while running |
| `GET /_stats` | What it has received, including duplicate detection |
| `POST /_reset` | Clear all stats, duplicate history, and the rate-limit window; keep configuration |

## Don't edit the vendor

`vendor.py` stands in for an external company's API. **Don't edit it.** The
contract below is fixed and your code adapts to it — the same way it would to a real
vendor. `events.jsonl`, `profiles.json` and `gen_events.py` are input and are yours to
regenerate or subset; the vendor's behaviour is not.

## The vendor payload contract

`POST /events` validates what you send and returns **422** with a list
of exactly what's wrong. 422 is a permanent failure — retrying the same payload will
never help.

| Field | Type | Required |
|---|---|---|
| `event_name` | string | yes |
| `event_time` | int, epoch **milliseconds** | yes |
| `customer_user_id` | string | no |
| `device_id` | string | no |
| `event_value` | object | no |
| `app_version`, `platform`, `messageId` | string | no |

*Only `event_name` and `event_time` are required*, so the vendor will accept an event carrying
neither identifier. `device_id` (the event's `deviceId`) is what the vendor attributes on;
`customer_user_id` is the join key back to your own warehouse. An event with the former and not
the latter still attributes. `/_stats` reports `accepted_without_customer_user_id` and
`accepted_with_no_identifier_at_all` so you can see what you actually shipped.

Unknown fields are rejected. Send a raw source event and the 422 will tell you
everything that's wrong with it — that's the intended way to learn the contract:

```bash
curl -X POST localhost:9000/events -d '{"type":"track","event":"purchase","userId":"807225"}'
# 422 {"problems":["missing required field 'event_name'", ...]}
```

**Keep validation enabled (`strict: true`) for the exercise and demo.** Non-strict mode is
for diagnostics only; success with validation disabled does not demonstrate a valid payload.

## Make it misbehave

```bash
# fail everything with a retryable 500
curl -X POST localhost:9000/_control -d '{"mode":"500"}'

# retryable rate-limit response for every request
curl -X POST localhost:9000/_control -d '{"mode":"429"}'

# permanent rejection — retrying will never help
curl -X POST localhost:9000/_control -d '{"mode":"reject"}'

# hang for 30s so your client's timeout fires
curl -X POST localhost:9000/_control -d '{"mode":"timeout"}'

# 10% random failures with 250ms of latency
curl -X POST localhost:9000/_control -d '{"mode":"ok","fail_ratio":0.1,"latency_ms":250}'

# back to normal
curl -X POST localhost:9000/_control -d '{"mode":"ok","fail_ratio":0,"latency_ms":0,"rate_limit_rps":null,"strict":true}'
```

Controls persist until changed or the server restarts; `/_reset` does not restore them.
Invalid control values return 400 without changing configuration. With strict validation on,
invalid payloads return 422 before injected failures. The `timeout` mode waits 30 seconds,
then returns 504 without accepting the event; use a shorter client timeout to exercise it.
It does not simulate an accepted event whose response was lost.

## Giving yourself time to interrupt the run

If your pipeline finishes too quickly to interrupt, add vendor latency. How much time this
buys depends on concurrency, filtering, and retries:

```bash
curl -X POST localhost:9000/_control -d '{"latency_ms":50}'
curl -X POST localhost:9000/_control -d '{"latency_ms":0}'    # back to normal
```

## Check what actually arrived

```bash
curl -s localhost:9000/_stats | python3 -m json.tool
```

Illustrative excerpt, not expected totals for the supplied seed:

```json
{
  "requests": 8414,
  "events_received": 8402,
  "unique_message_ids": 8388,
  "duplicates": 14,
  "by_status": {"200": 8402, "500": 12},
  "events_per_sec": 940.3
}
```

For this exercise, assume the vendor uses `messageId` to deduplicate events: repeated
submissions are acknowledged but processed only once. The local stub reports repeated
deliveries so you can observe your pipeline's behavior; its counters include duplicates.
The `duplicates` field counts accepted events whose `messageId` was already accepted since
the last reset or server start. You do not need to implement vendor-side deduplication.

`events_received` counts accepted events, including duplicates. `requests` and `by_status`
count completed event requests, including failures, but exclude control and stats requests.
Stats and duplicate history are in memory. Reset only after outstanding requests have finished;
requests still running can update the cleared counters.

## Event shape

```json
{
  "type": "track",
  "event": "purchase",
  "messageId": "cb978be3-080e-41b0-b412-882213f38870",
  "timestamp": "2026-09-01T11:49:25Z",
  "receivedAt": "2026-09-01T12:00:00Z",
  "userId": "0ab77988-07fa-42f7-95c8-91ff3add6527",
  "deviceId": "2ebfd49a-3db3-495a-aa13-5b02b464b682",
  "properties": {"revenue": 49.99, "currency": "USD", "sku": "credits_500"},
  "context": {
    "app": {"version": "6.15.1"},
    "device": {"type": "ios", "advertisingId": "687dd512-..."},
    "os": {"name": "iOS", "version": "17.4"},
    "locale": "en-US"
  }
}
```

Things worth noticing before you design anything:

- **`deviceId` is on every event**, minted at install. **`userId` is on ~90%** — numeric
  (~58% of all events) or a UUID needing a `profiles.json` lookup (~32%). The other ~10%
  have no `userId` key at all.
- `timestamp` and `receivedAt` differ, and events are **not** in timestamp order —
  mobile clients buffer while offline.
- `messageId` is unique per generated event. Keep it unchanged through transformations
  and retries so repeated deliveries can be recognized.
- Registration events carry `traits.email` and `traits.phone`.
