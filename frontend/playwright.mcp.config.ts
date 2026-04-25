import { defineConfig, devices } from '@playwright/test';

import { TEST_PASSWORDS, TEST_SESSION_SECRETS } from './e2e/common/test-credentials';
import { getPort } from './e2e/common/free-port';

/**
 * MCP (Model Context Protocol) E2E Test Configuration
 *
 * Tests the MCP server functionality end-to-end using:
 * - Direct JSON-RPC HTTP calls to the MCP Streamable HTTP endpoint
 * - The MCP Inspector UI for connection and interactive testing
 *
 * Spins up:
 * 1. Backend server with in-memory database
 * 2. MCP Inspector UI + proxy
 *
 * Usage:
 *   npm run e2e:mcp
 *   npm run e2e:mcp:ui
 *   npm run e2e:mcp:debug
 */

const backendPort = await getPort('PLAYWRIGHT_BACKEND_PORT');
const inspectorUiPort = await getPort('PLAYWRIGHT_MCP_INSPECTOR_UI_PORT');
const inspectorProxyPort = await getPort('PLAYWRIGHT_MCP_INSPECTOR_PROXY_PORT');
const backendUrl = `http://localhost:${backendPort}`;
const inspectorUiUrl = `http://localhost:${inspectorUiPort}`;

// Expose ports to globalSetup and test workers via environment variables
process.env['API_BASE_URL'] = backendUrl;
process.env['MCP_INSPECTOR_URL'] = inspectorUiUrl;
process.env['PLAYWRIGHT_BACKEND_PORT'] = String(backendPort);
process.env['PLAYWRIGHT_MCP_INSPECTOR_UI_PORT'] = String(inspectorUiPort);
process.env['PLAYWRIGHT_MCP_INSPECTOR_PROXY_PORT'] = String(inspectorProxyPort);

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
      url: `${backendUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(backendPort),
        DB_TYPE: 'sqlite',
        DB_DATABASE: ':memory:',
        SESSION_SECRET: TEST_SESSION_SECRETS.MCP,
        ALLOWED_ORIGINS: `${inspectorUiUrl},http://localhost:${inspectorProxyPort},http://localhost:4200`,
        USER_APPROVAL_REQUIRED: 'false',
        GITHUB_ENABLED: 'false',
        DATA_PATH: './test-data/e2e-mcp',
        AI_KILL_SWITCH: 'false',
        AI_IMAGE_ENABLED: 'false',
        DEFAULT_ADMIN_USERNAME: 'mcp-admin',
        DEFAULT_ADMIN_PASSWORD: TEST_PASSWORDS.MCP_ADMIN,
        // Set BASE_URL for OAuth metadata endpoints
        BASE_URL: backendUrl,
      },
    },
    {
      // MCP Inspector (UI + proxy)
      command:
        'npx -y @modelcontextprotocol/inspector',
      url: inspectorUiUrl,
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...process.env,
        // Disable auth for test automation (Inspector proxy auth, not MCP auth)
        DANGEROUSLY_OMIT_AUTH: 'true',
        // Prevent auto-opening browser
        MCP_AUTO_OPEN_ENABLED: 'false',
        CLIENT_PORT: String(inspectorUiPort),
        SERVER_PORT: String(inspectorProxyPort),
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
