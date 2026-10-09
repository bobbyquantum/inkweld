import { describe, expect, it } from 'vitest';

/**
 * setup-vitest.ts restores window.location after every test, because the
 * suite runs with `isolate: false` and a leaked location breaks whichever
 * spec runs next. These tests run in order: the first one leaks on purpose.
 */
describe('window.location between tests', () => {
  const original = {
    href: globalThis.location.href,
    origin: globalThis.location.origin,
    pathname: globalThis.location.pathname,
  };

  it('can be changed by a test', () => {
    globalThis.location.href = '/somewhere-else';
    (globalThis.location as unknown as Record<string, unknown>)['extra'] = 1;
    Object.defineProperty(globalThis, 'location', {
      writable: true,
      configurable: true,
      value: { href: '' },
    });

    expect(globalThis.location.origin).toBeUndefined();
  });

  it('is back to normal in the next test', () => {
    expect(globalThis.location.href).toBe(original.href);
    expect(globalThis.location.origin).toBe(original.origin);
    expect(globalThis.location.pathname).toBe(original.pathname);
    expect('extra' in globalThis.location).toBe(false);
  });
});
