import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Error:', err);

  // Handle Hono HTTPException
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message,
      },
      err.status
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

  // Default error
  return c.json(
    {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    },
    500
  );
};
