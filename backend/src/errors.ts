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

export class ValidationError extends Error {
  constructor(
    message = 'Validation failed',
    public details?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
    this.cause = details;
  }
}
