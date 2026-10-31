import { describe, it, expect, afterEach } from 'bun:test';
import { Hono } from 'hono';

import { getPublicApiUrl, getRequestOrigin } from '../src/services/url.service';

function appWithEnv() {
  const app = new Hono();
  app.get('/probe', (c) => c.text(getPublicApiUrl(c)));
  return app;
}

describe('getPublicApiUrl', () => {
  const originalBaseUrl = process.env.BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = originalBaseUrl;
  });

  it('prefers BASE_URL from the Workers bindings', async () => {
    process.env.BASE_URL = 'https://from-process.example';
    const res = await appWithEnv().request(
      'http://internal:8333/probe',
      {},
      {
        BASE_URL: 'https://api.example.com/',
      }
    );
    expect(await res.text()).toBe('https://api.example.com');
  });

  it('uses BASE_URL from the environment', async () => {
    process.env.BASE_URL = 'https://api.example.org';
    const res = await appWithEnv().request('http://internal:8333/probe');
    expect(await res.text()).toBe('https://api.example.org');
  });

  it('falls back to the request origin', async () => {
    delete process.env.BASE_URL;
    const res = await appWithEnv().request('http://books.example:8333/probe');
    expect(await res.text()).toBe('http://books.example:8333');
  });

  it('honours X-Forwarded-Proto from a TLS-terminating proxy', async () => {
    delete process.env.BASE_URL;
    const res = await appWithEnv().request('http://books.example/probe', {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    expect(await res.text()).toBe('https://books.example');
  });

  it('ignores a forwarded protocol that is not http(s)', async () => {
    delete process.env.BASE_URL;
    const res = await appWithEnv().request('http://books.example/probe', {
      headers: { 'X-Forwarded-Proto': 'javascript' },
    });
    expect(await res.text()).toBe('http://books.example');
  });
});

describe('getRequestOrigin', () => {
  const app = new Hono();
  app.get('/probe', (c) => c.text(getRequestOrigin(c)));

  async function origin(headers: Record<string, string> = {}): Promise<string> {
    const res = await app.request('http://internal:8333/probe', { headers });
    return res.text();
  }

  it('is where the request arrived', async () => {
    expect(await origin()).toBe('http://internal:8333');
  });

  it('ignores BASE_URL', async () => {
    const configured = process.env.BASE_URL;
    process.env.BASE_URL = 'https://stale.example.com';
    try {
      expect(await origin()).toBe('http://internal:8333');
    } finally {
      if (configured === undefined) delete process.env.BASE_URL;
      else process.env.BASE_URL = configured;
    }
  });

  it('honours what a proxy says about the scheme and host', async () => {
    expect(
      await origin({
        'x-forwarded-proto': 'https, http',
        'x-forwarded-host': 'inkweld.example.com, internal',
      })
    ).toBe('https://inkweld.example.com');
  });

  it('ignores a scheme it does not know', async () => {
    expect(await origin({ 'x-forwarded-proto': 'gopher' })).toBe('http://internal:8333');
  });
});
