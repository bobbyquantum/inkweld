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

// Where the wrangler backend's stdout/stderr is tee'd so a native workerd
// crash (e.g. "kj/async-io-unix.c++: disconnected: Broken pipe") is preserved
// for CI artifact upload. Kept inside the project directory (never a publicly
// writable dir like /tmp) to avoid a symlink-hijack risk; overridable via env.
const WRANGLER_LOG_FILE =
  process.env['WRANGLER_LOG_FILE'] ?? `${__dirname}/wrangler-backend.log`;

// Expose ports to globalSetup and test workers via environment variables
process.env['API_BASE_URL'] = BACKEND_URL;
process.env['PLAYWRIGHT_FRONTEND_PORT'] = String(FRONTEND_PORT);
process.env['PLAYWRIGHT_BACKEND_PORT'] = String(BACKEND_PORT);

export default defineConfig({
  testDir: './e2e/online',

  /* Global setup to initialize D1 database */
  globalSetup: require.resolve('./e2e/wrangler-setup.ts'),

  // Run tests sequentially against the single shared wrangler dev server.
  // wrangler dev serves a stateful D1 + Durable Objects backend from one
  // local runtime; running multiple Playwright workers in parallel against
  // it causes intermittent "Connection reset by peer" / "Target page,
  // context or browser has been closed" infra errors under concurrent DO
  // load. The structurally analogous playwright.cloudflare.config.ts sets
  // the same `fullyParallel: false` + `workers: 1` for the same reason.
  fullyParallel: false,
  workers: 1,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env['CI'],

  /* No retries. A failing test is a bug to investigate, not something to
     paper over — retries hide the underlying crash/flake and inflate CI time. */
  retries: 0,

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Per-test timeout. Wrangler dev (D1 + DO locally) is materially slower
     than the Bun backend. The Playwright default of 30000ms is too tight
     for multi-step flows like image-generation.spec.ts's user dialog
     lifecycle under load, and for the Published Announcement Visibility
     test which sets up three browser contexts (admin + anonymous +
     authenticated) each needing fixture setup. Allow 120s to cover
     fixture setup + test execution under wrangler load. */
  timeout: 120000,

  /* Expect timeout. Wrangler dev (D1 + DO locally) is slower than the
     Bun backend; allow 60s for assertions that wait for backend-driven
     UI state transitions (e.g. mark-all-read button disappearing after
     an API call). */
  expect: {
    timeout: 60000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL - frontend served separately (dedicated e2e port to avoid clashing with dev server) */
    baseURL: FRONTEND_URL,

    /* Action timeout for slow CI environments. Wrangler dev (D1 + DO
       locally) is slower than the Bun backend — match the online config's
       30000ms instead of the original 15000ms, which produced spurious
       "Timeout 15000ms exceeded" infra failures under load. */
    actionTimeout: 30000,
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
      //
      // The backend's stdout/stderr is tee'd to a log file so that a native
      // workerd crash (e.g. "kj/async-io-unix.c++: disconnected: Broken pipe")
      // is captured and can be uploaded as a CI artifact on failure. Without
      // this, Playwright swallows the backend output and the crash stack is
      // lost. The log path is exposed via WRANGLER_LOG_FILE for the CI upload
      // step to reference.
      //
      // A bare pipeline (`wrangler ... | tee file`) would return tee's exit
      // status, masking a failure in `init:d1-local` or `wrangler`. Wrap in
      // `bash -c` with `set -o pipefail` so the pipeline's real exit status
      // propagates and Playwright fails the webServer start if either step
      // fails. WRANGLER_LOG_FILE is quoted to survive paths with spaces.
      command: `bash -c 'set -o pipefail; bun run init:d1-local && npx wrangler dev src/cloudflare-runner.ts -c wrangler.toml --local --port ${BACKEND_PORT} 2>&1 | tee "${WRANGLER_LOG_FILE}"'`,
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
