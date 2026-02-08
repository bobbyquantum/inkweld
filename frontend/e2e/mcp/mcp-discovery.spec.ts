import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:9333';

/**
 * OAuth 2.1 Discovery & Dynamic Client Registration Tests
 *
 * Tests the MCP server's OAuth discovery endpoints and
 * Dynamic Client Registration (RFC 7591) without requiring
 * the Inspector UI.
 */
test.describe('OAuth Protected Resource Metadata', () => {
  test('should serve RFC 9728 protected resource metadata', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/.well-known/oauth-protected-resource`
    );
    expect(response.ok()).toBeTruthy();

    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata['resource']).toBeDefined();
    expect(metadata['authorization_servers']).toBeDefined();
    expect(metadata['scopes_supported']).toBeDefined();

    const scopes = metadata['scopes_supported'] as string[];
    expect(scopes).toContain('mcp:tools');
    expect(scopes).toContain('mcp:resources');
    expect(scopes).toContain('read:project');
    expect(scopes).toContain('read:elements');
    expect(scopes).toContain('write:elements');
    expect(scopes).toContain('read:worldbuilding');
    expect(scopes).toContain('write:worldbuilding');
  });

  test('should serve path-specific metadata for MCP endpoint', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/.well-known/oauth-protected-resource/api/v1/ai/mcp`
    );
    expect(response.ok()).toBeTruthy();

    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata['resource']).toContain('/api/v1/ai/mcp');
  });
});

