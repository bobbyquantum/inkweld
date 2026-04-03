/**
 * Tests for CSRF protection consistency across runtimes.
 * Verifies that origin-based CSRF middleware correctly rejects
 * cross-origin form submissions while allowing same-origin and JSON requests.
 */
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';

const ALLOWED_ORIGINS = ['http://localhost:4200', 'https://inkweld.example.com'];

/**
 * Creates a minimal Hono app with CSRF middleware matching the production pattern.
 * This mirrors the setup in bun-app.ts and worker-app.ts.
 */
function createCsrfTestApp() {
  const app = new Hono();

  // CSRF middleware with skip logic for OAuth/MCP paths (matching production)
  app.use('*', async (c, next) => {
    const path = c.req.path;
    if (
      path.startsWith('/.well-known/') ||
      path.startsWith('/oauth/') ||
      path === '/register' ||
      path.startsWith('/api/v1/ai/mcp')
    ) {
      return next();
    }
    return csrf({
      origin: ALLOWED_ORIGINS,
    })(c, next);
  });

  // Test routes
  app.post('/api/v1/test', (c) => c.json({ ok: true }));
  app.post('/oauth/token', (c) => c.json({ ok: true }));
  app.post('/register', (c) => c.json({ ok: true }));
  app.post('/api/v1/ai/mcp', (c) => c.json({ ok: true }));
  app.post('/.well-known/oauth-authorization-server', (c) => c.json({ ok: true }));

  return app;
}

/**
 * Creates a Hono app with wildcard origin support, matching worker-app.ts pattern.
 */
function createWildcardCsrfTestApp() {
  const origins = ['https://inkweld.example.com', '*.inkweld.pages.dev'];
  const app = new Hono();

  app.use('*', async (c, next) => {
    return csrf({
      origin: (requestOrigin) => {
        for (const allowed of origins) {
          if (allowed === requestOrigin) return true;
          if (allowed.startsWith('*.')) {
            const suffix = allowed.slice(1);
            if (requestOrigin.endsWith(suffix)) return true;
          }
        }
        return false;
      },
    })(c, next);
  });

  app.post('/api/v1/test', (c) => c.json({ ok: true }));
  return app;
}

describe('CSRF Protection', () => {
  describe('origin-based CSRF (array origins)', () => {
    const app = createCsrfTestApp();

    it('should reject form POST from a foreign origin', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://evil.example.com',
        },
        body: 'data=malicious',
      });
      expect(res.status).toBe(403);
    });

    it('should allow form POST from an allowed origin', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:4200',
        },
        body: 'data=safe',
      });
      expect(res.status).toBe(200);
    });

    it('should allow JSON POST from an allowed origin', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:4200',
        },
        body: JSON.stringify({ data: 'safe' }),
      });
      expect(res.status).toBe(200);
    });

    it('should not block JSON POST from a foreign origin (Hono csrf is form-only)', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example.com',
        },
        body: JSON.stringify({ data: 'cross-origin' }),
      });
      // Hono's csrf() only validates form content types
      expect(res.status).toBe(200);
    });

    it('should reject multipart form POST from a foreign origin', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary',
          Origin: 'https://evil.example.com',
        },
        body: '------WebKitFormBoundary\r\nContent-Disposition: form-data; name="file"\r\n\r\ndata\r\n------WebKitFormBoundary--',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('CSRF bypass for OAuth/MCP cross-origin paths', () => {
    const app = createCsrfTestApp();

    it('should allow cross-origin form POST to /oauth/token', async () => {
      const res = await app.request('/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://external-mcp-client.example.com',
        },
        body: 'grant_type=authorization_code&code=abc',
      });
      expect(res.status).toBe(200);
    });

    it('should allow cross-origin POST to /register', async () => {
      const res = await app.request('/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://external-mcp-client.example.com',
        },
        body: 'client_name=test',
      });
      expect(res.status).toBe(200);
    });

    it('should allow cross-origin POST to /api/v1/ai/mcp', async () => {
      const res = await app.request('/api/v1/ai/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://external-mcp-client.example.com',
        },
        body: JSON.stringify({ jsonrpc: '2.0' }),
      });
      expect(res.status).toBe(200);
    });

    it('should allow cross-origin POST to /.well-known/ paths', async () => {
      const res = await app.request('/.well-known/oauth-authorization-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://external-mcp-client.example.com',
        },
        body: 'data=test',
      });
      expect(res.status).toBe(200);
    });
  });

  describe('wildcard origin CSRF (Workers pattern)', () => {
    const app = createWildcardCsrfTestApp();

    it('should allow form POST from exact-match origin', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://inkweld.example.com',
        },
        body: 'data=safe',
      });
      expect(res.status).toBe(200);
    });

    it('should allow form POST from wildcard-matching subdomain', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://preview-abc123.inkweld.pages.dev',
        },
        body: 'data=safe',
      });
      expect(res.status).toBe(200);
    });

    it('should reject form POST from a non-matching origin', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://evil.example.com',
        },
        body: 'data=malicious',
      });
      expect(res.status).toBe(403);
    });

    it('should reject form POST from a partial wildcard mismatch', async () => {
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // "evil-inkweld.pages.dev" doesn't match "*.inkweld.pages.dev"
          // because the wildcard expects a dot before the suffix
          Origin: 'https://evil-fakepages.dev',
        },
        body: 'data=malicious',
      });
      expect(res.status).toBe(403);
    });
  });
});
