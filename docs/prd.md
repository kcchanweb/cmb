# Event relay product brief

Status: accepted product baseline. The user replied “accept” on 2026-11-06 to the proposed scope, normalization policies, and acceptance criteria. Init-project is complete; architecture is in progress; the reviewed initial source-event table is implemented, broader data design is in progress, and incoming event/status/retry contracts and direct delivery are now implemented for the explicit local POC request. The user subsequently authorized a bounded Compose/Express health skeleton, now implemented and verified.

## Problem and audience

The user requests an API endpoint that accepts events, writes them to PostgreSQL, normalizes them, and forwards them to a downstream API. The existing exercise provides mobile analytics events, profile lookup data, and a fixed vendor stub. The intended users are an event-producing client and a developer/operator who needs to verify delivery and diagnose failures. This audience was inferred from the exercise and included in the accepted baseline.

User-supplied stack, verbatim: “Tech stack: node.js/typescript, psql.” Node.js/TypeScript and PostgreSQL are selected. The user subsequently selected separate API/database containers on one shared network with a host-run vendor; Express and the container skeleton versions/configuration are now selected in tech-stack.md. The reviewed source-event fields plus a UUID identifier are now implemented in PostgreSQL. Intake/status/explicit-retry contracts and durable delivery state are now implemented; production auth/retention/operations remain open.

## Scope and journeys

Accepted first slice: accept source events, retain accepted data in PostgreSQL, normalize to the vendor shape, deliver it, and make delivery outcomes observable. The user subsequently selected request-owned direct delivery after database persistence, without fan-out or queues. The observation interface remains unselected.

1. A producer submits a valid event with an eligible event name. It is retained and delivered with its original messageId.
2. Numeric, mapped UUID, unmapped UUID, and anonymous identities are handled according to the accepted policies below while preserving device attribution.
3. Invalid input or downstream failure occurs. The operator can distinguish validation, unresolved identity, pending delivery, permanent rejection, and successful delivery; retained work is not silently lost.

Accepted exclusions: UI/dashboard, multi-vendor routing, vendor changes, vendor-side deduplication implementation, historical timestamp sorting, and production deployment. File replay tooling, batch delivery, and ordering guarantees are not required for this first slice.

## Rules established by the repository

Sources: [exercise README](../README.md) and [vendor implementation](../vendor.py). These describe the existing external service, not a new intake API design.

- The documented real-time endpoint accepts one event per POST /events. The code also supports /events/batch, up to 50 events; its existence does not require using it.
- Payloads must be objects. Required fields: event_name (string), event_time (integer epoch milliseconds). The stub additionally requires 1000000000000 < event_time < 10000000000000 and rejects boolean event_time values.
- Optional fields: customer_user_id, device_id, app_version, platform, messageId (strings), and event_value (object). Omit absent optional values; explicit null fails validation. Unknown top-level fields are rejected.
- Numeric source user IDs need no lookup. UUID source user IDs require profiles.json to obtain an internal numeric profile ID. Some lookups intentionally have no result.
- device_id is the attribution identifier; customer_user_id is the warehouse join key. The vendor accepts events missing either or both. This permissiveness does not itself choose our product policy.
- Preserve messageId through transformations and retries. The exercise assumes downstream deduplication by messageId; the stub reports repeated accepted deliveries and includes them in events_received.
- timestamp and receivedAt differ; arrivals are not in occurrence order. Registration events include traits.email and traits.phone.
- Vendor 400 rejection and 422 validation failures are permanent for the unchanged submission. Vendor 429 and 500 are retryable. Timeout mode waits 30 seconds then returns 504 without accepting the event. Schema validation precedes injected failures.
- Do not edit vendor.py. Keep strict validation enabled for the exercise and demonstration.

## Accepted normalization policies

The mappings and policies below originated as recommendations and were accepted by the user on 2026-11-06. The vendor defines destination names and types, but does not prescribe every source mapping or eligibility rule.

| Source | Accepted destination / handling |
| --- | --- |
| event | event_name, unchanged |
| timestamp | event_time, converted to integer epoch milliseconds; reject missing/invalid values instead of substituting receivedAt |
| Numeric userId | customer_user_id as the original string ID |
| UUID userId with profile match | customer_user_id as the mapped internal ID string |
| Unmatched UUID or absent userId | Omit customer_user_id; retain device_id and record whether the lookup failed or identity was absent |
| deviceId | device_id, unchanged |
| properties | event_value if present as an object; invalid types fail validation |
| context.app.version | app_version if present as a string |
| context.device.type | platform if present as a string; use the seed's ios/android values |
| messageId | messageId, unchanged |

Additional accepted rules:

