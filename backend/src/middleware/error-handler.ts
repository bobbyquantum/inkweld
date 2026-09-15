import { type ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '../services/logger.service';
import { getRequestCorrelationId } from './request-logger';

const log = logger.child('ErrorHandler');

/**
 * Domain errors that map 1:1 to a status and a plain `{ error, message }` body.
 * Kept as a table so adding a new one does not add another branch to the
 * handler (and so the handler's cognitive complexity stays low).
 */
const PLAIN_ERROR_RESPONSES: Record<
  string,
  { status: ContentfulStatusCode; error: string; fallbackMessage: string }
> = {
  BadRequestError: { status: 400, error: 'Bad Request', fallbackMessage: 'Invalid request' },
  UnauthorizedError: {
    status: 401,
    error: 'Unauthorized',
    fallbackMessage: 'Authentication required',
  },
  ForbiddenError: { status: 403, error: 'Forbidden', fallbackMessage: 'Access denied' },
  NotFoundError: { status: 404, error: 'Not Found', fallbackMessage: 'Resource not found' },
};

/**
 * Names of errors expected in normal client flow (4xx). Used only to pick the
 * log level — these are not failures of the server.
 */
const EXPECTED_CLIENT_ERRORS = new Set([
  ...Object.keys(PLAIN_ERROR_RESPONSES),
  'QuotaExceededError',
]);

/** Structural view of a `QuotaExceededError` without importing the class. */
interface QuotaErrorShape {
  message?: string;
  usedBytes?: number;
  quotaBytes?: number;
  requiredBytes?: number;
  reason?: string;
}

function isQuotaExceededError(err: Error): err is Error & QuotaErrorShape {
  return err.name === 'QuotaExceededError';
}

/**
 * Build the sync-capacity refusal body. Shared by the handler so the shape
 * (code, usage numbers, reason) is defined in exactly one place.
 */
export function quotaExceededBody(err: QuotaErrorShape): {
  error: string;
  message: string;
  code: 'QUOTA_EXCEEDED';
  usedBytes: number;
  quotaBytes: number;
  requiredBytes?: number;
  reason?: string;
} {
  return {
    error: 'Quota Exceeded',
    message: err.message || 'Sync capacity exceeded',
    code: 'QUOTA_EXCEEDED',
    usedBytes: err.usedBytes ?? 0,
    quotaBytes: err.quotaBytes ?? 0,
    ...(err.requiredBytes !== undefined ? { requiredBytes: err.requiredBytes } : {}),
    ...(err.reason ? { reason: err.reason } : {}),
  };
}

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
    EXPECTED_CLIENT_ERRORS.has(err.name) || (err instanceof HTTPException && err.status < 500);

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
    return c.json({ error: err.message }, err.status);
  }

  // Sync-capacity refusal. Returned as 403 (the request is understood and the
  // caller is authorised; the account is simply out of room) but with the
  // numbers and a machine-readable reason so the UI can explain the limit
  // instead of showing a bare "access denied" — the two are very different to
  // a user who has just hit their allowance.
  if (isQuotaExceededError(err)) {
    return c.json(quotaExceededBody(err), 403);
  }

  const plain = PLAIN_ERROR_RESPONSES[err.name];
  if (plain) {
    return c.json(
      { error: plain.error, message: err.message || plain.fallbackMessage },
      plain.status
    );
  }

  // InternalError and unrecognised errors share the same fail-closed body.
  const exposeDetails = shouldExposeErrorDetails(c.env);
  return c.json(
    {
      error: 'Internal Server Error',
      message: exposeDetails ? err.message : 'An error occurred',
    },
    500
  );
};
