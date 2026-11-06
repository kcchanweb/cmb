import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import { ApiError } from '../dist/errors.js';
import { ELIGIBLE_EVENTS, fingerprint, normalize, parseProfiles, parseSourceEvent, validSnapshot } from '../dist/events.js';
import { VendorClient } from '../dist/vendor.js';

const uuid = '0ab77988-07fa-42f7-95c8-91ff3add6527';
const source = (patch = {}) => ({
  type: 'track', event: 'purchase', messageId: 'msg-unit-001', deviceId: 'device-unit-001',
  timestamp: '2026-09-01T11:49:25.123456Z', receivedAt: '2026-09-01T12:00:00Z', userId: uuid,
  properties: { revenue: 49.99, currency: 'CAD' },
  context: { app: { version: '2.4.1' }, device: { type: 'ios', advertisingId: 'test-ad-id' } },
  traits: { email: 'test@example.invalid', phone: 'test-only' }, ...patch,
});

test('normalization preserves identity/occurrence time and excludes raw/contact metadata', () => {
  const event = parseSourceEvent(source());
  const payload = normalize(event, new Map([[uuid, '987654']]));
  assert.deepEqual(payload, {
    event_name: 'purchase', event_time: Date.parse(event.timestamp),
    messageId: 'msg-unit-001', device_id: 'device-unit-001', customer_user_id: '987654',
    event_value: event.properties, app_version: '2.4.1', platform: 'ios',
  });
  assert.notEqual(payload.event_time, Date.parse(event.receivedAt));
  assert.equal(event.timestamp, '2026-09-01T11:49:25.123456Z');
  assert.equal('traits' in event, false);
  assert.equal(JSON.stringify(payload).includes('test-ad-id'), false);
});

test('numeric, mapped, unmapped and anonymous identities preserve device attribution', () => {
  const profiles = parseProfiles({ [uuid.toUpperCase()]: '987654' });
  assert.equal(normalize(parseSourceEvent(source()), profiles).customer_user_id, '987654');
  assert.equal(normalize(parseSourceEvent(source({ userId: '000123' })), profiles).customer_user_id, '000123');
  const anonymous = source(); delete anonymous.userId;
  for (const event of [source(), anonymous]) {
    const payload = normalize(parseSourceEvent(event), new Map());
    assert.equal('customer_user_id' in payload, false);
    assert.equal(payload.device_id, 'device-unit-001');
  }
  assert.throws(() => parseProfiles({ [uuid]: 987654 }));
  assert.throws(() => parseProfiles([]));
});

test('only the supplied seven names are eligible, independently of source type', () => {
  assert.deepEqual([...ELIGIBLE_EVENTS], ['purchase', 'complete_registration', 'subscription_started', 'credits_spent', 'match_created', 'message_sent', 'push_opened']);
  for (const event of ELIGIBLE_EVENTS) assert.ok(normalize(parseSourceEvent(source({ type: 'screen', event })), new Map()));
  for (const event of ['app_open', 'screen_view', 'swipe_left', 'Purchase']) assert.equal(normalize(parseSourceEvent(source({ event })), new Map()), null);
});

test('validation rejects invalid dates, identifiers, optional types, unknown fields and unsafe JSON', () => {
  const cases = [null, [], source({ messageId: '' }), source({ deviceId: null }), source({ userId: 'not-a-profile' }),
    source({ timestamp: '2026-02-30T12:00:00Z' }), source({ timestamp: '2026-01-01T25:00:00Z' }),
    source({ timestamp: '2026-01-01' }), source({ timestamp: 1788739200000 }),
    source({ timestamp: '2026-01-01T00:00:00+14:30' }), source({ properties: null }), source({ properties: [] }),
    source({ properties: { overflow: Infinity } }), source({ context: { app: { version: 2 } } }),
    source({ messageId: 'invalid\0id' }), source({ properties: { invalid: '\ud800' } }),
    source({ context: { device: null } }), source({ extra: true }), source({ traits: [] })];
  for (const value of cases) assert.throws(() => parseSourceEvent(value), error => error instanceof ApiError && error.status === 422);
  let deep = {}; for (let i = 0; i < 25; i++) deep = { child: deep };
  assert.throws(() => parseSourceEvent(source({ properties: deep })), /nesting/);
});

test('fingerprints canonicalize object order/timezones and ignore discarded traits', () => {
  const first = parseSourceEvent(source({ properties: { a: 1, b: 2 } }));
  const same = parseSourceEvent(source({ timestamp: '2026-09-01T12:49:25.123456+01:00', properties: { b: 2, a: 1 }, traits: { email: 'different@example.invalid' } }));
  assert.equal(fingerprint(first), fingerprint(same));
  assert.notEqual(fingerprint(first), fingerprint(parseSourceEvent(source({ properties: { a: 1, b: 3 } }))));
});

test('stored snapshot guard rejects tampering and unsafe metadata', () => {
  const payload = normalize(parseSourceEvent(source()), new Map());
  assert.equal(validSnapshot(payload, payload.messageId), true);
  for (const patch of [{ event_name: 'app_open' }, { receivedAt: 'raw' }, { event_value: [] }, { customer_user_id: 'uuid' }, { event_time: 1788739200 }]) {
    assert.equal(validSnapshot({ ...payload, ...patch }, payload.messageId), false);
  }
});

