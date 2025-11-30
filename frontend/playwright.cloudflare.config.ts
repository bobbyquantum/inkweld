import { defineConfig, devices } from '@playwright/test';

/**
 * Cloudflare Deployed E2E Test Configuration
 *
 * This configuration runs tests against deployed Cloudflare services:
 * - Frontend: Cloudflare Pages
 * - Backend: Cloudflare Workers with D1 + Durable Objects
 *
 * This is useful for:
 * - Smoke testing after deployments
 * - Verifying production-like behavior
 * - Testing against staging/preview environments
 *
 * Environment Variables (required):
 *   CLOUDFLARE_FRONTEND_URL - The deployed frontend URL
 *                             e.g., https://inkweld-dev.pages.dev
 *
 * Optional Environment Variables:
 *   CLOUDFLARE_BACKEND_URL  - If frontend needs explicit backend URL
 *                             (usually configured in the deployed frontend)
 *
 * Usage:
 *   CLOUDFLARE_FRONTEND_URL=https://inkweld-dev.pages.dev npm run e2e:cloudflare
 *
 * ⚠️ CAUTION: Tests will create real data in the deployed environment!
 * Consider:
 *   - Using a dedicated test environment
 *   - Running only read-only/smoke tests against production
 *   - Implementing test data cleanup
 */

const frontendUrl = process.env['CLOUDFLARE_FRONTEND_URL'];

if (!frontendUrl && !process.env['CI']) {
  console.warn(
    '\n⚠️  CLOUDFLARE_FRONTEND_URL not set. Tests will fail.\n' +
      '   Set it to your deployed frontend URL, e.g.:\n' +
      '   CLOUDFLARE_FRONTEND_URL=https://inkweld-dev.pages.dev npm run e2e:cloudflare\n'
  );
}

export default defineConfig({
  testDir: './e2e/online',

  /* Run tests sequentially - deployed environment is shared */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env['CI'],

  /* Retry on CI - network issues are more likely with remote services */
  retries: process.env['CI'] ? 3 : 1,

  /* Single worker - we're hitting a shared deployed environment */
  workers: 1,

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Test timeout - longer for network latency */
  timeout: 60000,

  /* Expect timeout - longer for remote services */
  expect: {
    timeout: 15000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL - the deployed frontend */
    baseURL: frontendUrl || 'https://inkweld-dev.pages.dev',

    /* Collect trace on first retry - useful for debugging remote failures */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure - helpful for debugging remote issues */
    video: 'retain-on-failure',

    /* Ensure each test gets a fresh browser context */
    contextOptions: {
      storageState: undefined,
    },

    /* Extra HTTP headers if needed */
    // extraHTTPHeaders: {
    //   'X-Test-Mode': 'e2e',
    // },
  },

  /* No webServer - we're using deployed services */
  webServer: undefined,

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
