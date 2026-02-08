import { APIRequestContext, expect, test as base } from '@playwright/test';

export const API_BASE = 'http://localhost:9333';
export const INSPECTOR_URL = 'http://localhost:6274';

// ============================================
// Types
// ============================================

interface McpTestContext {
  /** Auth token for API calls */
  authToken: string;
  /** Username of the test user */
  username: string;
  /** Project slug */
  projectSlug: string;
  /** Project identifier for MCP tools (username/slug) */
  projectKey: string;
  /** MCP API key (full key, iw_proj_...) */
  mcpApiKey: string;
  /** OAuth access token (if obtained) */
  oauthAccessToken?: string;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Register a user and return the auth token
 */
async function registerUser(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const response = await request.post(`${API_BASE}/api/v1/auth/register`, {
    data: { username, password },
  });
  if (!response.ok()) {
    throw new Error(
      `Registration failed: ${response.status()} ${await response.text()}`
    );
  }
  const data = (await response.json()) as { token: string };
  if (!data.token) {
    throw new Error('Registration succeeded but no token returned');
  }
  return data.token;
}

/**
 * Create a project via the backend API
 */
async function createProject(
  request: APIRequestContext,
  authToken: string,
  title: string,
  slug: string
): Promise<{ id: string; slug: string }> {
  const response = await request.post(`${API_BASE}/api/v1/projects`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { title, slug },
  });
  if (!response.ok()) {
    throw new Error(
      `Create project failed: ${response.status()} ${await response.text()}`
    );
  }
  return (await response.json()) as { id: string; slug: string };
}

/**
 * Create an MCP API key for a project
 */
async function createMcpKey(
  request: APIRequestContext,
  authToken: string,
  username: string,
  slug: string,
  permissions: string[] = [
    'read:project',
    'read:elements',
    'read:worldbuilding',
    'read:schemas',
    'write:elements',
    'write:worldbuilding',
  ]
): Promise<string> {
  const response = await request.post(
    `${API_BASE}/api/v1/mcp-keys/${username}/${slug}/keys`,
    {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: `E2E Test Key ${Date.now()}`,
        permissions,
      },
    }
  );
  if (!response.ok()) {
    throw new Error(
      `Create MCP key failed: ${response.status()} ${await response.text()}`
    );
  }
  const data = (await response.json()) as { fullKey: string };
  if (!data.fullKey) {
    throw new Error('MCP key created but fullKey not returned');
  }
  return data.fullKey;
}

/**
 * Send a JSON-RPC request to the MCP endpoint
 */
