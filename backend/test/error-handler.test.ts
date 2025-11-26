import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { errorHandler } from '../src/middleware/error-handler.js';

describe('Error Handler Middleware', () => {
  /**
   * Helper to create a test app with the error handler
   */
  function createTestApp() {
    const app = new Hono();
    app.onError(errorHandler);
    return app;
  }

  describe('HTTPException handling', () => {
    it('should handle HTTPException with correct status', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new HTTPException(403, { message: 'Access forbidden' });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toBe('Access forbidden');
    });

    it('should handle HTTPException 404', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new HTTPException(404, { message: 'Not found' });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Not found');
    });

    it('should handle HTTPException 401', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new HTTPException(401, { message: 'Unauthorized' });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });
  });

  describe('ValidationError handling', () => {
    it('should handle ValidationError with 400 status', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('Invalid input data');
        error.name = 'ValidationError';
        (error as Error & { cause: unknown }).cause = { field: 'email', issue: 'invalid format' };
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Validation Error');
      expect(json.message).toBe('Invalid input data');
      expect(json.details).toEqual({ field: 'email', issue: 'invalid format' });
    });
  });

  describe('UnauthorizedError handling', () => {
    it('should handle UnauthorizedError with 401 status', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('Token expired');
        error.name = 'UnauthorizedError';
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
      expect(json.message).toBe('Token expired');
    });

    it('should use default message for UnauthorizedError without message', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('');
        error.name = 'UnauthorizedError';
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.message).toBe('Authentication required');
    });
  });

  describe('ForbiddenError handling', () => {
    it('should handle ForbiddenError with 403 status', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('Admin access required');
        error.name = 'ForbiddenError';
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toBe('Forbidden');
      expect(json.message).toBe('Admin access required');
    });

    it('should use default message for ForbiddenError without message', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('');
        error.name = 'ForbiddenError';
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.message).toBe('Access denied');
    });
  });

  describe('NotFoundError handling', () => {
    it('should handle NotFoundError with 404 status', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('Project not found');
        error.name = 'NotFoundError';
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Not Found');
      expect(json.message).toBe('Project not found');
    });

    it('should use default message for NotFoundError without message', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const error = new Error('');
        error.name = 'NotFoundError';
        throw error;
      });

      const res = await app.request('/test');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.message).toBe('Resource not found');
    });
  });

  describe('Default error handling', () => {
    it('should handle generic errors with 500 status', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Something went wrong');
      });

      const res = await app.request('/test');
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toBe('Internal Server Error');
    });

    it('should include error message in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Detailed error info');
      });

      const res = await app.request('/test');
      const json = await res.json();
      expect(json.message).toBe('Detailed error info');

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error message in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Sensitive error info');
      });

      const res = await app.request('/test');
      const json = await res.json();
      expect(json.message).toBe('An error occurred');

      process.env.NODE_ENV = originalEnv;
    });
  });
});
