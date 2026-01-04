import { Route } from '@playwright/test';

import { mockApi } from './index';

/**
 * Mock config storage - simulates database config values
 */
const mockConfigValues: Record<string, { value: string; source: string }> = {
  AI_IMAGE_ENABLED: { value: 'true', source: 'database' },
  AI_IMAGE_DEFAULT_PROVIDER: { value: 'openai', source: 'database' },
  AI_IMAGE_OPENAI_ENABLED: { value: 'true', source: 'database' },
  AI_IMAGE_OPENROUTER_ENABLED: { value: 'true', source: 'database' },
  AI_IMAGE_OPENROUTER_API_KEY: { value: '********', source: 'database' },
  AI_IMAGE_SD_ENABLED: { value: 'false', source: 'default' },
  AI_IMAGE_SD_ENDPOINT: { value: '', source: 'default' },
  AI_IMAGE_SD_API_KEY: { value: '', source: 'default' },
  OPENAI_API_KEY: { value: '********', source: 'database' },
  USER_APPROVAL_REQUIRED: { value: 'true', source: 'database' },
  GITHUB_ENABLED: { value: 'true', source: 'database' },
  AI_KILL_SWITCH: { value: 'false', source: 'database' },
};

/**
 * Mock handlers for config API endpoints
 */

/**
 * Mock system features endpoint
 */
export async function handleSystemFeatures(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      aiKillSwitch: false,
      aiKillSwitchLockedByEnv: false,
      aiLinting: true,
      aiImageGeneration: true,
      captcha: { enabled: false },
      appMode: 'BOTH',
      defaultServerName: null,
      userApprovalRequired: true,
    }),
  });
}

/**
 * Set up all config-related mock handlers
 */
export function setupConfigHandlers(): void {
  // Register the features endpoint handler
  mockApi.addHandler('**/api/v1/config/features', handleSystemFeatures);

  // GET /api/v1/admin/config - Get all config values
  // Note: Must be registered before the wildcard handler
  mockApi.addHandler('**/api/v1/admin/config', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    // Only handle exact match (no trailing path segments)
    if (url.pathname === '/api/v1/admin/config' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockConfigValues),
      });
      return;
    }

    // Otherwise let other handlers process it
    await route.continue();
  });

  // GET/PUT/DELETE /api/v1/admin/config/:key - Individual config operations
  mockApi.addHandler('**/api/v1/admin/config/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathParts = url.pathname.split('/');
    const key = pathParts[pathParts.length - 1];

    // Skip if this is the base config endpoint (handled above)
    if (key === 'config') {
      await route.continue();
      return;
    }

    if (method === 'GET') {
      const value = mockConfigValues[key];
      if (value) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key, ...value }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Config key not found' }),
        });
      }
    } else if (method === 'PUT') {
      try {
        const rawBody = route.request().postData() || '{}';
        const body = JSON.parse(rawBody) as { value: string };
        mockConfigValues[key] = { value: body.value, source: 'database' };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key, value: body.value, source: 'database' }),
        });
      } catch {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid request body' }),
        });
      }
    } else if (method === 'DELETE') {
      delete mockConfigValues[key];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });
}
