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

  /* Global setup - verifies backend health and admin user exists */
  globalSetup: require.resolve('./e2e/online-setup.ts'),

  /* Run tests in files in parallel */
  fullyParallel: true, // Sequential for database state management

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  retries: 0,

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Expect timeout */
  expect: {
    timeout: 30000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:4400',

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

  /* Configure web servers for both frontend and backend */
  webServer: [
    {
      // Backend server with in-memory database (dedicated e2e port to avoid clashing with dev server)
      command: 'bun src/bun-runner.ts',
      cwd: '../backend',
      url: 'http://localhost:9333/api/v1/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        // Inherit existing environment (includes PATH, HOME, etc. needed for Bun to run)
        ...process.env,
        // Override with test-specific values
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
