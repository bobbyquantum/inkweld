import { type ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { isDevelopmentOrTest, runtimeEnv } from '../config/runtime-env';
import { logger } from '../services/logger.service';
import { getRequestCorrelationId, pathForLogging } from './request-logger';

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
 * Whether unhandled-error messages may be echoed to the client: only when the
 * environment is development or test.
 *
 * The environment comes from runtimeEnv() (config/runtime-env.ts): the request
 * bindings first (Workers `[vars]`, which `process.env` does not see), then
 * NODE_ENV as the process was started with, which a bundled binary or Worker
 * must not take from the machine that built it. When neither is set, Workers
 * count as production and Bun/Node as development.
 */
export function shouldExposeErrorDetails(env: unknown): boolean {
  return isDevelopmentOrTest(runtimeEnv(env));
}

/** Name of the error signingSecret() throws (config/signing-secret.ts). */
const SIGNING_SECRET_ERROR = 'SigningSecretError';

export const errorHandler: ErrorHandler = (err, c) => {
  // Get correlation ID from request context
  const correlationId = getRequestCorrelationId(c);
  const path = pathForLogging(c.req.path);
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
  } else if (err.name === SIGNING_SECRET_ERROR) {
    // A configuration problem, not a bug: one line naming what to set, no
    // stack. The response below stays the generic 500.
    log.error(
      `${method} ${path} failed: ${err.message}`,
      undefined,
      { method, path },
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
