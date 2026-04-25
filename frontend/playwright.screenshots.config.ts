import { defineConfig, devices } from '@playwright/test';

import { getPort } from './e2e/common/free-port';

/**
 * Playwright configuration for screenshot generation.
 * These tests generate promotional screenshots for documentation.
 *
 * Run with: npm run e2e:screenshots
 */

export default (async () => {
  const frontendPort = await getPort('PLAYWRIGHT_FRONTEND_PORT');
  const frontendUrl = `http://localhost:${frontendPort}`;

  // Expose to test workers so mock handlers can use the correct origin
  process.env['PLAYWRIGHT_TEST_BASE_URL'] = frontendUrl;
  process.env['PLAYWRIGHT_FRONTEND_PORT'] = String(frontendPort);

  return defineConfig({
    testDir: './e2e/screenshots',
    testIgnore: ['**/mock-api/registry.spec.ts'],
    fullyParallel: false, // Run sequentially for consistent screenshots
    forbidOnly: !!process.env['CI'],
    retries: 0, // No retries for screenshot generation
    reporter: [['list'], ['html', { open: 'never' }]],

    /* Expect timeout for assertions */
    expect: {
      timeout: 10000,
    },

    use: {
      baseURL: frontendUrl,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      actionTimeout: 10000,
      navigationTimeout: 15000,
    },

    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ],

    webServer: {
      command: `npm run start -- --port ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: !process.env['CI'],
      timeout: 120000,
    },
  });
})();
