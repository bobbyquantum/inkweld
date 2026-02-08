import { expect, test } from './fixtures';

const API_BASE = 'http://localhost:9333';

/**
 * OAuth 2.1 & MCP Discovery Tests
 *
 * Tests the OAuth discovery endpoints, Dynamic Client Registration,
 * protected resource metadata, and the consent screen UI.
 */
test.describe('OAuth Discovery Endpoints', () => {
  test('should serve Protected Resource Metadata', async ({ page }) => {
    const response = await page.request.get(
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
  });

  test('should serve path-specific Protected Resource Metadata', async ({
    page,
  }) => {
    const response = await page.request.get(
      `${API_BASE}/.well-known/oauth-protected-resource/api/v1/ai/mcp`
    );
    expect(response.ok()).toBeTruthy();

    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata['resource']).toContain('/api/v1/ai/mcp');
  });

  test('should serve Authorization Server Metadata', async ({ page }) => {
    const response = await page.request.get(
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

    const scopes = metadata['scopes_supported'] as string[];
    expect(scopes).toContain('mcp:tools');
    expect(scopes).toContain('mcp:resources');
  });

  test('should serve OpenID Connect Discovery', async ({ page }) => {
    const response = await page.request.get(
      `${API_BASE}/.well-known/openid-configuration`
    );
    expect(response.ok()).toBeTruthy();

    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata['issuer']).toBeDefined();
    expect(metadata['authorization_endpoint']).toBeDefined();
    expect(metadata['token_endpoint']).toBeDefined();
  });
});