test.describe('OAuth Authorization Server Metadata', () => {
  test('should serve RFC 8414 authorization server metadata', async ({
    request,
  }) => {
    const response = await request.get(
      `${API_BASE}/.well-known/oauth-authorization-server`
    );
    expect(response.ok()).toBeTruthy();

    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata['issuer']).toBeDefined();
    expect(metadata['authorization_endpoint']).toBeDefined();
    expect(metadata['token_endpoint']).toBeDefined();
    expect(metadata['registration_endpoint']).toBeDefined();
    expect(metadata['revocation_endpoint']).toBeDefined();
    expect(metadata['response_types_supported']).toEqual(['code']);
    expect(metadata['grant_types_supported']).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(metadata['code_challenge_methods_supported']).toEqual(['S256']);
  });

  test('should serve OIDC discovery as fallback', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/.well-known/openid-configuration`
    );
    expect(response.ok()).toBeTruthy();

    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata['issuer']).toBeDefined();
    expect(metadata['authorization_endpoint']).toBeDefined();
    expect(metadata['token_endpoint']).toBeDefined();
  });
});

test.describe('Dynamic Client Registration (RFC 7591)', () => {
  test('should register a public OAuth client', async ({ request }) => {
    const response = await request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `E2E Public Client ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(response.ok()).toBeTruthy();

    const client = (await response.json()) as Record<string, unknown>;
    expect(client['client_id']).toBeDefined();
    expect(typeof client['client_id']).toBe('string');
    expect(client['client_name']).toBeDefined();
    expect(client['redirect_uris']).toEqual(['http://localhost:3000/callback']);
    expect(client['token_endpoint_auth_method']).toBe('none');
    // Public clients should not receive a secret
    expect(client['client_secret']).toBeUndefined();
  });

  test('should register a confidential OAuth client', async ({ request }) => {
    const response = await request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `E2E Confidential Client ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'client_secret_basic',
      },
    });
    expect(response.ok()).toBeTruthy();

    const client = (await response.json()) as Record<string, unknown>;
    expect(client['client_id']).toBeDefined();
    expect(client['client_secret']).toBeDefined();
    expect(
      (client['client_secret'] as string).startsWith('iw_cs_')
    ).toBeTruthy();
    expect(client['client_secret_expires_at']).toBeDefined();
  });

  test('should register via alternate /register path', async ({ request }) => {
    const response = await request.post(`${API_BASE}/register`, {
      data: {
        client_name: `E2E Alt Path Client ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(response.ok()).toBeTruthy();

    const client = (await response.json()) as Record<string, unknown>;
    expect(client['client_id']).toBeDefined();
  });

  test('should register with multiple redirect URIs', async ({ request }) => {
    const response = await request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `E2E Multi Redirect ${Date.now()}`,
        redirect_uris: [
          'http://localhost:3000/callback',
          'http://localhost:4000/oauth/callback',
        ],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(response.ok()).toBeTruthy();

    const client = (await response.json()) as Record<string, unknown>;
    expect(client['redirect_uris']).toEqual([
      'http://localhost:3000/callback',
      'http://localhost:4000/oauth/callback',
    ]);
  });

  test('should reject registration without client_name', async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE}/oauth/register`, {
      data: {
        redirect_uris: ['http://localhost:3000/callback'],
      },
    });
    expect(response.ok()).toBeFalsy();
  });

  test('should reject registration without redirect_uris', async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: 'Missing Redirects',
      },
    });
    expect(response.ok()).toBeFalsy();
  });
});

test.describe('MCP Endpoint Authentication', () => {
  test('should reject unauthenticated requests with 401', async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE}/api/v1/ai/mcp`, {
      data: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
        id: 1,
      },
    });
    expect(response.status()).toBe(401);

    // RFC 9728: must include WWW-Authenticate header
    const wwwAuth = response.headers()['www-authenticate'];
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata');
  });

  test('should reject invalid token format', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        Authorization: 'Bearer invalid_token_format',
        'Content-Type': 'application/json',
      },
      data: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
        id: 1,
      },
    });
    expect(response.status()).toBe(401);
  });

  test('should reject revoked API key', async ({ request }) => {
    // Register user and create project
    const regResponse = await request.post(`${API_BASE}/api/v1/auth/register`, {
      data: {
        username: `revoke-test-${Date.now()}`,
        password: 'TestPassword123!',
      },
    });
    const { token: _authToken } = (await regResponse.json()) as {
      token: string;
    };
    const _username = `revoke-test-${Date.now()}`;

    // Need to use the same username
    const regResponse2 = await request.post(
      `${API_BASE}/api/v1/auth/register`,
      {
        data: {
          username: `revoketest${Date.now()}`,
          password: 'TestPassword123!',
        },
      }
    );
    const { token: authToken2 } = (await regResponse2.json()) as {
      token: string;
    };

    // Get the user's actual username from profile
    const meResponse = await request.get(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${authToken2}` },
    });
    const user = (await meResponse.json()) as { username: string };

    const slug = `revkey-${Date.now()}`;
    await request.post(`${API_BASE}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${authToken2}` },
      data: { title: 'Revoke Key Test', slug },
    });

    // Create and then revoke a key
    const keyResponse = await request.post(
      `${API_BASE}/api/v1/mcp-keys/${user.username}/${slug}/keys`,
      {
        headers: { Authorization: `Bearer ${authToken2}` },
        data: {
          name: 'Key to Revoke',
          permissions: ['read:project'],
        },
      }
    );
    expect(keyResponse.ok()).toBeTruthy();
    const keyData = (await keyResponse.json()) as {
      fullKey: string;
      key: { id: string };
    };

    // Revoke it
    await request.post(
      `${API_BASE}/api/v1/mcp-keys/${user.username}/${slug}/keys/${keyData.key.id}/revoke`,
      {
        headers: { Authorization: `Bearer ${authToken2}` },
      }
    );

    // Try to use the revoked key
    const mcpResponse = await request.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        Authorization: `Bearer ${keyData.fullKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
        id: 1,
      },
    });
    expect(mcpResponse.status()).toBe(401);
  });

  test('should support SSE GET for keepalive', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/ai/mcp`);
    // SSE endpoint should return 200 with event stream
    expect(response.status()).toBe(200);
  });

  test('should support DELETE for session termination', async ({ request }) => {
    const response = await request.delete(`${API_BASE}/api/v1/ai/mcp`);
    expect(response.status()).toBe(204);
  });
});
