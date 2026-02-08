import { defineConfig, devices } from '@playwright/test';

/**
 * MCP (Model Context Protocol) E2E Test Configuration
 *
 * Tests the MCP server functionality end-to-end using:
 * - Direct JSON-RPC HTTP calls to the MCP Streamable HTTP endpoint
 * - The MCP Inspector UI for connection and interactive testing
 *
 * Spins up:
 * 1. Backend server with in-memory database (port 9333)
 * 2. MCP Inspector UI (port 6274) + proxy (port 6277)
 *
 * Usage:
 *   npm run e2e:mcp
 *   npm run e2e:mcp:ui
 *   npm run e2e:mcp:debug
 */
export default defineConfig({
  testDir: './e2e/mcp',

  /* Global setup - verifies backend + inspector health */
  globalSetup: require.resolve('./e2e/mcp/mcp-setup.ts'),

  /* Run test files serially to avoid port conflicts with Inspector */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env['CI'],

  /* Retry failed tests in CI for stability */
  retries: process.env['CI'] ? 1 : 0,

  /* Longer timeout for MCP operations */
  timeout: 90000,

  /* Reporter */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Expect timeout */
  expect: {
    timeout: 30000,
  },

  /* Shared settings */
  use: {
    /* No base URL - tests use explicit URLs for backend and Inspector */
    actionTimeout: 20000,
    navigationTimeout: 30000,

    /* Collect trace when retrying */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Start backend server and MCP Inspector */
  webServer: [
    {
      // Backend server with in-memory database
      command: 'bun src/bun-runner.ts',
      cwd: '../backend',
      url: 'http://localhost:9333/api/v1/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '9333',
        DB_TYPE: 'sqlite',
        DB_DATABASE: ':memory:',
        SESSION_SECRET: 'test-session-secret-for-e2e-mcp-testing-minimum-32-chars',
        ALLOWED_ORIGINS: 'http://localhost:6274,http://localhost:6277,http://localhost:4200',
        USER_APPROVAL_REQUIRED: 'false',
        GITHUB_ENABLED: 'false',
        DATA_PATH: './test-data/e2e-mcp',
        AI_KILL_SWITCH: 'false',
        AI_IMAGE_ENABLED: 'false',
        DEFAULT_ADMIN_USERNAME: 'mcp-admin',
        DEFAULT_ADMIN_PASSWORD: 'McpAdminPassword123!',
        // Set BASE_URL for OAuth metadata endpoints
        BASE_URL: 'http://localhost:9333',
      },
    },
    {
      // MCP Inspector (UI on 6274, proxy on 6277)
      command:
        'npx -y @modelcontextprotocol/inspector',
      url: 'http://localhost:6274',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...process.env,
        // Disable auth for test automation (Inspector proxy auth, not MCP auth)
        DANGEROUSLY_OMIT_AUTH: 'true',
        // Prevent auto-opening browser
        MCP_AUTO_OPEN_ENABLED: 'false',
        // Use default ports
        CLIENT_PORT: '6274',
        SERVER_PORT: '6277',
      },
    },
  ],

  /* Single browser project */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