test.describe('Dynamic Client Registration', () => {
  test('should register a public OAuth client', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `E2E Test Client ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(response.ok()).toBeTruthy();

    const client = (await response.json()) as Record<string, unknown>;
    expect(client['client_id']).toBeDefined();
    expect(client['client_name']).toBeDefined();
    expect(client['redirect_uris']).toEqual(['http://localhost:3000/callback']);
    expect(client['token_endpoint_auth_method']).toBe('none');
    // Public clients should not receive a secret
    expect(client['client_secret']).toBeUndefined();
  });

  test('should register a confidential OAuth client', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/oauth/register`, {
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
  });

  test('should reject registration without client_name', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/oauth/register`, {
      data: {
        redirect_uris: ['http://localhost:3000/callback'],
      },
    });
    expect(response.ok()).toBeFalsy();
  });
});

test.describe('MCP Endpoint', () => {
  test('should reject unauthenticated MCP requests with 401', async ({
    page,
  }) => {
    const response = await page.request.post(`${API_BASE}/api/v1/ai/mcp`, {
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

    // Should include WWW-Authenticate header with resource_metadata
    const wwwAuth = response.headers()['www-authenticate'];
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata');
  });
});

test.describe('OAuth Consent Screen', () => {
  test('should display consent screen with client info', async ({
    authenticatedPage: page,
  }) => {
    // Step 1: Register a client via DCR
    const dcrResponse = await page.request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `Consent Test ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(dcrResponse.ok()).toBeTruthy();
    const client = (await dcrResponse.json()) as {
      client_id: string;
      client_name: string;
    };

    // Step 2: Generate a fake PKCE code_challenge
    const codeChallenge = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    // Step 3: Navigate to OAuth consent screen
    await page.goto(
      `/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=mcp`
    );

    // Step 4: Verify the consent screen elements
    // Should show the client name (use mat-card-title to avoid matching the <strong> in the body text too)
    await expect(
      page.locator('mat-card-title', { hasText: client.client_name })
    ).toBeVisible();

    // Should show "Authorize" and "Deny" buttons
    await expect(page.getByRole('button', { name: 'Authorize' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deny' })).toBeVisible();

    // "Authorize" should be disabled since no projects are selected
    await expect(
      page.getByRole('button', { name: 'Authorize' })
    ).toBeDisabled();
  });

  test('should allow selecting projects and authorizing', async ({
    authenticatedPage: page,
  }) => {
    // Create a test project first
    const projectSlug = `oauth-test-${Date.now()}`;
    const authToken = await page.evaluate(() =>
      localStorage.getItem('srv:server-1:auth_token')
    );
    const createProjectResponse = await page.request.post(
      `${API_BASE}/api/v1/projects`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          title: 'OAuth Test Project',
          slug: projectSlug,
        },
      }
    );
    expect(createProjectResponse.ok()).toBeTruthy();

    // Register a client
    const dcrResponse = await page.request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `Auth Flow Test ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(dcrResponse.ok()).toBeTruthy();
    const client = (await dcrResponse.json()) as {
      client_id: string;
      client_name: string;
    };

    const codeChallenge = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    // Navigate to consent screen
    await page.goto(
      `/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=mcp&state=test123`
    );

    // Wait for projects to load
    await expect(page.getByText('OAuth Test Project')).toBeVisible();

    // Select the project via checkbox
    const projectCheckbox = page
      .locator('.project-item')
      .filter({ hasText: 'OAuth Test Project' })
      .getByRole('checkbox');
    await projectCheckbox.click();

    // Authorize button should now be enabled
    await expect(page.getByRole('button', { name: 'Authorize' })).toBeEnabled();

    // Intercept the redirect to the callback URL to capture
    // the auth code. We intercept the navigation itself rather
    // than reading the consent response body, because the page
    // navigates away immediately and the network resource
    // becomes unavailable for .json().
    let callbackUrl = '';
    await page.route('**/localhost:3000/callback**', async route => {
      callbackUrl = route.request().url();
      await route.abort();
    });

    await page.getByRole('button', { name: 'Authorize' }).click();

    // Wait for the redirect to be intercepted
    await expect.poll(() => callbackUrl, { timeout: 5000 }).toBeTruthy();

    // The callback URL should contain an auth code and state
    expect(callbackUrl).toContain('code=');
    expect(callbackUrl).toContain('state=test123');
  });

  test('should handle deny by redirecting with error', async ({
    authenticatedPage: page,
  }) => {
    // Register a client
    const dcrResponse = await page.request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `Deny Test ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(dcrResponse.ok()).toBeTruthy();
    const client = (await dcrResponse.json()) as { client_id: string };

    const codeChallenge = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    // Navigate to consent screen
    await page.goto(
      `/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&state=deny-test`
    );

    // Wait for consent screen to load
    await expect(page.getByRole('button', { name: 'Deny' })).toBeVisible();

    // Intercept the redirect to capture the deny URL
    let deniedUrl = '';
    await page.route('**/localhost:3000/callback**', async route => {
      deniedUrl = route.request().url();
      await route.abort();
    });

    // Click deny
    await page.getByRole('button', { name: 'Deny' }).click();

    // Verify the redirect URL contains the error
    await page.waitForTimeout(1000); // Give time for redirect
    // The page may navigate to the callback URL with error params
    // Since we're intercepting it, check the URL
    if (deniedUrl) {
      const url = new URL(deniedUrl);
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('state')).toBe('deny-test');
    }
  });

  test('should show error for invalid client_id', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      `/oauth/authorize?client_id=nonexistent-client&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&response_type=code&code_challenge=test&code_challenge_method=S256`
    );

    // Should show an error message
    await expect(page.getByText('Authorization Error')).toBeVisible();
  });

  test('should show error for missing parameters', async ({
    authenticatedPage: page,
  }) => {
    // Navigate with missing required parameters
    await page.goto('/oauth/authorize?client_id=test');

    // Should show an error about missing parameters
    await expect(
      page.getByText('Missing required OAuth parameters')
    ).toBeVisible();
  });
});

