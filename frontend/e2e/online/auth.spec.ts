import { expect, test } from './fixtures';

// Helper to extract mode from v2 config format
function getActiveMode(
  config: {
    version?: number;
    activeConfigId?: string;
    configurations?: Array<{ id: string; type: string; serverUrl?: string }>;
    mode?: string;
    serverUrl?: string;
  } | null
): { mode: string | undefined; serverUrl: string | undefined } {
  if (!config) return { mode: undefined, serverUrl: undefined };
  if (config.version === 2) {
    const activeConfig = config.configurations?.find(
      c => c.id === config.activeConfigId
    );
    return {
      mode: activeConfig?.type,
      serverUrl: activeConfig?.serverUrl,
    };
  }
  // Legacy v1 fallback
  return { mode: config.mode, serverUrl: config.serverUrl };
}

test.describe('Authentication', () => {
  test('authenticatedPage fixture should work', async ({
    authenticatedPage,
  }) => {
    // Verify we have auth token in localStorage (prefixed with server ID)
    const token = await authenticatedPage.evaluate(() => {
      return localStorage.getItem('srv:server-1:auth_token');
    });
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/); // JWT format

    // Verify we have server config (v2 format)
    const config = await authenticatedPage.evaluate(() => {
      const cfg = localStorage.getItem('inkweld-app-config');
      return cfg ? JSON.parse(cfg) : null;
    });
    expect(config).toBeTruthy();
    const { mode, serverUrl } = getActiveMode(
      config as {
        version?: number;
        activeConfigId?: string;
        configurations?: Array<{
          id: string;
          type: string;
          serverUrl?: string;
        }>;
        mode?: string;
        serverUrl?: string;
      } | null
    );
    expect(mode).toBe('server');
    expect(serverUrl).toBe('http://localhost:9333');

    // Verify we can access an authenticated endpoint
    const response = await authenticatedPage.request.get(
      'http://localhost:9333/api/v1/projects',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // Should return 200 (or possibly 404 if no projects, but NOT 401)
    expect(response.status()).not.toBe(401);
  });
});
