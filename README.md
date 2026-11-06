# Event relay — exercise seed and project scaffold

Project goal: accept events through an API, retain them in PostgreSQL, normalize them, and forward them to the fixed vendor API. Selected POC stack/topology: Node.js/TypeScript API container and PostgreSQL container on one Compose network, with direct calls to the vendor running on the host. Persist and deduplicate by messageId before vendor delivery.

**Status:** product baseline accepted in [docs/prd.md](docs/prd.md); init-project complete. Architecture is in progress; the POC topology is selected. Data design, intake contracts, environment setup, and implementation are unstarted. Initialization creates documentation only; it does not make the project implementation-ready. The original exercise seed below is preserved.

See [POC stack](docs/tech-stack.md), [infrastructure](docs/infrastructure.md), [guardrails](docs/guardrails.md), [decisions](docs/decisions.md), [demo goals](docs/demo.md), and [AGENTS.md](AGENTS.md). Phase state and provenance are in `.ai/project.json`. The [logging policy](.ai/config.json) enables sanitized local Markdown summaries under `.ai/sessions/`, ignored by Git; this is not automatic transcript capture.

The root Makefile contains guarded hooks. Application install/start/build/test commands are not configured. Future runnable source/support belongs under `app/`; the selected Compose configuration belongs at `app/compose.yaml` when setup is implemented. Run future make commands from the root; recipes execute in `app/`. Existing seed files have not moved.

Next: finish the remaining architecture/tooling decisions, then data design and intake contracts before runtime setup. Start a new session for automatic AGENTS discovery; AGENTS.md has been explicitly read and applied in this session.

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
