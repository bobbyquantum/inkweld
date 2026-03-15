import { describe, expect, it, vi } from 'vitest';
import type { Route } from '@playwright/test';
import { MockApiRegistry } from './registry';

function mockRoute(url: string): Route {
  return {
    request: () => ({ url: () => url }),
    fulfill: vi.fn(),
    continue: vi.fn(),
    abort: vi.fn(),
  } as unknown as Route;
}

describe('MockApiRegistry', () => {
  describe('addHandler / getHandlers', () => {
    it('should register and retrieve handlers', () => {
      const registry = new MockApiRegistry();
      const handler = vi.fn();
      registry.addHandler('/api/test', handler);
      expect(registry.getHandlers().get('/api/test')).toBe(handler);
    });
  });

  describe('tryHandleRoute - glob pattern matching', () => {
    it('should match ** patterns across multiple path segments', async () => {
      const registry = new MockApiRegistry();
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.addHandler('**/api/v1/projects/**', handler);

      const route = mockRoute('https://example.com/api/v1/projects/user/slug/items');
      const matched = await registry.tryHandleRoute(route);

      expect(matched).toBe(true);
      expect(handler).toHaveBeenCalledWith(route);
    });

    it('should match single * only within one path segment', async () => {
      const registry = new MockApiRegistry();
      const handlerSingle = vi.fn().mockResolvedValue(undefined);
      registry.addHandler('https://example.com/api/*/resource', handlerSingle);

      // Single segment - should match
      const routeMatch = mockRoute('https://example.com/api/v1/resource');
      expect(await registry.tryHandleRoute(routeMatch)).toBe(true);

      // Multiple segments - should NOT match with single *
      const routeNoMatch = mockRoute('https://example.com/api/v1/v2/resource');
      expect(await registry.tryHandleRoute(routeNoMatch)).toBe(false);
    });

    it('should treat trailing $ as regex end anchor', async () => {
      const registry = new MockApiRegistry();
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.addHandler('https://example.com/exact$', handler);

      // Exact match
      const routeExact = mockRoute('https://example.com/exact');
      expect(await registry.tryHandleRoute(routeExact)).toBe(true);

      // Should NOT match with trailing path
      const routeExtra = mockRoute('https://example.com/exact/more');
      expect(await registry.tryHandleRoute(routeExtra)).toBe(false);
    });

    it('should escape regex special characters in patterns', async () => {
      const registry = new MockApiRegistry();
      const handler = vi.fn().mockResolvedValue(undefined);
      // The dot in a URL should match a literal dot, not any character
      registry.addHandler('https://example.com/file.json', handler);

      // Literal dot — should match
      const routeMatch = mockRoute('https://example.com/file.json');
      expect(await registry.tryHandleRoute(routeMatch)).toBe(true);

      // Non-literal (dot as any char) — should NOT match
      const routeNoMatch = mockRoute('https://example.com/fileXjson');
      expect(await registry.tryHandleRoute(routeNoMatch)).toBe(false);
    });

    it('should return false when no handler matches', async () => {
      const registry = new MockApiRegistry();
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.addHandler('/api/specific', handler);

      const route = mockRoute('https://example.com/api/other');
      const matched = await registry.tryHandleRoute(route);
      expect(matched).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should match ** at start spanning full URL', async () => {
      const registry = new MockApiRegistry();
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.addHandler('**/health', handler);

      const route = mockRoute('https://example.com/api/v1/health');
      expect(await registry.tryHandleRoute(route)).toBe(true);
    });
  });
});
