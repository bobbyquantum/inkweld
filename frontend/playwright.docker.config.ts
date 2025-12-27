import { defineConfig, devices } from '@playwright/test';

/**
 * Docker E2E Test Configuration
 *
 * This configuration runs the online e2e tests against the production
 * Docker image to verify that the container builds and runs correctly.
 *
 * Prerequisites:
 *   - Docker must be running
 *   - Image will be built automatically via docker compose
 *
 * Usage:
 *   npm run e2e:docker       - Build image and run tests
 *   npm run e2e:docker:ui    - Run with Playwright UI
 *   npm run e2e:docker:debug - Run in debug mode
 *
 * This catches issues like:
 *   - Missing native module builds (leveldown, classic-level, etc.)
 *   - Dockerfile syntax errors
 *   - Runtime environment issues
 *   - Production build problems
 */
export default defineConfig({
  // Reuse the online tests - Docker serves both frontend and API on port 8333
  testDir: './e2e/online',

  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for database state management

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],

  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,

  /* Reporter to use */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Test timeout - longer for Docker tests (image build can be slow) */
  timeout: 60000,

  /* Expect timeout */
  expect: {
    timeout: 10000,
  },

  /* Global setup/teardown for Docker container management */
  globalSetup: './e2e/docker/global-setup.ts',
  globalTeardown: './e2e/docker/global-teardown.ts',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL - Docker container serves both frontend and backend on 9333 */
    baseURL: 'http://localhost:9333',

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

  /* No webServer config - Docker container is managed by global setup/teardown */

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
