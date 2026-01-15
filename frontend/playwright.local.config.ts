/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * Local E2E Test Configuration
 *
 * This configuration runs tests in LOCAL mode only.
 * The app uses IndexedDB for local storage and should NEVER contact a server.
 * Any API request will cause the test to fail.
 *
 * Usage:
 *   npm run e2e:local
 *   npm run e2e:local:ci
 */
export default defineConfig({
  testDir: './e2e/local',
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  /* Retry failed tests in CI for stability */
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Expect timeout */
  expect: {
    timeout: 60000,
  },

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env['PLAYWRIGHT_TEST_BASE_URL'] ?? 'http://localhost:4200',

    /* Action timeout for slow CI environments */
    actionTimeout: 15000,
    navigationTimeout: 30000,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Block Service Workers to ensure consistent behavior */
    serviceWorkers: 'block',
  },

  /* Configure web server for frontend only (no backend needed for local tests) */
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
