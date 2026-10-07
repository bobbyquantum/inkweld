import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Context } from 'hono';
import {
  getIngressPath,
  getIngressUser,
  ingressAdmins,
  isIngressEnabled,
  isIngressRequest,
} from '../src/utils/ingress';
import { baseUsernameFor } from '../src/services/ingress-auth.service';

function ctx(headers: Record<string, string>, peer: string | null): Context {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    env: peer ? { requestIP: () => ({ address: peer }) } : undefined,
    req: {
      raw: new Request('http://inkweld/test'),
      header: (name: string) => lower[name.toLowerCase()],
    },
  } as unknown as Context;
}

const saved = {
  enabled: process.env['INGRESS_ENABLED'],
  proxy: process.env['INGRESS_TRUSTED_PROXY'],
  admins: process.env['INGRESS_ADMINS'],
};

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('INGRESS_ENABLED', saved.enabled);
  restore('INGRESS_TRUSTED_PROXY', saved.proxy);
  restore('INGRESS_ADMINS', saved.admins);
});

/** The Supervisor's address, which the HA app passes as INGRESS_TRUSTED_PROXY. */
const PROXY = '172.30.32.2';

beforeEach(() => {
  process.env['INGRESS_TRUSTED_PROXY'] = PROXY;
});

const userHeaders = {
  'X-Ingress-Path': '/api/hassio_ingress/Tok3n_-x',
  'X-Remote-User-Id': 'ha-user-1',
  'X-Remote-User-Name': 'alice',
  'X-Remote-User-Display-Name': 'Alice Liddell',
};

describe('ingress detection', () => {
  it('is off unless INGRESS_ENABLED is set', () => {
    delete process.env['INGRESS_ENABLED'];
    expect(isIngressEnabled()).toBe(false);
    expect(isIngressRequest(ctx(userHeaders, PROXY))).toBe(false);
    expect(getIngressUser(ctx(userHeaders, PROXY))).toBeNull();
  });

  it('is off without INGRESS_TRUSTED_PROXY', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    delete process.env['INGRESS_TRUSTED_PROXY'];
    expect(isIngressRequest(ctx(userHeaders, PROXY))).toBe(false);
    expect(getIngressUser(ctx(userHeaders, PROXY))).toBeNull();
  });

  it('trusts only the configured proxy address', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    expect(isIngressRequest(ctx(userHeaders, '172.30.32.2'))).toBe(true);
    expect(isIngressRequest(ctx(userHeaders, '::ffff:172.30.32.2'))).toBe(true);
    expect(isIngressRequest(ctx(userHeaders, '172.30.32.1'))).toBe(false);
    expect(isIngressRequest(ctx(userHeaders, null))).toBe(false);
  });

  it('ignores a forged X-Forwarded-For from a direct client', () => {
    process.env['INGRESS_ENABLED'] = '1';
    const c = ctx({ ...userHeaders, 'X-Forwarded-For': '172.30.32.2' }, '192.168.1.20');
    expect(isIngressRequest(c)).toBe(false);
    expect(getIngressUser(c)).toBeNull();
    expect(getIngressPath(c)).toBeNull();
  });

  it('honours INGRESS_TRUSTED_PROXY', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    process.env['INGRESS_TRUSTED_PROXY'] = '10.0.0.5';
    expect(isIngressRequest(ctx(userHeaders, '10.0.0.5'))).toBe(true);
    expect(isIngressRequest(ctx(userHeaders, PROXY))).toBe(false);
  });
});

describe('getIngressPath', () => {
  it('returns a well-formed prefix', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    expect(getIngressPath(ctx(userHeaders, PROXY))).toBe('/api/hassio_ingress/Tok3n_-x');
  });

  it.each([
    '/api/hassio_ingress/abc/',
    '/api/hassio_ingress/abc"><script>',
    '/elsewhere/abc',
    '/api/hassio_ingress/',
  ])('rejects %p', (path) => {
    process.env['INGRESS_ENABLED'] = 'true';
    expect(getIngressPath(ctx({ 'X-Ingress-Path': path }, PROXY))).toBeNull();
  });
});

describe('getIngressUser', () => {
  it('reads the HA user headers', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    expect(getIngressUser(ctx(userHeaders, PROXY))).toEqual({
      id: 'ha-user-1',
      username: 'alice',
      displayName: 'Alice Liddell',
    });
  });

  it('requires a user id', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    const c = ctx({ 'X-Remote-User-Name': 'alice' }, PROXY);
    expect(getIngressUser(c)).toBeNull();
  });

  it('treats missing name headers as null', () => {
    process.env['INGRESS_ENABLED'] = 'true';
    const c = ctx({ 'X-Remote-User-Id': 'x' }, PROXY);
    expect(getIngressUser(c)).toEqual({ id: 'x', username: null, displayName: null });
  });
});

describe('ingressAdmins', () => {
  it('parses a comma-separated, case-insensitive list', () => {
    process.env['INGRESS_ADMINS'] = ' Alice, ,bob ';
    expect(ingressAdmins()).toEqual(['alice', 'bob']);
  });

  it('is empty when unset', () => {
    delete process.env['INGRESS_ADMINS'];
    expect(ingressAdmins()).toEqual([]);
  });
});

describe('baseUsernameFor', () => {
  const user = (username: string | null, displayName: string | null = null) => ({
    id: 'x',
    username,
    displayName,
  });

  it('lower-cases and replaces unsupported characters', () => {
    expect(baseUsernameFor(user('Alice.Smith@Home'))).toBe('alice-smith-home');
  });

  it('falls back to the display name', () => {
    expect(baseUsernameFor(user(null, 'Bob Jones'))).toBe('bob-jones');
  });

  it('uses a placeholder for names that are too short', () => {
    expect(baseUsernameFor(user('a'))).toBe('ha-user');
    expect(baseUsernameFor(user(null, null))).toBe('ha-user');
  });

  it('avoids reserved route names', () => {
    expect(baseUsernameFor(user('admin'))).toBe('admin-ha');
  });
});
