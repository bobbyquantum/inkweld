/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * Offline E2E Test Configuration
 *
 * This configuration runs tests in OFFLINE mode only.
 * The app uses IndexedDB for local storage and should NEVER contact a server.
 * Any API request will cause the test to fail.
 *
 * Usage:
 *   npm run e2e:offline
 *   npm run e2e:offline:ci
 */
export default defineConfig({
  testDir: './e2e/offline',

  /* Disable parallel - Angular app is heavy and causes timeouts when parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Test timeout */
  timeout: 30000,

  /* Expect timeout */
  expect: {
    timeout: 10000,
  },

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? 'http://localhost:4200',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Block Service Workers to ensure consistent behavior */
    serviceWorkers: 'block',
  },

  /* Configure web server for frontend only (no backend needed for offline tests) */
  webServer: process.env['E2E_MODE'] === 'prod'
    ? {
        // Serve production build
        command: 'npx http-server dist/browser -p 4200 -c-1 --proxy http://localhost:4200?',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120000,
      }
    : {
        // Frontend dev server
        command: 'npm start',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120000,
      },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment for additional browser coverage
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
});
