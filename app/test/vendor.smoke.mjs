// Explicit opt-in smoke test against a separately started strict vendor stub.
// Creates one retained synthetic event; never resets or changes vendor controls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Pool } from 'pg';
import { createApp } from '../dist/app.js';
import { EventRepository } from '../dist/repository.js';
import { EventService } from '../dist/service.js';
import { VendorClient } from '../dist/vendor.js';

const vendorUrl = process.env.VENDOR_BASE_URL;
assert.ok(vendorUrl, 'Set the separate test-vendor origin explicitly.');
const pool = new Pool({ max: 5, connectionTimeoutMillis: 2000, query_timeout: 3500 });
const service = new EventService(new EventRepository(pool), new VendorClient(vendorUrl, {
  timeoutMs: 2000, maxAttempts: 3, retryBaseMs: 100,
}), new Map());
const api = createApp(async () => { await pool.query('SELECT 1'); }, service).listen(0, '0.0.0.0');
await once(api, 'listening');
const source = {
  type: 'track', event: 'purchase', messageId: `strict-smoke-${randomUUID()}`,
  deviceId: 'strict-smoke-device', userId: '987654',
  timestamp: '2026-09-01T11:49:25Z', receivedAt: '2026-09-01T12:00:00Z',
  properties: { revenue: 49.99, currency: 'CAD', sku: 'demo-product' },
  context: { app: { version: '2.4.1' }, device: { type: 'ios' } },
};
async function stats() {
  const response = await fetch(new URL('/_stats', vendorUrl), { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200); return response.json();
}
try {
  const before = await stats();
  assert.equal(before.config.strict, true); assert.equal(before.config.mode, 'ok');
  const responses = await Promise.all(Array.from({ length: 6 }, async () => {
    const response = await fetch(`http://127.0.0.1:${api.address().port}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source),
    });
    return { status: response.status, body: await response.json() };
  }));
  assert.equal(responses.filter(item => item.status === 201).length, 1);
  assert.ok(responses.every(item => [200, 201, 202].includes(item.status)));
  const delivered = responses.find(item => item.status === 201).body;
  assert.equal(delivered.status, 'delivered'); assert.equal(delivered.attempts, 1);
  const after = await stats();
  assert.equal(after.events_received - before.events_received, 1);
  assert.equal(after.schema_rejected - before.schema_rejected, 0);
  assert.equal(after.duplicates - before.duplicates, 0);
  assert.equal((await pool.query('SELECT id FROM public.events WHERE message_id=$1', [source.messageId])).rows.length, 1);
  console.log(JSON.stringify({ strictVendorAccepted: true, concurrentRequests: 6, sourceRows: 1, vendorDeliveries: 1, eventId: delivered.eventId }));
} finally {
  api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); await pool.end();
}
