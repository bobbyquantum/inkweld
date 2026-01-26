import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for screenshot generation.
 * These tests generate promotional screenshots for documentation.
 *
 * Run with: npm run e2e:screenshots
 */
export default defineConfig({
  testDir: './e2e/screenshots',
  fullyParallel: false, // Run sequentially for consistent screenshots
  forbidOnly: !!process.env['CI'],
  retries: 0, // No retries for screenshot generation
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Expect timeout for assertions */
  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: 'http://localhost:4200',
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
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },
});
