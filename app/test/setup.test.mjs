import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import { loadConfig } from '../dist/config.js';

async function withServer(checkDatabase, run) {
  const server = createApp(checkDatabase).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('liveness remains available when the database is unavailable', async () => {
  await withServer(async () => { throw new Error('private-db-diagnostic'); }, async base => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('readiness follows database availability and redacts failures', async () => {
  let ready = false;
  await withServer(async () => {
    if (!ready) throw new Error('private-db-diagnostic');
  }, async base => {
    const failed = await fetch(`${base}/ready`);
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { status: 'not_ready' });
    ready = true;
    const recovered = await fetch(`${base}/ready`);
    assert.equal(recovered.status, 200);
    assert.deepEqual(await recovered.json(), { status: 'ready' });
  });
});

test('unknown routes return a safe correlated JSON error', async () => {
  await withServer(async () => {}, async base => {
    const response = await fetch(`${base}/events`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
  });
});

const env = {
  PGHOST: 'db', PGDATABASE: 'event_relay', PGUSER: 'event_relay_app',
  PGPASSWORD: 'test-only-placeholder', VENDOR_BASE_URL: 'http://host.docker.internal:9000',
};

test('configuration rejects missing credentials and invalid ports', () => {
  assert.equal(loadConfig(env).database.user, 'event_relay_app');
  assert.throws(() => loadConfig({ ...env, PGPASSWORD: '' }), /PGPASSWORD/);
  for (const value of ['0', '65536', '3000oops', '1.5']) {
    assert.throws(() => loadConfig({ ...env, PORT: value }), /PORT/);
  }
});

test('vendor configuration rejects credentials, non-HTTP schemes and paths', () => {
  for (const value of ['invalid', 'file:///tmp/data', 'http://user:secret@vendor', 'http://vendor/events', 'http://vendor/?token=secret']) {
    assert.throws(() => loadConfig({ ...env, VENDOR_BASE_URL: value }), /VENDOR_BASE_URL/);
  }
});
