import { Route } from '@playwright/test';
import { mockApi } from './index';

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
      aiLinting: false,
      aiImageGeneration: false,
      captcha: { enabled: false },
      appMode: 'BOTH',
      defaultServerName: null
    })
  });
}

/**
 * Set up all config-related mock handlers
 */
export function setupConfigHandlers(): void {
  console.log('Config handlers initialized');
  
  // Register the features endpoint handler
  mockApi.addHandler('**/api/v1/config/features', handleSystemFeatures);
}
