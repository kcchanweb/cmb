import { randomUUID } from 'node:crypto';
import express from 'express';

export function createApp(checkDatabase: () => Promise<void>): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/ready', async (_request, response) => {
    try {
      await checkDatabase();
      response.json({ status: 'ready' });
    } catch {
      // Readiness failure is an expected, explicitly surfaced outcome. Never
      // expose connection strings or database diagnostics in the probe body.
      response.status(503).json({ status: 'not_ready' });
    }
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        requestId: randomUUID(),
      },
    });
  });

  return app;
}
