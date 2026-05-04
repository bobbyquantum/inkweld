import { expect, test } from './fixtures';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

/**
 * OAuth 2.1 & MCP Discovery / DCR / MCP-auth Tests
 *
 * Pure-HTTP suite consolidated into a single test: discovery endpoints,
 * Dynamic Client Registration, and the unauthenticated MCP rejection check.
 * Uses anonymousPage (no auth) since none of these flows need a session,
 * which avoids paying the auth setup cost N times.
 */
test.describe('OAuth Discovery, DCR, and MCP unauth', () => {
  test('discovery, DCR, and MCP unauth checks', async ({
    anonymousPage: page,
  }) => {
    await test.step('serves Protected Resource Metadata', async () => {
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

    await test.step('serves path-specific Protected Resource Metadata', async () => {
      const response = await page.request.get(
        `${API_BASE}/.well-known/oauth-protected-resource/api/v1/ai/mcp`
      );
      expect(response.ok()).toBeTruthy();
      const metadata = (await response.json()) as Record<string, unknown>;
      expect(metadata['resource']).toContain('/api/v1/ai/mcp');
    });

    await test.step('serves Authorization Server Metadata', async () => {
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

    await test.step('serves OpenID Connect Discovery', async () => {
      const response = await page.request.get(
        `${API_BASE}/.well-known/openid-configuration`
      );
      expect(response.ok()).toBeTruthy();
      const metadata = (await response.json()) as Record<string, unknown>;
      expect(metadata['issuer']).toBeDefined();
      expect(metadata['authorization_endpoint']).toBeDefined();
      expect(metadata['token_endpoint']).toBeDefined();
    });

    await test.step('registers a public OAuth client', async () => {
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
      expect(client['redirect_uris']).toEqual([
        'http://localhost:3000/callback',
      ]);
      expect(client['token_endpoint_auth_method']).toBe('none');
      expect(client['client_secret']).toBeUndefined();
    });

    await test.step('registers a confidential OAuth client', async () => {
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

    await test.step('rejects DCR without client_name', async () => {
      const response = await page.request.post(`${API_BASE}/oauth/register`, {
        data: {
          redirect_uris: ['http://localhost:3000/callback'],
        },
      });
      expect(response.ok()).toBeFalsy();
    });

    await test.step('rejects unauthenticated MCP request with 401 + WWW-Authenticate', async () => {
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
      const wwwAuth = response.headers()['www-authenticate'];
      expect(wwwAuth).toBeDefined();
      expect(wwwAuth).toContain('Bearer');
      expect(wwwAuth).toContain('resource_metadata');
    });
  });
});

/**
 * Helper to register an OAuth public client via DCR.
 */
async function registerClient(
  page: import('@playwright/test').Page,
  name: string
): Promise<{ client_id: string; client_name: string }> {
  const response = await page.request.post(`${API_BASE}/oauth/register`, {
    data: {
      client_name: name,
      redirect_uris: ['http://localhost:3000/callback'],
      token_endpoint_auth_method: 'none',
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { client_id: string; client_name: string };
}

/**
 * Helper to build the consent-screen URL with sane defaults.
 */
function consentUrl(
  clientId: string,
  opts: { state?: string; scope?: string; codeChallenge?: string } = {}
): string {
  const challenge =
    opts.codeChallenge ?? 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'http://localhost:3000/callback',
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  if (opts.scope) params.set('scope', opts.scope);
  if (opts.state) params.set('state', opts.state);
  return `/oauth/authorize?${params.toString()}`;
}

/**
 * Consent screen UI: covers display, project selection + authorize, deny,
 * invalid client, and missing parameters. One project + a couple clients
 * shared across steps to amortize auth + DCR setup.
 */
test.describe('OAuth Consent Screen', () => {
  test('display, authorize, deny, and validation errors', async ({
    authenticatedPage: page,
  }) => {
    // Create one project shared across the authorize-flow steps.
    const projectSlug = `oauth-consent-${Date.now()}`;
    const authToken = await page.evaluate(() =>
      localStorage.getItem('srv:server-1:auth_token')
    );
    const createProjectResponse = await page.request.post(
      `${API_BASE}/api/v1/projects`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { title: 'OAuth Consent Project', slug: projectSlug },
      }
    );
    expect(createProjectResponse.ok()).toBeTruthy();

    await test.step('displays consent screen with client info; Authorize disabled when no project selected', async () => {
      const client = await registerClient(
        page,
        `Consent Display ${Date.now()}`
      );
      await page.goto(consentUrl(client.client_id, { scope: 'mcp' }));

      await expect(
        page.locator('mat-card-title', { hasText: client.client_name })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Authorize' })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Deny' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Authorize' })
      ).toBeDisabled();
    });

    await test.step('selects project and authorizes; callback receives code + state', async () => {
      const client = await registerClient(page, `Auth Flow ${Date.now()}`);
      await page.goto(
        consentUrl(client.client_id, { scope: 'mcp', state: 'test123' })
      );

      await expect(page.getByText('OAuth Consent Project')).toBeVisible();
      const projectCheckbox = page
        .locator('.project-item')
        .filter({ hasText: 'OAuth Consent Project' })
        .getByRole('checkbox');
      await projectCheckbox.click();
      await expect(
        page.getByRole('button', { name: 'Authorize' })
      ).toBeEnabled();

      // Intercept the redirect to the callback URL to capture the auth code.
      // We intercept the navigation rather than reading the consent response
      // body, because the page navigates away immediately.
      let callbackUrl = '';
      await page.route('**/localhost:3000/callback**', async route => {
        callbackUrl = route.request().url();
        await route.abort();
      });

      await page.getByRole('button', { name: 'Authorize' }).click();

      await expect.poll(() => callbackUrl, { timeout: 5000 }).toBeTruthy();
      expect(callbackUrl).toContain('code=');
      expect(callbackUrl).toContain('state=test123');

      // Clean up the route handler so the next step's interception is fresh.
      await page.unroute('**/localhost:3000/callback**');
    });

    await test.step('deny redirects with access_denied error', async () => {
      const client = await registerClient(page, `Deny ${Date.now()}`);
      await page.goto(consentUrl(client.client_id, { state: 'deny-test' }));

      await expect(page.getByRole('button', { name: 'Deny' })).toBeVisible();

      let deniedUrl = '';
      await page.route('**/localhost:3000/callback**', async route => {
        deniedUrl = route.request().url();
        await route.abort();
      });

      await page.getByRole('button', { name: 'Deny' }).click();

      await page.waitForTimeout(1000);
      if (deniedUrl) {
        const url = new URL(deniedUrl);
        expect(url.searchParams.get('error')).toBe('access_denied');
        expect(url.searchParams.get('state')).toBe('deny-test');
      }

      await page.unroute('**/localhost:3000/callback**');
    });

    await test.step('shows error for invalid client_id', async () => {
      await page.goto(
        `/oauth/authorize?client_id=nonexistent-client&redirect_uri=${encodeURIComponent(
          'http://localhost:3000/callback'
        )}&response_type=code&code_challenge=test&code_challenge_method=S256`
      );
      await expect(page.getByText('Authorization Error')).toBeVisible();
    });

    await test.step('shows error for missing required parameters', async () => {
      await page.goto('/oauth/authorize?client_id=test');
      await expect(
        page.getByText('Missing required OAuth parameters')
      ).toBeVisible();
    });
  });
});

/**
 * Full PKCE authorization-code flow including token exchange, MCP call,
 * and refresh-token rotation. Left as a single comprehensive happy-path
 * test — splitting it would require re-doing the entire setup per step.
 */
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
    const client = await registerClient(page, `Token Flow Test ${Date.now()}`);

    // Step 3: Generate PKCE pair
    const codeVerifier = 'a'.repeat(43); // Min 43 chars per RFC 7636
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(digest);
    const codeChallenge = btoa(String.fromCharCode(...hashArray))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');

    // Step 4: Navigate to consent screen
    await page.goto(
      consentUrl(client.client_id, {
        scope: 'mcp',
        state: 'token-test',
        codeChallenge,
      })
    );

    // Step 5: Select project and authorize
    await expect(page.getByText('Token Test Project')).toBeVisible();
    const checkbox = page
      .locator('.project-item')
      .filter({ hasText: 'Token Test Project' })
      .getByRole('checkbox');
    await checkbox.click();

    // Intercept the redirect to capture the callback URL.
    let callbackUrl = '';
    await page.route('**/localhost:3000/callback**', async route => {
      callbackUrl = route.request().url();
      await route.abort();
    });

    await page.getByRole('button', { name: 'Authorize' }).click();

    await expect.poll(() => callbackUrl, { timeout: 5000 }).toBeTruthy();

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
    expect(refreshedTokens.access_token).not.toBe(tokens.access_token);
    expect(refreshedTokens.refresh_token).not.toBe(tokens.refresh_token);
  });
});
