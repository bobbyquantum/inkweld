import { defineConfig, devices } from '@playwright/test';

/**
 * Wrangler Dev E2E Test Configuration
 *
 * This configuration runs tests against the Cloudflare Workers runtime
 * using `wrangler dev` locally. This provides a more production-like
 * environment than the Bun backend, testing D1 database and Durable Objects.
 *
 * Wrangler tests run in an isolated CI job. Ports are hardcoded to match
 * wrangler.toml's ALLOWED_ORIGINS. Override via env vars for local runs.
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

const FRONTEND_PORT = Number(process.env['PLAYWRIGHT_FRONTEND_PORT'] ?? 4400);
const BACKEND_PORT = Number(process.env['PLAYWRIGHT_BACKEND_PORT'] ?? 9333);
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Expose ports to globalSetup and test workers via environment variables
process.env['API_BASE_URL'] = BACKEND_URL;
process.env['PLAYWRIGHT_FRONTEND_PORT'] = String(FRONTEND_PORT);
process.env['PLAYWRIGHT_BACKEND_PORT'] = String(BACKEND_PORT);

export default defineConfig({
  testDir: './e2e/online',

  /* Global setup to initialize D1 database */
  globalSetup: require.resolve('./e2e/wrangler-setup.ts'),

  /* Run tests sequentially for database state management */

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env['CI'],

  /* Retry failed tests in CI for stability */
  retries: process.env['CI'] ? 1 : 0,

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Expect timeout */
  expect: {
    timeout: 30000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL - frontend served separately (dedicated e2e port to avoid clashing with dev server) */
    baseURL: FRONTEND_URL,

    /* Action timeout for slow CI environments */
    actionTimeout: 15000,
    navigationTimeout: 30000,

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
      // D1 init runs first to seed database before server starts
      command: `bun run init:d1-local && npx wrangler dev src/cloudflare-runner.ts -c wrangler.toml --local --port ${BACKEND_PORT}`,
      cwd: '../backend',
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120000, // Extra time for D1 init + wrangler startup
      env: {
        // Inherit existing environment (includes PATH, etc. needed for wrangler/npx)
        ...process.env,
        NODE_ENV: 'test',
      },
    },
    {
      // Frontend server (dedicated e2e port to avoid clashing with dev server)
      command:
        process.env['E2E_MODE'] === 'prod'
          ? `npx http-server dist/browser -p ${FRONTEND_PORT} -c-1 --proxy ${FRONTEND_URL}?`
          : `npm start -- --port ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
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
