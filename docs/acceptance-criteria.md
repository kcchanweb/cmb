# Acceptance Criteria Checklist: Nimbus Analytics Integration

## 1. Event Ingest & Event Names
- [ ] Only the following 7 event names are accepted:
  - `purchase`
  - `complete_registration`
  - `subscription_started`
  - `credits_spent`
  - `match_created`
  - `message_sent`
  - `push_opened`
- [ ] Any event name outside of these 7 is rejected.

## 2. Payload Structure & Field Validation
- [ ] `event_name` (string): Required. Source event name, unchanged.
- [ ] `event_time` (int): Required. Epoch milliseconds derived from `timestamp`, not `receivedAt`.
- [ ] `customer_user_id` (string): Optional. Numeric profile ID representing the warehouse join key.
- [ ] `device_id` (string): Optional. Device ID used for attribution.
- [ ] `event_value` (object): Optional payload data.
- [ ] `app_version` (string): Optional.
- [ ] `platform` (string): Optional.
- [ ] `messageId` (string): Optional. Used for deduplication.
- [ ] Unknown or unauthorized fields are strictly rejected.

## 3. Deduplication & Error Handling
- [ ] Repeated event submissions carrying the same `messageId` are acknowledged successfully but processed only once.
- [ ] Invalid payloads (such as missing required fields or incorrect data types) return an HTTP 422 error response containing details.