- Forward only the exact event names in the user-supplied [vendor contract](vendor-payload-contract.json): purchase, complete_registration, subscription_started, credits_spent, match_created, message_sent, push_opened. This newer explicit rule supersedes the earlier all-event-names policy; no separate source-type filter is specified. Ineligible names must never trigger a vendor call; intake/storage handling remains to be designed.
- Require nonempty messageId and deviceId for this slice, although the vendor makes both optional. Valid fixtures provide both. Do not fabricate missing identifiers or send an unresolved UUID as an internal customer ID.
- Build an allowlisted outbound payload. Exclude type, receivedAt, raw userId, raw context, traits.email, traits.phone, and advertisingId. Do not move excluded metadata into event_value. The vendor allows arbitrary event_value keys; a broader sensitive-property policy and retained-input privacy policy remain future review items.
- Malformed JSON and invalid source values fail visibly and are not forwarded. A bad event must not prevent later valid submissions from being processed. Intake error shapes remain a later contract decision.
- Gate vendor delivery on database-enforced messageId deduplication. Duplicate intake, including concurrent submissions, must not start a second delivery for the same event. Already-confirmed delivered events are not resent. Same-ID/different-content submissions are conflicts; failed or uncertain delivery attempts remain subject to the explicit retry/recovery policy, using the same ID. This requirement was explicitly supplied by the user after baseline acceptance.
- Retain visible delivery outcomes. Retry transient failures with bounds, preserving messageId; do not automatically retry unchanged permanent failures. Attempt limits, timeouts, scheduling, concurrency, and recovery mechanisms remain later design choices.
- Retained unfinished work should be recoverable after restart. Exactly-once HTTP delivery and chronological ordering are not promised by this accepted scope.

## Observable acceptance criteria

These are accepted requirements for future behavior. The initial persistence constraints and the local end-to-end behaviors below are implemented and tested; the separate health/configuration skeleton has passed its infrastructure tests.

| ID | Scenario | Expected observation |
| --- | --- | --- |
| AC-01 | Valid eligible numeric-user event | Retained in PostgreSQL; strict vendor accepts mapped fields with unchanged messageId/deviceId and occurrence time in milliseconds. |
| AC-02 | Eligible event with UUID found in profiles.json | Forwarded customer_user_id equals the mapped internal ID string. |
| AC-03 | Eligible event with UUID missing from lookup or userId absent | Delivered with device_id and without customer_user_id; the outcome distinguishes missing mapping from absent identity. |
| AC-04 | Registration event carries contact and advertising metadata | Outbound payload excludes traits, email, phone, raw context, and advertisingId. |
| AC-05 | Malformed JSON, invalid timestamp/properties type, or missing messageId/deviceId | Visible validation failure, no forwarding; a later valid event still succeeds. |
| AC-06 | Vendor 400 or 422 | Permanent rejection and reason remain observable; unchanged payload is not automatically retried. |
| AC-07 | Vendor 429, 500, or timeout followed by recovery | Retained work is not silently lost; retries are bounded and preserve messageId. |
| AC-08 | Restart with unfinished retained events | Work can be recovered with original messageIds; duplicate attempts are recognized under the exercise assumption. |
| AC-09 | timestamp differs from receivedAt | event_time reflects timestamp, independent of arrival order. |
| AC-10 | Identical event is submitted repeatedly or concurrently with the same messageId | One durable event identity and one coordinated delivery flow; duplicate intake does not produce another vendor send. A repeat after confirmed success reuses the result. |
| AC-11 | A messageId is reused for different event content | The conflict is visible; the existing event is not overwritten or newly sent. |
| AC-12 | An otherwise valid event has a name outside the seven-name allowlist | No vendor request is initiated; ineligibility is distinguishable from confirmed delivery, independently of the permissive local stub. |

## Constraints and remaining design work

- Exercise input is approximately 10,000 lines, including deliberately malformed JSON. No throughput target, latency target, time budget, or additional interview rules were supplied.
- Demonstration should reconcile valid, rejected, pending, permanently failed, and delivered outcomes. Use vendor unique_message_ids and duplicates with local outcomes; events_received alone does not prove unique delivery. README example totals are illustrative.
- Authentication, retention, access control, delivery-state schema, and detailed event-processing settings remain unselected. The API/database containers and host vendor are selected; queues and background consumers are deferred for this POC. Do not record credentials or full event bodies in task logs. Production privacy and access requirements remain outside this exercise baseline.
- Product review completed on 2026-11-06: the initial all-events forwarding rule is superseded by the later user-supplied seven-name allowlist. Device-only missing-profile handling, mappings, stricter source identifiers, and recovery expectations remain accepted. Intake/storage behavior for ineligible names remains a later contract/data decision.
- Next: complete architecture decisions for the selected direct-call/container topology, then design data and intake contracts. Product scaffolding does not establish architecture readiness or a built app.

Source-field review: the user reviewed the README-based field list and requested a UUID table identifier, accepting the rest. The internal id is a database-generated UUID; message_id remains the separately unique source identity. See [data-model.md](data-model.md) for the implemented mapping and deliberately open delivery-state schema.

Implementation evidence: the explicit API build request now exercises these criteria via17 unit/HTTP tests,10 PostgreSQL integration scenarios,24 source-schema checks and a live strict-stub smoke. Valid unsupported events are stored as skipped; explicit retry/status endpoints replace the earlier unspecified recovery mechanism. See testing.md for exact scope and actual results. No production availability/auth/retention claim follows from this local verification.
