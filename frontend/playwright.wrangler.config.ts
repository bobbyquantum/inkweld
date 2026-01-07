import { defineConfig, devices } from '@playwright/test';

/**
 * Wrangler Dev E2E Test Configuration
 *
 * This configuration runs tests against the Cloudflare Workers runtime
 * using `wrangler dev` locally. This provides a more production-like
 * environment than the Bun backend, testing D1 database and Durable Objects.
 *
 * Prerequisites:
 *   1. Run `npx wrangler login` if not already authenticated
 *   2. D1 database is auto-initialized via globalSetup
 *
 * Usage:
 *   npm run e2e:wrangler
 *   npm run e2e:wrangler:ui
 *
 * Note: Wrangler dev is slower to start than Bun (~30-60s).
 * Data persists in D1 between runs.
 */
export default defineConfig({
  testDir: './e2e/online',

  /* Global setup to initialize D1 database */
  globalSetup: require.resolve('./e2e/wrangler-setup.ts'),

  /* Run tests sequentially for database state management */

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env['CI'],

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Expect timeout */
  expect: {
    timeout: 30000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL - frontend served separately (dedicated e2e port to avoid clashing with dev server) */
    baseURL: 'http://localhost:4400',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* Ensure each test gets a fresh browser context */
    contextOptions: {
      storageState: undefined,
    },
  },

  /* Configure web servers */
  webServer: [
    {
      // Wrangler dev server (Workers runtime locally)
      // Uses --local for local persistence, --port to avoid clashing with dev server
      // Note: Run `bun run init:d1-local` in backend/ first to initialize the database
      command: 'npx wrangler dev --local --port 9333',
      cwd: '../backend',
      url: 'http://localhost:9333/api/v1/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 90000, // Wrangler is slower to start
      env: {
        NODE_ENV: 'test',
      },
    },
    {
      // Frontend server (dedicated e2e port to avoid clashing with dev server)
      command: process.env['E2E_MODE'] === 'prod'
        ? 'npx http-server dist/browser -p 4400 -c-1 --proxy http://localhost:4400?'
        : 'npm start -- --port 4400',
      url: 'http://localhost:4400',
      reuseExistingServer: !process.env['CI'],
      timeout: 120000,
    },
  ],

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
