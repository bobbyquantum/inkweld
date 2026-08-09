import { expect, test } from '@playwright/test';

import { TEST_PASSWORDS } from '../common/test-credentials';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

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
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'server/discover',
      },
      data: {
        jsonrpc: '2.0',
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'test',
              version: '1.0.0',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
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
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'server/discover',
      },
      data: {
        jsonrpc: '2.0',
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'test',
              version: '1.0.0',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
        id: 1,
      },
    });
    expect(response.status()).toBe(401);
  });

  test('should reject revoked API key', async ({ request }) => {
    // Register a single user and create a project
    const username = `revoketest${Date.now()}`;
    const regResponse = await request.post(`${API_BASE}/api/v1/auth/register`, {
      data: { username, password: TEST_PASSWORDS.USER },
    });
    expect(regResponse.ok()).toBeTruthy();
    const { token: authToken } = (await regResponse.json()) as {
      token: string;
    };

    const slug = `revkey-${Date.now()}`;
    const projectResponse = await request.post(`${API_BASE}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { title: 'Revoke Key Test', slug },
    });
    expect(projectResponse.ok()).toBeTruthy();

    // Create and then revoke a key
    const keyResponse = await request.post(
      `${API_BASE}/api/v1/mcp-keys/${username}/${slug}/keys`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
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
      `${API_BASE}/api/v1/mcp-keys/${username}/${slug}/keys/${keyData.key.id}/revoke`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    // Try to use the revoked key
    const mcpResponse = await request.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        Authorization: `Bearer ${keyData.fullKey}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'server/discover',
      },
      data: {
        jsonrpc: '2.0',
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'test',
              version: '1.0.0',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
        id: 1,
      },
    });
    expect(mcpResponse.status()).toBe(401);
  });

  test('should return 405 for GET (SSE stream endpoint removed)', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/v1/ai/mcp`);
    // The 2026-07-28 stateless revision removed the GET SSE stream endpoint.
    expect(response.status()).toBe(405);
  });

  test('should return 405 for DELETE (session termination removed)', async ({
    request,
  }) => {
    const response = await request.delete(`${API_BASE}/api/v1/ai/mcp`);
    // Protocol-level sessions were removed in 2026-07-28.
    expect(response.status()).toBe(405);
  });
});
