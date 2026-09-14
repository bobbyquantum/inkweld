import { afterEach, describe, expect, it } from 'bun:test';
import type { Context } from 'hono';
import { getClientIp } from '../src/utils/client-ip';

function ctx(headers: Record<string, string> = {}, env: unknown = undefined): Context {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    env,
    req: {
      raw: new Request('http://localhost/test'),
      header: (name: string) => lower[name.toLowerCase()],
    },
  } as unknown as Context;
}

const g = globalThis as Record<string, unknown>;
const originalTrustProxy = process.env['TRUST_PROXY'];
const hadCaches = 'caches' in g;
const originalCaches = g.caches;
const hadWsPair = 'WebSocketPair' in g;
const originalWsPair = g.WebSocketPair;

function pretendWorkers(): void {
  g.caches = g.caches ?? {};
  g.WebSocketPair = class {};
}

afterEach(() => {
  if (originalTrustProxy === undefined) delete process.env['TRUST_PROXY'];
  else process.env['TRUST_PROXY'] = originalTrustProxy;
  if (hadCaches) g.caches = originalCaches;
  else delete g.caches;
  if (hadWsPair) g.WebSocketPair = originalWsPair;
  else delete g.WebSocketPair;
});

describe('getClientIp', () => {
  it('ignores forwarding headers by default', () => {
    delete process.env['TRUST_PROXY'];
    const c = ctx({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4' });
    expect(getClientIp(c)).toBeUndefined();
  });

  it('uses the Bun socket address when available', () => {
    delete process.env['TRUST_PROXY'];
    const c = ctx({ 'x-forwarded-for': '1.2.3.4' }, { requestIP: () => ({ address: '10.1.1.1' }) });
    expect(getClientIp(c)).toBe('10.1.1.1');
  });

  it('uses the Node socket address when available', () => {
    delete process.env['TRUST_PROXY'];
    const c = ctx({}, { incoming: { socket: { remoteAddress: '10.2.2.2' } } });
    expect(getClientIp(c)).toBe('10.2.2.2');
  });

  it('survives a requestIP that throws', () => {
    delete process.env['TRUST_PROXY'];
    const c = ctx(
      {},
      {
        requestIP: () => {
          throw new Error('not a live server');
        },
      }
    );
    expect(getClientIp(c)).toBeUndefined();
  });

  it('prefers the rightmost X-Forwarded-For entry when TRUST_PROXY=true', () => {
    process.env['TRUST_PROXY'] = 'true';
    const c = ctx(
      { 'x-forwarded-for': '9.9.9.9, 203.0.113.5' },
      { requestIP: () => ({ address: '127.0.0.1' }) }
    );
    expect(getClientIp(c)).toBe('203.0.113.5');
  });

  it('accepts TRUST_PROXY=1 and falls back to X-Real-IP', () => {
    process.env['TRUST_PROXY'] = '1';
    expect(getClientIp(ctx({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('skips empty trailing X-Forwarded-For entries', () => {
    process.env['TRUST_PROXY'] = 'true';
    expect(getClientIp(ctx({ 'x-forwarded-for': '203.0.113.8, , ' }))).toBe('203.0.113.8');
  });

  it('trusts CF-Connecting-IP only on Cloudflare Workers', () => {
    delete process.env['TRUST_PROXY'];
    const c = ctx({ 'cf-connecting-ip': '198.51.100.3', 'x-forwarded-for': '9.9.9.9' });
    expect(getClientIp(c)).toBeUndefined();

    pretendWorkers();
    expect(getClientIp(c)).toBe('198.51.100.3');
  });
});
