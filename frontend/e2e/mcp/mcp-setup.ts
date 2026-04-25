/**
 * Global setup for MCP e2e tests.
 *
 * Verifies:
 * 1. Backend server is healthy
 * 2. Admin user is seeded
 * 3. MCP Inspector is accessible
 */

import { request } from '@playwright/test';

import { TEST_PASSWORDS } from '../common/test-credentials';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';
const INSPECTOR_BASE =
  process.env['MCP_INSPECTOR_URL'] ?? 'http://localhost:6274';

const DEFAULT_ADMIN = {
  username: 'mcp-admin',
  password: TEST_PASSWORDS.MCP_ADMIN,
};

export default async function globalSetup(): Promise<void> {
  console.log('\n🔧 MCP E2E Global Setup');
  console.log('========================\n');

  const context = await request.newContext({ baseURL: API_BASE });

  try {
    // Step 1: Verify backend health
    console.log('1️⃣  Checking backend health...');
    const healthResponse = await context.get('/api/v1/health');
    if (!healthResponse.ok()) {
      throw new Error(
        `Backend health check failed: ${healthResponse.status()} ${await healthResponse.text()}`
      );
    }
    console.log('   ✅ Backend is healthy\n');

    // Step 2: Verify admin user
    console.log('2️⃣  Verifying admin user...');
    const loginResponse = await context.post('/api/v1/auth/login', {
      data: {
        username: DEFAULT_ADMIN.username,
        password: DEFAULT_ADMIN.password,
      },
    });
    if (!loginResponse.ok()) {
      throw new Error(
        `Admin login failed: ${loginResponse.status()} ${await loginResponse.text()}`
      );
    }
    console.log('   ✅ Admin user authenticated\n');

    // Step 3: Verify MCP Inspector is accessible
    console.log('3️⃣  Checking MCP Inspector...');
    const inspectorContext = await request.newContext({
      baseURL: INSPECTOR_BASE,
    });
    try {
      const inspectorResponse = await inspectorContext.get('/');
      if (!inspectorResponse.ok()) {
        throw new Error(
          `MCP Inspector not accessible: ${inspectorResponse.status()}`
        );
      }
      console.log('   ✅ MCP Inspector is running\n');
    } finally {
      await inspectorContext.dispose();
    }

    // Step 4: Verify MCP endpoint responds (unauthenticated = 401)
    console.log('4️⃣  Checking MCP endpoint...');
    const mcpResponse = await context.post('/api/v1/ai/mcp', {
      data: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'setup-check', version: '1.0.0' },
        },
        id: 1,
      },
    });
    // 401 is expected (no auth token) - proves the endpoint exists
    if (mcpResponse.status() !== 401) {
      console.log(
        `   ⚠️  Unexpected MCP response: ${mcpResponse.status()} (expected 401)`
      );
    } else {
      console.log('   ✅ MCP endpoint is responding\n');
    }

    console.log('🎉 MCP E2E Global Setup Complete!\n');
  } finally {
    await context.dispose();
  }
}
