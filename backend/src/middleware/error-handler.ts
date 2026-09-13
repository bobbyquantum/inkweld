import { type ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../services/logger.service';
import { getRequestCorrelationId } from './request-logger';

const log = logger.child('ErrorHandler');

/**
 * Whether unhandled-error messages may be echoed to the client.
 *
 * The check used to be `process.env.NODE_ENV === 'production'`. On Cloudflare
 * Workers `process.env` is not populated from `[vars]` (the project's
 * compatibility date predates `nodejs_compat_populate_process_env`), so that
 * comparison was always false there and every 500 returned the raw error —
 * DB errors, internal paths, provider responses. Resolve the environment from
 * the request bindings first, then `process.env`. When neither says anything,
 * a Workers runtime (detected the same way as config/env.ts) is treated as
 * production and everything else as development. Details are shown only for
 * an explicit development/test environment — fail closed.
 */
export function shouldExposeErrorDetails(env: unknown): boolean {
  const bindings = env as { NODE_ENV?: unknown } | undefined;
  const fromBindings = typeof bindings?.NODE_ENV === 'string' ? bindings.NODE_ENV : undefined;
  const fromProcess =
    typeof process !== 'undefined' && process.env ? process.env['NODE_ENV'] : undefined;
  const g = globalThis as Record<string, unknown>;
  const isWorkers = g.caches !== undefined && g.WebSocketPair !== undefined;
  const nodeEnv = fromBindings ?? fromProcess ?? (isWorkers ? 'production' : 'development');
  return nodeEnv === 'development' || nodeEnv === 'test';
}

export const errorHandler: ErrorHandler = (err, c) => {
  // Get correlation ID from request context
  const correlationId = getRequestCorrelationId(c);
  const path = c.req.path;
  const method = c.req.method;

  // Don't log expected client errors (400/401/403/404) - they're normal flow
  const isExpectedError =
    err.name === 'UnauthorizedError' ||
    err.name === 'ForbiddenError' ||
    err.name === 'NotFoundError' ||
    err.name === 'BadRequestError' ||
    (err instanceof HTTPException && err.status < 500);

  if (isExpectedError) {
    // Log expected errors at debug level for troubleshooting
    log.debug(
      `Client error on ${method} ${path}: ${err.name}`,
      { method, path, errorName: err.name },
      correlationId
    );
  } else {
    log.error(`Unhandled error on ${method} ${path}`, err, { method, path }, correlationId);
  }

  // Handle Hono HTTPException (legacy, prefer domain errors)
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message,
      },
      err.status
    );
  }

  if (err.name === 'BadRequestError') {
    return c.json(
      {
        error: 'Bad Request',
        message: err.message || 'Invalid request',
      },
      400
    );
  }

  if (err.name === 'UnauthorizedError') {
    return c.json(
      {
        error: 'Unauthorized',
        message: err.message || 'Authentication required',
      },
      401
    );
  }

  if (err.name === 'ForbiddenError') {
    return c.json(
      {
        error: 'Forbidden',
        message: err.message || 'Access denied',
      },
      403
    );
  }

  if (err.name === 'NotFoundError') {
    return c.json(
      {
        error: 'Not Found',
        message: err.message || 'Resource not found',
      },
      404
    );
  }

  const exposeDetails = shouldExposeErrorDetails(c.env);

  if (err.name === 'InternalError') {
    return c.json(
      {
        error: 'Internal Server Error',
        message: exposeDetails ? err.message : 'An error occurred',
      },
      500
    );
  }

  // Default error
  return c.json(
    {
      error: 'Internal Server Error',
      message: exposeDetails ? err.message : 'An error occurred',
    },
    500
  );
};