export async function mcpRequest(
  request: APIRequestContext,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  id: number = 1
): Promise<JsonRpcResponse> {
  const response = await request.post(`${API_BASE}/api/v1/ai/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      jsonrpc: '2.0',
      method,
      params,
      id,
    },
  });
  return (await response.json()) as JsonRpcResponse;
}

/**
 * Initialize an MCP session and return the response
 */
export async function mcpInitialize(
  request: APIRequestContext,
  token: string
): Promise<JsonRpcResponse> {
  return mcpRequest(request, token, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '1.0.0' },
  });
}

/**
 * Call an MCP tool and return the result
 */
export async function mcpCallTool(
  request: APIRequestContext,
  token: string,
  toolName: string,
  args: Record<string, unknown> = {},
  id: number = 1
): Promise<JsonRpcResponse> {
  return mcpRequest(
    request,
    token,
    'tools/call',
    { name: toolName, arguments: args },
    id
  );
}

/**
 * Complete PKCE flow and return OAuth access token
 */
export async function performOAuthFlow(
  request: APIRequestContext,
  authToken: string,
  projectSlug: string
): Promise<{ accessToken: string; refreshToken: string; clientId: string }> {
  // Step 1: Register OAuth client
  const dcrResponse = await request.post(`${API_BASE}/oauth/register`, {
    data: {
      client_name: `MCP E2E Test ${Date.now()}`,
      redirect_uris: ['http://localhost:3000/callback'],
      token_endpoint_auth_method: 'none',
    },
  });
  expect(dcrResponse.ok()).toBeTruthy();
  const client = (await dcrResponse.json()) as { client_id: string };

  // Step 2: Generate PKCE pair
  const codeVerifier = 'a'.repeat(43);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(digest);
  const codeChallenge = Buffer.from(hashArray)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Step 3: Get authorization (using API directly since we have a session token)
  // First, get the authorize info to find available projects
  const authorizeInfoResponse = await request.get(
    `${API_BASE}/oauth/authorize?client_id=${client.client_id}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=mcp`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    }
  );

  let grantProjectId: string | undefined;
  if (authorizeInfoResponse.ok()) {
    const authorizeInfo = (await authorizeInfoResponse.json()) as {
      projects?: Array<{ id: string; slug: string }>;
    };
    grantProjectId = authorizeInfo.projects?.find(
      p => p.slug === projectSlug
    )?.id;
  }

  // Step 4: Submit consent
  const consentResponse = await request.post(`${API_BASE}/oauth/authorize`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      client_id: client.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: 'mcp',
      state: 'e2e-test',
      grants: [
        {
          projectId: grantProjectId,
          role: 'fullAccess',
        },
      ],
    },
  });

  // Extract auth code from redirect URL
  let authCode: string;
  if (consentResponse.status() === 302 || consentResponse.status() === 303) {
    const location = consentResponse.headers()['location'] || '';
    const url = new URL(location);
    authCode = url.searchParams.get('code') || '';
  } else if (consentResponse.ok()) {
    const consentData = (await consentResponse.json()) as {
      redirect_uri?: string;
      code?: string;
    };
    if (consentData.redirect_uri) {
      const url = new URL(consentData.redirect_uri);
      authCode = url.searchParams.get('code') || '';
    } else {
      authCode = consentData.code || '';
    }
  } else {
    throw new Error(
      `Consent failed: ${consentResponse.status()} ${await consentResponse.text()}`
    );
  }

  if (!authCode) {
    throw new Error('No authorization code received from consent');
  }

  // Step 5: Exchange auth code for tokens
  const tokenResponse = await request.post(`${API_BASE}/oauth/token`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: `grant_type=authorization_code&code=${authCode}&redirect_uri=${encodeURIComponent('http://localhost:3000/callback')}&code_verifier=${codeVerifier}&client_id=${client.client_id}`,
  });
  expect(tokenResponse.ok()).toBeTruthy();

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
  };

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    clientId: client.client_id,
  };
}

// ============================================
// Test Fixtures
// ============================================

export type McpFixtures = {
  /**
   * Full MCP test context: user, project, API key.
   * Uses API key for MCP authentication.
   */
  mcpContext: McpTestContext;

  /**
   * API request context for making direct HTTP calls.
   */
  apiRequest: APIRequestContext;
};

/**
 * Extended test with MCP fixtures
 */
export const test = base.extend<McpFixtures>({
  mcpContext: async ({ request }, use) => {
    const testId = `mcp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const username = `mcpuser-${testId}`;
    const password = 'McpTestPassword123!';
    const projectSlug = `mcp-project-${testId}`;

    // Register user
    const authToken = await registerUser(request, username, password);

    // Create project
    await createProject(request, authToken, 'MCP Test Project', projectSlug);

    // Create MCP API key with full permissions
    const mcpApiKey = await createMcpKey(
      request,
      authToken,
      username,
      projectSlug
    );

    // Initialize MCP session
    const initResult = await mcpInitialize(request, mcpApiKey);
    expect(initResult.error).toBeUndefined();

    const context: McpTestContext = {
      authToken,
      username,
      projectSlug,
      projectKey: `${username}/${projectSlug}`,
      mcpApiKey,
    };

    await use(context);
  },

  apiRequest: async ({ request }, use) => {
    await use(request);
  },
});

export { expect };
