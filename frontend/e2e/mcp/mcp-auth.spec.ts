import {
  API_BASE,
  expect,
  mcpCallTool,
  mcpInitialize,
  mcpRequest,
  performOAuthFlow,
  test,
} from './fixtures';

/**
 * MCP Authentication E2E Tests
 *
 * Tests API key auth, full OAuth PKCE flow, and token refresh
 * against the real MCP server.
 */
test.describe('API Key Authentication', () => {
  test('should initialize MCP session with valid API key', async ({
    mcpContext,
    apiRequest,
  }) => {
    const result = await mcpInitialize(apiRequest, mcpContext.mcpApiKey);

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const initResult = result.result as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: Record<string, unknown>;
    };
    expect(initResult.protocolVersion).toBe('2025-06-18');
    expect(initResult.serverInfo.name).toBe('inkweld-mcp');
    expect(initResult.serverInfo.version).toBe('1.0.0');
    expect(initResult.capabilities['resources']).toBeDefined();
    expect(initResult.capabilities['tools']).toBeDefined();
    expect(initResult.capabilities['prompts']).toBeDefined();
  });

  test('should return Mcp-Session-Id header on initialize', async ({
    mcpContext,
    apiRequest,
  }) => {
    const response = await apiRequest.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        Authorization: `Bearer ${mcpContext.mcpApiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'e2e-test', version: '1.0.0' },
        },
        id: 1,
      },
    });

    expect(response.ok()).toBeTruthy();
    const sessionId = response.headers()['mcp-session-id'];
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  test('should handle ping method', async ({ mcpContext, apiRequest }) => {
    const result = await mcpRequest(apiRequest, mcpContext.mcpApiKey, 'ping');

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({});
  });

  test('should return 202 for notifications', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Notifications have no id field
    const response = await apiRequest.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        Authorization: `Bearer ${mcpContext.mcpApiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
    });

    expect(response.status()).toBe(202);
  });

  test('should reject unknown methods', async ({ mcpContext, apiRequest }) => {
    const result = await mcpRequest(
      apiRequest,
      mcpContext.mcpApiKey,
      'nonexistent/method'
    );

    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(-32601); // METHOD_NOT_FOUND
  });

  test('should support X-API-Key header', async ({
    mcpContext,
    apiRequest,
  }) => {
    const response = await apiRequest.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        'X-API-Key': mcpContext.mcpApiKey,
        'Content-Type': 'application/json',
      },
      data: {
        jsonrpc: '2.0',
        method: 'ping',
        id: 1,
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      result?: unknown;
      error?: unknown;
    };
    expect(body.result).toEqual({});
  });
});

test.describe('OAuth PKCE Authorization Flow', () => {
  test('should complete full PKCE auth code flow and use token for MCP', async ({
    mcpContext,
    apiRequest,
  }) => {
    // Perform the complete OAuth flow
    const oauth = await performOAuthFlow(
      apiRequest,
      mcpContext.authToken,
      mcpContext.projectSlug
    );

    expect(oauth.accessToken).toBeDefined();
    expect(oauth.refreshToken).toBeDefined();
    expect(oauth.clientId).toBeDefined();

    // Use the OAuth token for MCP initialization
    const initResult = await mcpInitialize(apiRequest, oauth.accessToken);
    expect(initResult.error).toBeUndefined();

    const result = initResult.result as { protocolVersion: string };
    expect(result.protocolVersion).toBe('2025-06-18');
  });

  test('should refresh OAuth token', async ({ mcpContext, apiRequest }) => {
    const oauth = await performOAuthFlow(
      apiRequest,
      mcpContext.authToken,
      mcpContext.projectSlug
    );

    // Refresh the token
    const refreshResponse = await apiRequest.post(`${API_BASE}/oauth/token`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `grant_type=refresh_token&refresh_token=${oauth.refreshToken}&client_id=${oauth.clientId}`,
    });
    expect(refreshResponse.ok()).toBeTruthy();

    const refreshed = (await refreshResponse.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(refreshed.access_token).toBeDefined();
    expect(refreshed.refresh_token).toBeDefined();
    // Tokens should be different
    expect(refreshed.access_token).not.toBe(oauth.accessToken);
    expect(refreshed.refresh_token).not.toBe(oauth.refreshToken);

    // New token should work for MCP
    const result = await mcpRequest(apiRequest, refreshed.access_token, 'ping');
    expect(result.error).toBeUndefined();
  });

  test('should revoke OAuth token', async ({ mcpContext, apiRequest }) => {
    const oauth = await performOAuthFlow(
      apiRequest,
      mcpContext.authToken,
      mcpContext.projectSlug
    );

    // Revoke the refresh token
    const revokeResponse = await apiRequest.post(`${API_BASE}/oauth/revoke`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `token=${oauth.refreshToken}&client_id=${oauth.clientId}`,
    });
    // RFC 7009: always returns 200
    expect(revokeResponse.ok()).toBeTruthy();
  });
});

test.describe('Read-Only API Key Permissions', () => {
  test('should deny write operations with read-only key', async ({
    apiRequest,
  }) => {
    // Register user and create project
    const testId = `readonly-${Date.now()}`;
    const regResp = await apiRequest.post(`${API_BASE}/api/v1/auth/register`, {
      data: { username: testId, password: 'TestPassword123!' },
    });
    const { token } = (await regResp.json()) as { token: string };

    const slug = `ro-project-${Date.now()}`;
    await apiRequest.post(`${API_BASE}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'Read-Only Test', slug },
    });

    // Create read-only API key
    const keyResp = await apiRequest.post(
      `${API_BASE}/api/v1/mcp-keys/${testId}/${slug}/keys`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: 'Read-Only Key',
          permissions: ['read:project', 'read:elements'],
        },
      }
    );
    const { fullKey } = (await keyResp.json()) as { fullKey: string };

    // Initialize
    await mcpInitialize(apiRequest, fullKey);

    // Try a write operation - should fail
    const result = await mcpCallTool(apiRequest, fullKey, 'create_element', {
      project: `${testId}/${slug}`,
      name: 'Test Element',
      type: 'FOLDER',
    });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain('Permission denied');
  });
});
