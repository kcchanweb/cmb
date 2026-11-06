import { Pool } from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

async function start(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = new Pool({
    ...config.database,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
    query_timeout: 3500,
  });
  pool.on('error', () => {
    console.error(JSON.stringify({ event: 'database_pool_error' }));
  });

  try {
    await pool.query('SELECT 1');
  } catch {
    await pool.end();
    throw new Error('Database startup check failed');
  }

  const app = createApp(async () => { await pool.query('SELECT 1'); });
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'api_listening', port: config.port }));
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.on('error', () => {
    console.error(JSON.stringify({ event: 'http_server_error' }));
    process.exit(1);
  });

  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      console.error(JSON.stringify({ event: 'shutdown_timeout' }));
      process.exit(1);
    }, 10000);
    deadline.unref();
    server.close(() => {
      pool.end().then(() => {
        clearTimeout(deadline);
      }).catch(() => {
        console.error(JSON.stringify({ event: 'database_shutdown_error' }));
        process.exit(1);
      });
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch(() => {
  console.error(JSON.stringify({ event: 'startup_failed' }));
  process.exit(1);
});
