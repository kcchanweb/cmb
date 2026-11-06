# Event relay POC handoff

## Implemented

- Express/TypeScript POST /events accepts one README source event, validates types/body/depth/Unicode/timestamps, and preserves the original messageId.
- PostgreSQL events has an internal UUID PK and unique text message_id. Migration002 adds a durable delivery ledger, canonical source hash, frozen vendor payload, attempts, safe outcomes and token/lease ownership.
- Source and delivery records commit before vendor HTTP. Identical/concurrent duplicates do not initiate another dispatch; changed retained content is409. Ineligible names are retained as skipped.
- Direct normalized HTTP applies the seven-name allowlist, numeric/UUID profile lookup, device attribution, occurrence epoch milliseconds and outbound privacy allowlist. No queues, Lambda, DLQ, batching or background polling.
- GET /events/:id and POST /events/:id/retry expose durable status and explicit recovery. Permanent failures are terminal; transient/uncertain work is retained. Ambiguous replay uses unchanged vendor messageId; no exactly-once HTTP claim.
- API/DB containers share a bridge, DB is private/persistent, API is non-root/read-only and published only on host loopback3000. Profiles are mounted read-only. make up runs DB readiness → migrations → API startup.
- Request UUIDs propagate in headers; safe internal IDs/outcomes/attempts/durations are logged without raw payloads or credentials.

## Run and test

From project root, start make vendor in another terminal, then make up. Submit with:

```sh
curl -i http://localhost:3000/events -H 'Content-Type: application/json' --data-binary @app/examples/source-event.json
curl http://localhost:3000/events/EVENT_UUID
curl -X POST http://localhost:3000/events/EVENT_UUID/retry
make test
make vendor-check
make down
```

README.md contains complete startup, failure-mode and vendor-validation instructions. app/contracts/openapi.json is the incoming machine-readable contract. API container vendor URL is http://host.docker.internal:9000;127.0.0.1 inside that container points to itself. Reachability was verified directly from api. A requested literal127 URL was not applied because it would break the selected shared-bridge/host-vendor topology; a local relay would be a separate network change.

## Passed verification

-17 unit/HTTP/config tests and TypeScript build passed on final source; pinned Node24 integration/build passed.
-24 real PostgreSQL schema checks passed; synthetic rows rolled back.
-10 isolated PostgreSQL/HTTP scenarios (11 test entries including parent) passed: concurrency/conflicts/identity/skips, permanent/transient/rate/timeouts, failed commit, failed outcome write, pending/stale claim recovery, fencing and legacy rows.
-Six concurrent requests through the API components to an unchanged strict vendor.py instance produced one source row and one vendor acceptance, with zero vendor duplicates/schema rejections.
-Main API retained forced500 outcomes and reused saved records after restart. The user's curl-purchase-001 failed three times while the vendor was deliberately configured mode500; after restoring modeok, explicit retry delivered it with vendorStatus200 and attempts4.
-Vendor /_order confirmed curl-purchase-001 and curl-purchase-003 under customer987654; vendor counters showed two unique accepted events and zero duplicates at observation time.
-API and DB containers are healthy. Existing user rows and DB volume preserved. No new npm dependencies.

## Pending / not executed

No blocking core implementation test is pending. Deferred extended checks:

- Full ~10000-line dataset replay, sustained load/throughput measurement and resource-pressure tuning.
- Plain Linux Engine host-gateway/loopback routing (Desktop routing passed).
- Real process SIGKILL during an in-flight vendor request and actual network packet-loss-after-acceptance. Equivalent stored pending/stale-token/outcome-write failure cases were injected and passed, but these are not the same physical fault test.
- Extended client-disconnect/shutdown-under-load, concurrent retry stampede and long-outage soak tests.
- Public deployment authentication/TLS, production backup/restore, retention/deletion and monitoring alerts are outside this local POC.

## Operational notes

Root make up could not be invoked end-to-end through this agent's sandbox socket permissions; its dependency order was dry-run verified and equivalent approved Compose/migration commands were executed successfully. Normal local-terminal usage is documented in README.

The temporary strict test vendor on host port19001 remains running. Automatic approval policy rejected the tool action to stop it because sandbox approvals are disabled. It is separate from the normal9000 vendor and requires manual cleanup. No further stop workaround was attempted. Automated integration-test containers/databases were cleaned up.
