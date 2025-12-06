import { defineConfig, devices } from '@playwright/test';

/**
 * Online E2E Test Configuration
 *
 * This configuration runs tests against both the Angular frontend
 * and the real Bun backend server with an in-memory database.
 *
 * Used for:
 * - Migration tests (offline → server)
 * - Server mode functionality
 * - Authentication flows with real backend
 * - API integration testing
 *
 * Usage:
 *   npm run e2e:online
 *   npm run e2e:online:ci
 */
export default defineConfig({
  testDir: './e2e/online',

  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for database state management

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,

  /* Limit parallel workers for database state management */
  workers: 1,

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Test timeout - longer for full-stack tests */
  timeout: 20000,

  /* Expect timeout */
  expect: {
    timeout: 5000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
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

  /* Configure web servers for both frontend and backend */
  webServer: [
    {
      // Backend server with in-memory database (dedicated e2e port to avoid clashing with dev server)
      command: 'bun src/bun-runner.ts',
      cwd: '../backend',
      url: 'http://localhost:9333/api/v1/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        NODE_ENV: 'test',
        PORT: '9333',
        DB_TYPE: 'sqlite',
        DB_DATABASE: ':memory:',
        SESSION_SECRET:
          'test-session-secret-for-e2e-testing-minimum-32-characters',
        ALLOWED_ORIGINS: 'http://localhost:4400',
        USER_APPROVAL_REQUIRED: 'false',
        GITHUB_ENABLED: 'false',
        DATA_PATH: './test-data/e2e',
        // Default admin for e2e tests
        DEFAULT_ADMIN_USERNAME: 'e2e-admin',
        DEFAULT_ADMIN_PASSWORD: 'E2eAdminPassword123!',
      },
    },
    {
      // Frontend server (dedicated e2e port to avoid clashing with dev server)
      command: 'npm start -- --port 4400',
      url: 'http://localhost:4400',
      reuseExistingServer: false,
      timeout: 30000,
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
