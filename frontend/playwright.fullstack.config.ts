import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack e2e configuration
 *
 * This configuration runs tests against both the Angular frontend
 * and the real Bun backend server, allowing for complete integration testing.
 *
 * Usage:
 *   npm run e2e:fullstack
 *   npm run e2e:fullstack:ci
 */
export default defineConfig({
  testDir: './e2e/fullstack',

  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for database state management

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,

  /* Limit parallel workers for database state management */
  workers: 1,

  /* Reporter to use */
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  /* Test timeout - reasonable for full-stack tests */
  timeout: 10000,

  /* Expect timeout */
  expect: {
    timeout: 5000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:4200',

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
      // Backend server
      command: 'bun src/bun-runner.ts',
      cwd: '../backend',
      url: 'http://localhost:8333/api/v1/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 30000,
      env: {
        NODE_ENV: 'test',
        PORT: '8333',
        DB_TYPE: 'sqlite',
        DB_DATABASE: ':memory:',
        SESSION_SECRET: 'test-session-secret-for-e2e-testing-minimum-32-characters',
        ALLOWED_ORIGINS: 'http://localhost:4200',
        USER_APPROVAL_REQUIRED: 'false',
        GITHUB_ENABLED: 'false',
        DATA_PATH: './test-data/e2e',
      },
    },
    {
      // Frontend server
      command: 'npm start',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 30000,
    },
  ],

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
