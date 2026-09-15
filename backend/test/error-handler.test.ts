import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { errorHandler, shouldExposeErrorDetails } from '../src/middleware/error-handler';

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

    it('should handle InternalError with 500 and the exposed message', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const app = createTestApp();
        app.get('/test', () => {
          const error = new Error('Database unavailable');
          error.name = 'InternalError';
          throw error;
        });

        const res = await app.request('/test');
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Internal Server Error');
        expect(json.message).toBe('Database unavailable');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should hide an InternalError message in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const app = createTestApp();
        app.get('/test', () => {
          const error = new Error('Sensitive internal detail');
          error.name = 'InternalError';
          throw error;
        });

        const res = await app.request('/test');
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.message).toBe('An error occurred');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
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

  describe('QuotaExceededError handling', () => {
    /** Build an error whose name routes it to the quota branch. */
    function quotaError(overrides: Record<string, unknown>): Error {
      return Object.assign(new Error('Sync capacity exceeded'), {
        name: 'QuotaExceededError',
        usedBytes: 0,
        quotaBytes: 0,
        ...overrides,
      });
    }

    it('should return 403 with code, usage numbers and reason', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw quotaError({
          message: 'Upload would exceed capacity',
          usedBytes: 900,
          quotaBytes: 1000,
          requiredBytes: 200,
          reason: 'media_upload',
        });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toBe('Quota Exceeded');
      expect(json.code).toBe('QUOTA_EXCEEDED');
      expect(json.message).toBe('Upload would exceed capacity');
      expect(json.usedBytes).toBe(900);
      expect(json.quotaBytes).toBe(1000);
      expect(json.requiredBytes).toBe(200);
      expect(json.reason).toBe('media_upload');
    });

    it('should omit optional fields that are absent and default the numbers', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw quotaError({ usedBytes: undefined, quotaBytes: undefined, message: '' });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.message).toBe('Sync capacity exceeded');
      expect(json.usedBytes).toBe(0);
      expect(json.quotaBytes).toBe(0);
      expect(json).not.toHaveProperty('requiredBytes');
      expect(json).not.toHaveProperty('reason');
    });
  });

  describe('environment-aware redaction', () => {
    const g = globalThis as Record<string, unknown>;

    function withProcessEnv<T>(value: string | undefined, fn: () => T): T {
      const original = process.env.NODE_ENV;
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      try {
        return fn();
      } finally {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
      }
    }

    it('prefers the request bindings (Workers [vars]) over process.env', () => {
      withProcessEnv('development', () => {
        expect(shouldExposeErrorDetails({ NODE_ENV: 'production' })).toBe(false);
      });
      withProcessEnv('production', () => {
        expect(shouldExposeErrorDetails({ NODE_ENV: 'development' })).toBe(true);
      });
    });

    it('only exposes details for an explicit development or test environment', () => {
      withProcessEnv(undefined, () => {
        expect(shouldExposeErrorDetails({ NODE_ENV: 'staging' })).toBe(false);
        expect(shouldExposeErrorDetails({ NODE_ENV: 'preview' })).toBe(false);
        expect(shouldExposeErrorDetails({ NODE_ENV: 'test' })).toBe(true);
      });
    });

    it('treats an unconfigured Workers runtime as production', () => {
      const hadCaches = 'caches' in g;
      const hadPair = 'WebSocketPair' in g;
      const savedCaches = g.caches;
      const savedPair = g.WebSocketPair;
      g.caches = g.caches ?? {};
      g.WebSocketPair = class {};
      try {
        withProcessEnv(undefined, () => {
          expect(shouldExposeErrorDetails(undefined)).toBe(false);
          expect(shouldExposeErrorDetails({})).toBe(false);
        });
      } finally {
        if (hadCaches) g.caches = savedCaches;
        else delete g.caches;
        if (hadPair) g.WebSocketPair = savedPair;
        else delete g.WebSocketPair;
      }
    });

    it('hides the message when the Workers binding says production even if process.env is unset', async () => {
      await withProcessEnv(undefined, async () => {
        const app = new Hono<{ Bindings: { NODE_ENV: string } }>();
        app.onError(errorHandler);
        app.get('/test', () => {
          throw new Error('Sensitive error info');
        });
        const res = await app.request('/test', {}, { NODE_ENV: 'production' });
        const json = await res.json();
        expect(json.message).toBe('An error occurred');
      });
    });
  });
});