test('vendor retries transient failures with the identical ID and durable pre-attempt callback', async () => {
  let calls = 0, attempts = 0;
  const payload = normalize(parseSourceEvent(source()), new Map());
  const adapter = new VendorClient('http://vendor.invalid', { timeoutMs: 1000, maxAttempts: 3, retryBaseMs: 0 }, async (url, options) => {
    assert.equal(url.href, 'http://vendor.invalid/events');
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['X-Request-ID'], /^[0-9a-f-]{36}$/);
    assert.equal(JSON.parse(options.body).messageId, payload.messageId);
    calls++;
    return Response.json(calls < 3 ? { error: 'transient' } : { accepted: 1 }, { status: calls < 3 ? 500 : 200 });
  });
  const result = await adapter.send(payload, new AbortController().signal, async () => { attempts++; });
  assert.equal(result.status, 'delivered'); assert.equal(calls, 3); assert.equal(attempts, 3);
});

test('vendor permanent failures are not retried, invalid acknowledgements remain uncertain', async () => {
  const payload = normalize(parseSourceEvent(source()), new Map());
  for (const status of [400, 422, 401, 302]) {
    let calls = 0;
    const adapter = new VendorClient('http://vendor.invalid', { timeoutMs: 1000, maxAttempts: 3, retryBaseMs: 0 }, async () => {
      calls++; return Response.json({ private: 'not returned' }, { status });
    });
    assert.equal((await adapter.send(payload, new AbortController().signal, async () => {})).status, 'permanent_failed');
    assert.equal(calls, 1);
  }
  const adapter = new VendorClient('http://vendor.invalid', { timeoutMs: 1000, maxAttempts: 3, retryBaseMs: 0 }, async () => Response.json({ accepted: 0 }));
  assert.equal((await adapter.send(payload, new AbortController().signal, async () => {})).status, 'uncertain');
});

test('rate-limit delay is bounded and persistence failure prevents HTTP dispatch', async () => {
  let calls = 0;
  const payload = normalize(parseSourceEvent(source()), new Map());
  const adapter = new VendorClient('http://vendor.invalid', { timeoutMs: 1000, maxAttempts: 3, retryBaseMs: 0 }, async () => {
    calls++; return Response.json({ retry_after: 60 }, { status: 429 });
  });
  assert.equal((await adapter.send(payload, new AbortController().signal, async () => {})).status, 'retryable_failed');
  assert.equal(calls, 1);
  await assert.rejects(adapter.send(payload, new AbortController().signal, async () => { throw new Error('DB failed'); }));
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await adapter.send(payload, controller.signal, async () => assert.fail());
  assert.equal(calls, 1);
});

test('429 retry hints can recover; oversized acknowledgements are never treated as delivery', async () => {
  const payload = normalize(parseSourceEvent(source()), new Map());
  let calls = 0;
  const adapter = new VendorClient('http://vendor.invalid', { timeoutMs: 1000, maxAttempts: 3, retryBaseMs: 0 }, async () => {
    calls++; return calls === 1 ? Response.json({ retry_after: 0 }, { status: 429 }) : Response.json({ accepted: 1 });
  });
  assert.equal((await adapter.send(payload, new AbortController().signal, async () => {})).status, 'delivered');
  assert.equal(calls, 2);
  const huge = new VendorClient('http://vendor.invalid', { timeoutMs: 1000, maxAttempts: 1, retryBaseMs: 0 }, async () => Response.json({ accepted: 1, extra: 'x'.repeat(9000) }));
  assert.equal((await huge.send(payload, new AbortController().signal, async () => {})).status, 'uncertain');
});

test('admission rejects concurrent overload instead of buffering it', async () => {
  let release, began;
  const pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  const actions = {
    submit: async () => { began(); await pending; return { httpStatus: 201, result: { status: 'delivered' } }; },
    retry: async () => { throw new Error('Unexpected call'); }, status: async () => { throw new Error('Unexpected call'); },
  };
  const server = createApp(async () => {}, actions, { maxActive: 1 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/events`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source()) };
  try {
    const first = fetch(url, options); await started;
    const second = await fetch(url, options); assert.equal(second.status, 503);
    assert.equal((await second.json()).error.code, 'OVERLOADED');
    release(); assert.equal((await first).status, 201);
  } finally { release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('HTTP boundary rejects bad input safely before calling event actions', async () => {
  let calls = 0;
  const actions = {
    submit: async () => { calls++; return { httpStatus: 201, result: { status: 'delivered' } }; },
    retry: async () => { calls++; return { httpStatus: 200, result: { status: 'delivered' } }; },
    status: async () => ({ status: 'delivered' }),
  };
  const server = createApp(async () => {}, actions).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [body, contentType, status] of [
      ['{', 'application/json', 400], ['[]', 'application/json', 422],
      [JSON.stringify(source()), 'text/plain', 415],
      [JSON.stringify(source({ properties: { large: 'x'.repeat(70000) } })), 'application/json', 413],
    ]) {
      const response = await fetch(`${base}/events`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
      assert.equal(response.status, status);
      const result = await response.json();
      assert.ok(result.error.code); assert.ok(result.error.requestId);
      assert.equal(JSON.stringify(result).includes('test-ad-id'), false);
    }
    assert.equal(calls, 0);
    const response = await fetch(`${base}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source()) });
    assert.equal(response.status, 201); assert.equal(calls, 1);
    const retry = await fetch(`${base}/events/not-a-uuid/retry`, { method: 'POST' });
    assert.equal(retry.status, 422);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
