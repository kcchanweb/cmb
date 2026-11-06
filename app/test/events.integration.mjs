import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../dist/app.js';
import { normalize, parseSourceEvent } from '../dist/events.js';
import { EventRepository } from '../dist/repository.js';
import { EventService } from '../dist/service.js';
import { VendorClient } from '../dist/vendor.js';

test('real PostgreSQL and HTTP event pipeline', async t => {
  const pool = new Pool({ max: 5, connectionTimeoutMillis: 2000, statement_timeout: 3000, query_timeout: 3500 });
  const repository = new EventRepository(pool);
  const profileId = '0ab77988-07fa-42f7-95c8-91ff3add6527';
  const profiles = new Map([[profileId, '987654']]);
  const calls = [], mockErrors = [];
  let mode = 'ok';
  const mock = createServer(async (request, response) => {
    try {
      const parts = []; for await (const part of request) parts.push(part);
      const payload = JSON.parse(Buffer.concat(parts).toString());
      calls.push(payload);
      assert.equal(request.url, '/events');
      assert.equal(request.method, 'POST');
      assert.match(request.headers['x-request-id'], /^[0-9a-f-]{36}$/);
      const allowed = new Set(['event_name', 'event_time', 'customer_user_id', 'device_id', 'event_value', 'app_version', 'platform', 'messageId']);
      assert.ok(Object.keys(payload).every(key => allowed.has(key)));
      assert.ok(Number.isInteger(payload.event_time) && payload.event_time > 1e12);
      const { rows } = await pool.query('SELECT id FROM public.events WHERE message_id=$1', [payload.messageId]);
      assert.equal(rows.length, 1, 'source event must be committed before the vendor sees it');
      if (mode === 'hang') return;
      response.setHeader('Content-Type', 'application/json');
      if (mode === 'reject') { response.writeHead(422); response.end(JSON.stringify({ private: 'DO-NOT-EXPOSE' })); }
      else if (mode === '500') { response.writeHead(500); response.end('{}'); }
      else if (mode === '429') { response.writeHead(429); response.end('{"retry_after":0}'); }
      else if (mode === 'invalid') response.end('{"accepted":0}');
      else response.end('{"accepted":1}');
    } catch (error) {
      mockErrors.push(error.message);
      response.writeHead(500); response.end('{}');
    }
  });
  mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
  const vendor = new VendorClient(`http://127.0.0.1:${mock.address().port}`, { timeoutMs: 100, maxAttempts: 1, retryBaseMs: 0 });
  const service = new EventService(repository, vendor, profiles);
  const api = createApp(async () => { await pool.query('SELECT 1'); }, service).listen(0, '127.0.0.1');
  await once(api, 'listening');
  const base = `http://127.0.0.1:${api.address().port}`;
  const event = (patch = {}) => ({
    type: 'track', event: 'purchase', messageId: `integration-${randomUUID()}`, deviceId: 'integration-device',
    timestamp: '2026-09-01T11:49:25.123456Z', receivedAt: '2026-09-01T12:00:00Z', userId: '000123',
    properties: { revenue: 49.99, currency: 'CAD' },
    context: { app: { version: '2.4.1' }, device: { type: 'ios', advertisingId: 'private-ad-id' } },
    traits: { email: 'test@example.invalid', phone: 'test-only' }, ...patch,
  });
  async function post(payload) {
    const response = await fetch(`${base}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }
  async function retry(id) {
    const response = await fetch(`${base}/events/${id}/retry`, { method: 'POST' });
    return { status: response.status, body: await response.json() };
  }
  try {
    await t.test('concurrent duplicates create one row and one vendor call; safe status lookup', async () => {
      const input = event(); const before = calls.length;
      const responses = await Promise.all(Array.from({ length: 8 }, () => post(input)));
      assert.equal(responses.filter(r => r.status === 201).length, 1);
      assert.ok(responses.every(r => [200, 201, 202].includes(r.status)));
      assert.equal(new Set(responses.map(r => r.body.eventId)).size, 1);
      assert.equal(calls.length - before, 1);
      const id = responses[0].body.eventId;
      const repeated = await post(input); assert.equal(repeated.status, 200); assert.equal(repeated.body.duplicate, true);
      assert.equal(repeated.body.status, 'delivered'); assert.equal(repeated.body.attempts, 1);
      const { rows } = await pool.query('SELECT * FROM public.events WHERE message_id=$1', [input.messageId]);
      assert.equal(rows.length, 1); assert.equal(rows[0].user_id, '000123');
      assert.deepEqual(rows[0].properties, input.properties); assert.deepEqual(rows[0].context, input.context);
      assert.equal(calls.at(-1).event_time, Date.parse(input.timestamp));
      assert.equal(calls.at(-1).customer_user_id, '000123');
      assert.equal(JSON.stringify(calls.at(-1)).includes('private-ad-id'), false);
      const status = await (await fetch(`${base}/events/${id}`)).json();
      assert.equal(status.status, 'delivered'); assert.equal('context' in status, false);
      const conflict = await post({ ...input, properties: { revenue: 100 } });
      assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'MESSAGE_ID_CONFLICT');
      assert.equal(calls.length - before, 1);
    });

    await t.test('mapped, unmapped and anonymous events preserve device attribution', async () => {
      for (const userId of [profileId, randomUUID(), undefined]) {
        const input = event(); if (userId === undefined) delete input.userId; else input.userId = userId;
        assert.equal((await post(input)).status, 201);
        assert.equal(calls.at(-1).device_id, input.deviceId);
        assert.equal(calls.at(-1).customer_user_id, userId === profileId ? '987654' : undefined);
      }
    });

    await t.test('ineligible events are retained as skipped and never forwarded', async () => {
      const before = calls.length; const input = event({ event: 'app_open' });
      const first = await post(input); assert.equal(first.status, 201); assert.equal(first.body.status, 'skipped');
      assert.equal((await post(input)).status, 200); assert.equal(calls.length, before);
      assert.equal((await retry(first.body.eventId)).body.status, 'skipped'); assert.equal(calls.length, before);
    });

    await t.test('permanent vendor failures remain stored and cannot be blindly retried', async () => {
      mode = 'reject'; const input = event(); const before = calls.length;
      const first = await post(input); assert.equal(first.status, 502); assert.equal(first.body.status, 'permanent_failed');
      assert.equal(JSON.stringify(first).includes('DO-NOT-EXPOSE'), false);
      assert.equal((await post(input)).status, 200);
      assert.equal((await retry(first.body.eventId)).status, 200); assert.equal(calls.length - before, 1);
      mode = 'ok';
    });

    await t.test('transient failure is retained; explicit retry uses the frozen mapped payload', async () => {
      mode = '500'; const input = event({ userId: profileId }); const before = calls.length;
      const first = await post(input); assert.equal(first.status, 503); assert.equal(first.body.status, 'retryable_failed');
      assert.equal((await post(input)).status, 200); assert.equal(calls.length - before, 1);
      profiles.set(profileId, '111111'); mode = 'ok';
      const recovered = await retry(first.body.eventId);
      assert.equal(recovered.status, 200); assert.equal(recovered.body.status, 'delivered'); assert.equal(recovered.body.attempts, 2);
      assert.equal(calls.at(-1).customer_user_id, '987654');
      assert.equal((await retry(first.body.eventId)).status, 200); assert.equal(calls.length - before, 2);
      profiles.set(profileId, '987654');
    });

    await t.test('rate limit and timeout outcomes are distinguishable and recoverable', async () => {
      mode = '429'; const limited = await post(event());
      assert.equal(limited.status, 503); assert.equal(limited.body.errorCode, 'vendor_rate_limited');
      mode = 'hang'; const input = event(); const timed = await post(input);
      assert.equal(timed.status, 504); assert.equal(timed.body.status, 'uncertain');
      const before = calls.length; assert.equal((await post(input)).status, 200); assert.equal(calls.length, before);
      mode = 'ok'; assert.equal((await retry(timed.body.eventId)).body.status, 'delivered');
    });

    await t.test('a failed COMMIT rolls back input and prevents all vendor traffic', async () => {
      await pool.query(`CREATE FUNCTION public.test_reject_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test commit failure'; END $$`);
      await pool.query(`CREATE CONSTRAINT TRIGGER test_reject_commit AFTER INSERT ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.test_reject_commit()`);
      const input = event(); const before = calls.length;
      try {
        const failed = await post(input); assert.equal(failed.status, 503); assert.equal(failed.body.error.code, 'PERSISTENCE_ERROR');
        assert.equal(calls.length, before);
        assert.equal((await pool.query('SELECT id FROM public.events WHERE message_id=$1', [input.messageId])).rows.length, 0);
      } finally {
        await pool.query('DROP TRIGGER test_reject_commit ON public.events');
        await pool.query('DROP FUNCTION public.test_reject_commit()');
      }
    });

    await t.test('accepted vendor result with failed outcome write does not resend on duplicate intake', async () => {
      await pool.query(`CREATE FUNCTION public.test_reject_outcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='delivered' THEN RAISE EXCEPTION 'test outcome failure'; END IF; RETURN NEW; END $$`);
      await pool.query(`CREATE TRIGGER test_reject_outcome BEFORE UPDATE ON public.event_deliveries FOR EACH ROW EXECUTE FUNCTION public.test_reject_outcome()`);
      const input = event(); const before = calls.length;
      let id;
      try {
        const failed = await post(input); assert.equal(failed.status, 503);
        const existing = await post(input); assert.equal(existing.status, 202); id = existing.body.eventId;
        assert.equal(existing.body.status, 'sending'); assert.equal(calls.length - before, 1);
      } finally {
        await pool.query('DROP TRIGGER test_reject_outcome ON public.event_deliveries');
        await pool.query('DROP FUNCTION public.test_reject_outcome()');
      }
      await pool.query("UPDATE public.event_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1", [id]);
      assert.equal((await retry(id)).body.status, 'delivered');
      assert.equal(calls.at(-1).messageId, input.messageId);
    });

    await t.test('restart-style pending/stale work is recoverable and old tokens cannot overwrite a newer outcome', async () => {
      const input = parseSourceEvent(event());
      const stored = await repository.accept(input, normalize(input, profiles));
      const old = await repository.claim(stored.delivery.event_id);
      await pool.query("UPDATE public.event_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1", [old.event_id]);
      const restarted = new EventService(new EventRepository(pool), vendor, profiles);
      assert.equal((await restarted.retry(old.event_id, new AbortController().signal)).result.status, 'delivered');
      await assert.rejects(repository.finish(old.event_id, old.lease_token, { status: 'uncertain', httpStatus: null, errorCode: 'stale' }), error => error.code === 'DELIVERY_OWNERSHIP_LOST');
      assert.equal((await repository.get(old.event_id)).status, 'delivered');
      const pendingInput = parseSourceEvent(event());
      const pending = await repository.accept(pendingInput, normalize(pendingInput, profiles));
      assert.equal((await retry(pending.delivery.event_id)).body.status, 'delivered');
    });

    await t.test('pre-existing source rows without delivery metadata are not silently resent', async () => {
      const input = event(); const before = calls.length;
      await pool.query(`INSERT INTO public.events (event_type,event_name,message_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5)`,
        [input.type, input.event, input.messageId, input.deviceId, input.timestamp]);
      const response = await post(input); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'EVENT_NOT_TRACKED');
      assert.equal(calls.length, before);
    });
    assert.deepEqual(mockErrors, []);
  } finally {
    api.closeAllConnections(); mock.closeAllConnections();
    await Promise.all([new Promise(resolve => api.close(resolve)), new Promise(resolve => mock.close(resolve))]);
    await pool.end();
  }
});
