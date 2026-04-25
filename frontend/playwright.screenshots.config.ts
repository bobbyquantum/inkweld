import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for screenshot generation.
 * These tests generate promotional screenshots for documentation.
 *
 * Screenshots run in a dedicated CI job with no other web servers, so
 * the default Angular dev server port (4200) is used to avoid Vite cache
 * invalidation that occurs when passing a non-default --port flag.
 *
 * Run with: npm run e2e:screenshots
 */

const FRONTEND_PORT = 4200;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

// Expose to test workers so mock handlers can use the correct origin
process.env['PLAYWRIGHT_TEST_BASE_URL'] =
  process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? FRONTEND_URL;
process.env['PLAYWRIGHT_FRONTEND_PORT'] =
  process.env['PLAYWRIGHT_FRONTEND_PORT'] ?? String(FRONTEND_PORT);

export default defineConfig({
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
    baseURL: process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? FRONTEND_URL,
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
    command: 'npm run start',
    url: FRONTEND_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },
});
