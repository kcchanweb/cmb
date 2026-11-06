import { randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from './errors.js';
import { isObject, parseSourceEvent, UUID } from './events.js';
import type { EventActions } from './service.js';

export function createApp(
  checkDatabase: () => Promise<void>,
  events?: EventActions,
  options: { requestTimeoutMs?: number; maxActive?: number } = {},
): express.Express {
  const app = express();
  app.disable('x-powered-by');
  const ids = new WeakMap<express.Request, string>();
  app.use((request, response, next) => {
    const id = randomUUID();
    ids.set(request, id);
    response.setHeader('X-Request-ID', id);
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  if (events) {
    let active = 0;
    const admission: RequestHandler = (_request, response, next) => {
      if (active >= (options.maxActive ?? 16)) return next(new ApiError(503, 'OVERLOADED', 'Too many active event requests.'));
      active += 1;
      let released = false;
      const release = (): void => { if (!released) { active -= 1; released = true; } };
      response.once('finish', release);
      response.once('close', release);
      next();
    };
    const jsonOnly: RequestHandler = (request, _response, next) => {
      if (!request.is('application/json')) return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.'));
      next();
    };
    const parser = express.json({ limit: '64kb', strict: false, inflate: false });
    const mutate = (retry: boolean): RequestHandler => async (request, response) => {
      const started = performance.now();
      const requestId = ids.get(request) ?? randomUUID();
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? 15000);
      const closed = (): void => { if (!response.writableEnded) controller.abort(); };
      response.once('close', closed);
      try {
        let outcome;
        if (retry) {
          const id = request.params['id'];
          if (typeof id !== 'string' || !UUID.test(id)) throw new ApiError(422, 'INVALID_EVENT_ID', 'Use the internal event UUID.');
          const input: unknown = request.body;
          if (input !== undefined && (!isObject(input) || Object.keys(input).length !== 0)) throw new ApiError(422, 'INVALID_RETRY', 'Retry uses the saved payload; supply no fields.');
          outcome = await events.retry(id, controller.signal, requestId);
        } else {
          const input: unknown = request.body;
          outcome = await events.submit(parseSourceEvent(input), controller.signal, requestId);
        }
        console.info(JSON.stringify({ event: 'event_outcome', requestId,
          eventId: outcome.result.eventId, status: outcome.result.status,
          attempts: outcome.result.attempts, vendorStatus: outcome.result.vendorStatus,
          errorCode: outcome.result.errorCode, durationMs: Math.round(performance.now() - started),
        }));
        if (!response.destroyed) response.status(outcome.httpStatus).json(outcome.result);
      } finally {
        clearTimeout(deadline);
        response.off('close', closed);
      }
    };
    app.post('/events', admission, jsonOnly, parser, mutate(false));
    app.post('/events/:id/retry', admission, (request, response, next) => {
      // Empty retry bodies need no Content-Type; supplied bodies must be JSON.
      if (request.headers['content-length'] === undefined && request.headers['transfer-encoding'] === undefined || request.headers['content-length'] === '0') return next();
      return jsonOnly(request, response, next);
    }, parser, mutate(true));
    app.get('/events/:id', admission, async (request, response) => {
      const id = request.params['id'];
      if (typeof id !== 'string' || !UUID.test(id)) throw new ApiError(422, 'INVALID_EVENT_ID', 'Use the internal event UUID.');
      response.json(await events.status(id));
    });
  }

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
        requestId: ids.get(_request) ?? randomUUID(),
      },
    });
  });

  const errors: ErrorRequestHandler = (error: unknown, request, response, _next) => {
    let failure = error instanceof ApiError ? error : null;
    if (!failure && isObject(error)) {
      if (error['type'] === 'entity.parse.failed') failure = new ApiError(400, 'INVALID_JSON', 'Malformed JSON body.');
      if (error['type'] === 'entity.too.large') failure = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Body exceeds 64KiB.');
      if (error['status'] === 415) failure = new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported content encoding or charset.');
    }
    failure ??= new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    const requestId = ids.get(request) ?? randomUUID();
    if (failure.status >= 500) console.error(JSON.stringify({ event: 'request_failed', requestId, code: failure.code }));
    if (!response.destroyed && !response.headersSent) response.status(failure.status).json({ error: { code: failure.code, message: failure.message, requestId } });
  };
  app.use(errors);

  return app;
}
