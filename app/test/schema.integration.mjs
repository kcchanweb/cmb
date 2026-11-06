// Run via make test-db. All synthetic data is rolled back, including on failure.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({
  max: 1,
  connectionTimeoutMillis: 2000,
  statement_timeout: 5000,
  query_timeout: 6000,
});
let client;
let checks = 0;
let success = false;

const base = {
  event_type: 'track',
  event_name: 'purchase',
  message_id: `schema-test-${randomUUID()}`,
  occurred_at: '2026-09-01T11:49:25.123Z',
  received_at: '2026-09-01T12:00:00Z',
  user_id: '000987654',
  device_id: 'schema-test-device',
  properties: { revenue: 49.99, currency: 'CAD', sku: 'test-product' },
  context: {
    app: { version: '2.4.1' },
    device: { type: 'ios', advertisingId: 'test-advertising-id' },
    os: { name: 'iOS', version: '17.4' },
    locale: 'en-CA',
  },
};

// Column names come only from controlled test objects below, never requests.
async function insert(overrides = {}) {
  const event = { ...base, message_id: `schema-test-${randomUUID()}`, ...overrides };
  const keys = Object.keys(event);
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  const { rows } = await client.query(
    `INSERT INTO public.events (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    Object.values(event),
  );
  return rows[0];
}

async function rejected(overrides, expectedCode, expectedConstraint) {
  await client.query('SAVEPOINT invalid_event');
  try {
    await assert.rejects(insert(overrides), error => {
      assert.equal(error.code, expectedCode);
      if (expectedConstraint) assert.equal(error.constraint, expectedConstraint);
      return true;
    });
    checks += 1;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_event');
    await client.query('RELEASE SAVEPOINT invalid_event');
  }
}

try {
  client = await pool.connect();
  await client.query('BEGIN');
  const first = await insert();
  const second = await insert();
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first.id, second.id);
  assert.equal(first.user_id, '000987654');
  assert.equal(first.occurred_at.toISOString(), base.occurred_at);
  assert.equal(first.received_at.toISOString(), '2026-09-01T12:00:00.000Z');
  assert.deepEqual(first.properties, base.properties);
  assert.deepEqual(first.context, base.context);
  checks += 1;

  const sparse = await insert({
    user_id: null, received_at: null, properties: null, context: null,
  });
  assert.equal(sparse.user_id, null);
  assert.equal(sparse.received_at, null);
  assert.equal(sparse.properties, null);
  assert.equal(sparse.context, null);
  const uuidUser = randomUUID();
  assert.equal((await insert({ user_id: uuidUser, properties: {}, context: {} })).user_id, uuidUser);
  checks += 1;

  await rejected({ message_id: first.message_id }, '23505', 'events_message_id_key');
  await rejected({ id: first.id }, '23505', 'events_pkey');
  for (const column of ['event_type', 'event_name', 'message_id', 'device_id', 'occurred_at']) {
    await rejected({ [column]: null }, '23502');
  }
  for (const [column, constraint] of [
    ['event_type', 'events_type_nonblank'],
    ['event_name', 'events_name_nonblank'],
    ['message_id', 'events_message_id_nonblank'],
    ['device_id', 'events_device_id_nonblank'],
    ['user_id', 'events_user_id_nonblank'],
  ]) {
    await rejected({ [column]: ' \t\n ' }, '23514', constraint);
  }
  for (const column of ['properties', 'context']) {
    for (const invalid of ['[]', 'null', '42', '"text"']) {
      await rejected({ [column]: invalid }, '23514', `events_${column}_object`);
    }
  }
  await rejected({ occurred_at: 'infinity' }, '23514', 'events_occurred_at_finite');
  await rejected({ received_at: '-infinity' }, '23514', 'events_received_at_finite');
  success = true;
} catch (error) {
  console.error('Schema regression check failed.', {
    category: error?.name ?? 'Error', code: error?.code ?? 'assertion',
  });
  process.exitCode = 1;
} finally {
  try {
    if (client) await client.query('ROLLBACK');
  } catch {
    success = false;
    process.exitCode = 1;
    console.error('Schema regression transaction cleanup failed.');
  } finally {
    client?.release();
    await pool.end();
  }
}

if (success) {
  console.log(JSON.stringify({ schemaChecksPassed: checks, testData: 'rolled back' }));
}
