import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  // Don't log expected client errors (400/401/403/404) - they're normal flow
  const isExpectedError =
    err.name === 'UnauthorizedError' ||
    err.name === 'ForbiddenError' ||
    err.name === 'NotFoundError' ||
    err.name === 'BadRequestError' ||
    err.name === 'ValidationError' ||
    (err instanceof HTTPException && err.status < 500);

  if (!isExpectedError) {
    console.error('Error:', err);
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

  if (err.name === 'ValidationError') {
    return c.json(
      {
        error: 'Validation Error',
        message: err.message,
        details: err.cause,
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

  if (err.name === 'InternalError') {
    return c.json(
      {
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
      },
      500
    );
  }

  // Default error
  return c.json(
    {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    },
    500
  );
};
