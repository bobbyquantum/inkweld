/**
 * Domain-specific error classes.
 * These are NOT HTTP-specific - they represent business logic errors
 * that get mapped to HTTP responses by the error handler middleware.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error {
  constructor(message = 'Bad request') {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class InternalError extends Error {
  constructor(message = 'Internal server error') {
    super(message);
    this.name = 'InternalError';
  }
}

/**
 * Raised when a write would push a user past their sync-capacity allowance.
 *
 * Carries the numbers the client needs to explain itself (used/quota/needed)
 * and a machine-readable `reason`, so the UI can render the right message —
 * and, critically, distinguish "you are out of room" from a generic 403 that
 * might be mistaken for an access-control problem.
 *
 * Only new media uploads and new project creation raise this. Document editing
 * and Yjs sync are never blocked: stranding a user's work is worse than
 * temporarily exceeding an allowance.
 */
export class QuotaExceededError extends Error {
  readonly usedBytes: number;
  readonly quotaBytes: number;
  /** Bytes the rejected operation would have added, when known. */
  readonly requiredBytes?: number;
  readonly reason: 'media_upload' | 'project_create';

  constructor(details: {
    usedBytes: number;
    quotaBytes: number;
    requiredBytes?: number;
    reason: 'media_upload' | 'project_create';
    message?: string;
  }) {
    super(details.message ?? 'Sync capacity exceeded');
    this.name = 'QuotaExceededError';
    this.usedBytes = details.usedBytes;
    this.quotaBytes = details.quotaBytes;
    this.requiredBytes = details.requiredBytes;
    this.reason = details.reason;
  }
}