test.describe('Full OAuth Token Exchange', () => {
  test('should complete full PKCE authorization code flow', async ({
    authenticatedPage: page,
  }) => {
    // Step 1: Create a project
    const projectSlug = `token-test-${Date.now()}`;
    const authToken = await page.evaluate(() =>
      localStorage.getItem('srv:server-1:auth_token')
    );
    const createResponse = await page.request.post(
      `${API_BASE}/api/v1/projects`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          title: 'Token Test Project',
          slug: projectSlug,
        },
      }
    );
    expect(createResponse.ok()).toBeTruthy();

    // Step 2: Register a client
    const dcrResponse = await page.request.post(`${API_BASE}/oauth/register`, {
      data: {
        client_name: `Token Flow Test ${Date.now()}`,
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(dcrResponse.ok()).toBeTruthy();
    const client = (await dcrResponse.json()) as { client_id: string };

    // Step 3: Generate PKCE pair
    const codeVerifier = 'a'.repeat(43); // Min 43 chars per RFC 7636
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(digest);
    const codeChallenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Step 4: Navigate to consent screen
    await page.goto(
      `/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=mcp&state=token-test`
    );

    // Step 5: Select project and authorize
    await expect(page.getByText('Token Test Project')).toBeVisible();
    const checkbox = page
      .locator('.project-item')
      .filter({ hasText: 'Token Test Project' })
      .getByRole('checkbox');
    await checkbox.click();

    // Intercept the redirect to capture the callback URL.
    // We capture via route interception rather than reading
    // the consent response body, because the page navigates
    // away immediately and the network resource is discarded.
    let callbackUrl = '';
    await page.route('**/localhost:3000/callback**', async route => {
      callbackUrl = route.request().url();
      await route.abort();
    });

    await page.getByRole('button', { name: 'Authorize' }).click();

    // Wait for the redirect to be intercepted
    await expect.poll(() => callbackUrl, { timeout: 5000 }).toBeTruthy();

    // Extract the authorization code from the callback URL
    const redirectUrl = new URL(callbackUrl);
    const authCode = redirectUrl.searchParams.get('code');
    expect(authCode).toBeDefined();
    expect(authCode).toBeTruthy();

    // Step 6: Exchange auth code for tokens
    const tokenResponse = await page.request.post(`${API_BASE}/oauth/token`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `grant_type=authorization_code&code=${authCode}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&code_verifier=${codeVerifier}&client_id=${client.client_id}`,
    });
    expect(tokenResponse.ok()).toBeTruthy();

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token: string;
      scope: string;
    };
    expect(tokens.access_token).toBeDefined();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBeGreaterThan(0);
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.scope).toContain('mcp:tools');
    expect(tokens.scope).toContain('mcp:resources');

    // Step 7: Use token to make MCP request
    const mcpResponse = await page.request.post(`${API_BASE}/api/v1/ai/mcp`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
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
    expect(mcpResponse.ok()).toBeTruthy();

    const mcpResult = (await mcpResponse.json()) as {
      jsonrpc: string;
      result?: { protocolVersion: string; serverInfo: unknown };
      id: number;
    };
    expect(mcpResult.jsonrpc).toBe('2.0');
    expect(mcpResult.result).toBeDefined();
    expect(mcpResult.result?.protocolVersion).toBe('2025-06-18');
    expect(mcpResult.id).toBe(1);

    // Step 8: Refresh the token
    const refreshResponse = await page.request.post(`${API_BASE}/oauth/token`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `grant_type=refresh_token&refresh_token=${tokens.refresh_token}&client_id=${client.client_id}`,
    });
    expect(refreshResponse.ok()).toBeTruthy();

    const refreshedTokens = (await refreshResponse.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(refreshedTokens.access_token).toBeDefined();
    expect(refreshedTokens.refresh_token).toBeDefined();
    // New tokens should be different from original
    expect(refreshedTokens.access_token).not.toBe(tokens.access_token);
    expect(refreshedTokens.refresh_token).not.toBe(tokens.refresh_token);
  });
});
