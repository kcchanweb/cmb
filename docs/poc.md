# Proof of Concept (POC)

## Scope

The POC focuses on an API endpoint that:

- Accepts incoming events.
- Writes events directly to the database, one at a time, without batching.
- Deduplicates events before forwarding them to the vendor API.

The following infrastructure is outside the POC's scope:

- SNS fan-out.
- SQS queuing.
- Batched database writes.

Because of time and local environment constraints, I cannot reliably reproduce
the full production setup locally. The POC therefore focuses on the core event
processing flow.

## Production Extensions

For production, the implementation should be extended to:

- Batch incoming events and insert them into the database in batches.
- Retry vendor API calls, using exponential backoff when requests are rate-limited.

## Tested

Test results have not been documented yet.

## Still to Do

Remaining tasks have not been listed yet.
