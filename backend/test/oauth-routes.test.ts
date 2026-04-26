/**
 * Integration tests for OAuth 2.1 route handlers (oauth.routes.ts)
 *
 * Tests the HTTP route layer: discovery endpoints, client registration,
 * authorization flow, token exchange, revocation, and session management.
 * The underlying service logic is tested in mcp-oauth.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { mcpOAuthClients } from '../src/db/schema/mcp-oauth-clients';
import { mcpOAuthSessions } from '../src/db/schema/mcp-oauth-sessions';
import { mcpOAuthCodes } from '../src/db/schema/mcp-oauth-codes';
import { projectCollaborators } from '../src/db/schema/project-collaborators';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';

const db = getDatabase();
let client: TestClient;
let unauthClient: TestClient;
let testServer: { port: number; baseUrl: string };

const USER_ID = crypto.randomUUID();
const PROJECT_ID = crypto.randomUUID();
const PROJECT_2_ID = crypto.randomUUID();

beforeAll(async () => {
  testServer = await startTestServer();
  // Legacy password-flow tests: opt in to PASSWORD_LOGIN_ENABLED.
  await enablePasswordLoginForTests();
  client = new TestClient(testServer.baseUrl);
  unauthClient = new TestClient(testServer.baseUrl);

  // Clean up any leftover test data
  await db.delete(users).where(eq(users.username, 'oauthrouteuser'));

  const hashedPassword = await bcrypt.hash('testpass123', 10);

  await db.insert(users).values({
    id: USER_ID,
    username: 'oauthrouteuser',
    email: 'oauthrouteuser@example.com',
    password: hashedPassword,
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  const now = Date.now();
  await db.insert(projects).values([
    {
      id: PROJECT_ID,
      title: 'OAuth Route Test Project',
      slug: 'oauth-route-test',
      userId: USER_ID,
      createdDate: now,
      updatedDate: now,
    },
    {
      id: PROJECT_2_ID,
      title: 'OAuth Route Test Project 2',
      slug: 'oauth-route-test-2',
      userId: USER_ID,
      createdDate: now,
      updatedDate: now,
    },
  ]);

  await client.login('oauthrouteuser', 'testpass123');
});

afterAll(async () => {
  await db.delete(projectCollaborators).where(eq(projectCollaborators.userId, USER_ID));
  await db.delete(mcpOAuthSessions).where(eq(mcpOAuthSessions.userId, USER_ID));
  await db.delete(mcpOAuthCodes).where(eq(mcpOAuthCodes.userId, USER_ID));
  await db.delete(mcpOAuthClients).where(eq(mcpOAuthClients.clientName, 'Route Test App'));
  await db.delete(mcpOAuthClients).where(eq(mcpOAuthClients.clientName, 'Confidential Route App'));
  await db.delete(mcpOAuthClients).where(eq(mcpOAuthClients.clientName, 'Minimal App'));
  await db.delete(projects).where(eq(projects.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
  await stopTestServer();
});

// Helper: compute S256 PKCE challenge from a code verifier
async function computeCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCodePoint(b);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

// ============================================
// DISCOVERY ENDPOINTS
// ============================================
describe('OAuth Discovery Endpoints', () => {
  it('GET /.well-known/oauth-protected-resource returns resource metadata', async () => {
    const { response, json } = await unauthClient.request('/.well-known/oauth-protected-resource');
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.resource).toContain('/api/v1/ai/mcp');
    expect(data.authorization_servers).toBeDefined();
    expect(data.bearer_methods_supported).toEqual(['header']);
    expect(Array.isArray(data.scopes_supported)).toBe(true);
  });

  it('GET /.well-known/oauth-protected-resource/* returns same metadata for path-specific requests', async () => {
    const { response, json } = await unauthClient.request(
      '/.well-known/oauth-protected-resource/api/v1/ai/mcp'
    );
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.resource).toContain('/api/v1/ai/mcp');
    expect(data.bearer_methods_supported).toEqual(['header']);
  });

  it('GET /.well-known/oauth-authorization-server returns auth server metadata', async () => {
    const { response, json } = await unauthClient.request(
      '/.well-known/oauth-authorization-server'
    );
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.issuer).toBeDefined();
    expect(data.token_endpoint).toContain('/oauth/token');
    expect(data.registration_endpoint).toContain('/oauth/register');
    expect(data.revocation_endpoint).toContain('/oauth/revoke');
    expect(data.response_types_supported).toEqual(['code']);
    expect(data.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(data.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('GET /.well-known/openid-configuration returns OIDC-compatible metadata', async () => {
    const { response, json } = await unauthClient.request('/.well-known/openid-configuration');
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.issuer).toBeDefined();
    expect(data.token_endpoint).toContain('/oauth/token');
    expect(data.subject_types_supported).toEqual(['public']);
    expect(data.id_token_signing_alg_values_supported).toEqual(['RS256']);
  });
});

// ============================================
// DYNAMIC CLIENT REGISTRATION
// ============================================
describe('OAuth Client Registration', () => {
  it('POST /oauth/register creates a public client', async () => {
    const { response, json } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Route Test App',
        redirect_uris: ['http://localhost:9999/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(response.status).toBe(201);
    const data = (await json()) as Record<string, unknown>;
    expect(data.client_id).toBeDefined();
    expect(data.client_name).toBe('Route Test App');
    expect(data.redirect_uris).toEqual(['http://localhost:9999/callback']);
    expect(data.token_endpoint_auth_method).toBe('none');
    // Public clients should not get a secret
    expect(data.client_secret).toBeUndefined();
  });

  it('POST /register (alias) also works', async () => {
    const { response, json } = await unauthClient.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Minimal App',
        redirect_uris: ['http://localhost:8888/callback'],
      }),
    });
    expect(response.status).toBe(201);
    const data = (await json()) as Record<string, unknown>;
    expect(data.client_id).toBeDefined();
    expect(data.client_name).toBe('Minimal App');
  });

  it('POST /oauth/register creates a confidential client with secret', async () => {
    const { response, json } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Confidential Route App',
        redirect_uris: ['http://localhost:7777/callback'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    });
    expect(response.status).toBe(201);
    const data = (await json()) as Record<string, unknown>;
    expect(data.client_id).toBeDefined();
    expect(data.client_secret).toBeDefined();
    expect(data.token_endpoint_auth_method).toBe('client_secret_basic');
  });

  it('POST /oauth/register with optional URIs includes them in response', async () => {
    const { response, json } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Route Test App',
        redirect_uris: ['http://localhost:9999/callback'],
        client_uri: 'http://example.com',
        logo_uri: 'http://example.com/logo.png',
        policy_uri: 'http://example.com/policy',
        tos_uri: 'http://example.com/tos',
        contacts: ['admin@example.com'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(response.status).toBe(201);
    const data = (await json()) as Record<string, unknown>;
    expect(data.client_uri).toBe('http://example.com');
    expect(data.logo_uri).toBe('http://example.com/logo.png');
    expect(data.policy_uri).toBe('http://example.com/policy');
    expect(data.tos_uri).toBe('http://example.com/tos');
  });

  it('POST /oauth/register rejects missing client_name', async () => {
    const { response } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['http://localhost:9999/callback'],
      }),
    });
    expect(response.status).toBe(400);
  });

  it('POST /oauth/register rejects missing redirect_uris', async () => {
    const { response } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'No Redirect App',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('POST /oauth/register rejects invalid redirect_uri', async () => {
    const { response } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Bad URI App',
        redirect_uris: ['not-a-url'],
      }),
    });
    expect(response.status).toBe(400);
  });
});

// ============================================
// AUTHORIZATION ENDPOINT
// ============================================
describe('OAuth Authorization Endpoint', () => {
  let registeredClientId: string;
  const codeVerifier = 'test-code-verifier-that-is-long-enough-for-pkce-validation';
  let codeChallenge: string;

  beforeAll(async () => {
    codeChallenge = await computeCodeChallenge(codeVerifier);

    // Register a client for authorization tests
    const { json } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Route Test App',
        redirect_uris: ['http://localhost:9999/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    const data = (await json()) as Record<string, unknown>;
    registeredClientId = data.client_id as string;
  });

  it('GET /oauth/authorize returns 401 for unauthenticated API requests', async () => {
    const params = new URLSearchParams({
      client_id: registeredClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { response, json } = await unauthClient.request(`/oauth/authorize?${params}`);
    expect(response.status).toBe(401);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('unauthorized');
  });

  it('GET /oauth/authorize returns authorization info for authenticated user', async () => {
    const params = new URLSearchParams({
      client_id: registeredClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { response, json } = await client.request(`/oauth/authorize?${params}`);
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.client).toBeDefined();
    expect(data.projects).toBeDefined();
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it('POST /oauth/authorize returns 401 for unauthenticated user', async () => {
    const params = new URLSearchParams({
      client_id: registeredClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { response, json } = await unauthClient.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [{ projectId: PROJECT_ID, role: 'editor' }],
      }),
    });
    expect(response.status).toBe(401);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('unauthorized');
  });

  it('POST /oauth/authorize submits consent and returns redirect URI', async () => {
    const params = new URLSearchParams({
      client_id: registeredClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { response, json } = await client.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [{ projectId: PROJECT_ID, role: 'editor' }],
      }),
    });
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.redirectUri).toBeDefined();
    expect(data.redirectUri as string).toContain('http://localhost:9999/callback');
    expect(data.redirectUri as string).toContain('code=');
  });

  it('POST /oauth/authorize rejects grant for project user does not own', async () => {
    const params = new URLSearchParams({
      client_id: registeredClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { response, json } = await client.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [{ projectId: 'non-existent-project-id', role: 'editor' }],
      }),
    });
    expect(response.status).toBe(400);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('invalid_request');
  });
});

// ============================================
// TOKEN ENDPOINT
// ============================================
describe('OAuth Token Endpoint', () => {
  let registeredClientId: string;
  const codeVerifier = 'another-code-verifier-that-is-long-enough-for-pkce';
  let codeChallenge: string;

  beforeAll(async () => {
    codeChallenge = await computeCodeChallenge(codeVerifier);

    const { json } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Route Test App',
        redirect_uris: ['http://localhost:9999/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    const data = (await json()) as Record<string, unknown>;
    registeredClientId = data.client_id as string;
  });

  async function getAuthorizationCode(): Promise<string> {
    const params = new URLSearchParams({
      client_id: registeredClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { json } = await client.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [{ projectId: PROJECT_ID, role: 'editor' }],
      }),
    });
    const data = (await json()) as Record<string, unknown>;
    const redirectUri = data.redirectUri as string;
    const url = new URL(redirectUri);
    return url.searchParams.get('code') as string;
  }

  it('POST /oauth/token exchanges authorization code for tokens (JSON)', async () => {
    const code = await getAuthorizationCode();
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: 'http://localhost:9999/callback',
        client_id: registeredClientId,
      }),
    });
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
    expect(data.expires_in).toBeDefined();
    expect(data.refresh_token).toBeDefined();
  });

  it('POST /oauth/token exchanges code via form-urlencoded', async () => {
    const code = await getAuthorizationCode();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: 'http://localhost:9999/callback',
      client_id: registeredClientId,
    });
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
  });

  it('POST /oauth/token rejects missing code', async () => {
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: registeredClientId,
        redirect_uri: 'http://localhost:9999/callback',
      }),
    });
    expect(response.status).toBe(400);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('invalid_request');
  });

  it('POST /oauth/token rejects missing refresh_token for refresh grant', async () => {
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: registeredClientId,
      }),
    });
    expect(response.status).toBe(400);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('invalid_request');
  });

  it('POST /oauth/token refreshes tokens with valid refresh_token', async () => {
    const code = await getAuthorizationCode();
    // First, exchange for tokens
    const { json: tokenJson } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: 'http://localhost:9999/callback',
        client_id: registeredClientId,
      }),
    });
    const tokens = (await tokenJson()) as Record<string, unknown>;
    const refreshToken = tokens.refresh_token as string;

    // Now refresh
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: registeredClientId,
      }),
    });
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
    expect(data.refresh_token).toBeDefined();
  });

  it('POST /oauth/token supports Basic auth for client credentials', async () => {
    // Register a confidential client
    const { json: regJson } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Confidential Route App',
        redirect_uris: ['http://localhost:7777/callback'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    });
    const regData = (await regJson()) as Record<string, unknown>;
    const confClientId = regData.client_id as string;
    const confClientSecret = regData.client_secret as string;

    // Get an auth code for this client
    const confCodeChallenge = await computeCodeChallenge(codeVerifier);
    const params = new URLSearchParams({
      client_id: confClientId,
      redirect_uri: 'http://localhost:7777/callback',
      response_type: 'code',
      code_challenge: confCodeChallenge,
      code_challenge_method: 'S256',
    });
    const { json: authJson } = await client.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [{ projectId: PROJECT_ID, role: 'editor' }],
      }),
    });
    const authData = (await authJson()) as Record<string, unknown>;
    const redirectUri = authData.redirectUri as string;
    const code = new URL(redirectUri).searchParams.get('code') as string;

    // Exchange with Basic auth
    const basicAuth = btoa(`${confClientId}:${confClientSecret}`);
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: 'http://localhost:7777/callback',
        client_id: 'ignored-because-basic-auth-overrides',
      }),
    });
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.access_token).toBeDefined();
  });

  it('POST /oauth/token rejects malformed Basic auth header', async () => {
    const { response, json } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic !!!invalid-base64!!!',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: 'dummy',
        code_verifier: codeVerifier,
        redirect_uri: 'http://localhost:9999/callback',
        client_id: registeredClientId,
      }),
    });
    expect(response.status).toBe(401);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('invalid_client');
  });
});

// ============================================
// REVOCATION ENDPOINT
// ============================================
describe('OAuth Revocation Endpoint', () => {
  it('POST /oauth/revoke returns 200 for valid token', async () => {
    // Register client, get code, get tokens, then revoke
    const { json: regJson } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Route Test App',
        redirect_uris: ['http://localhost:9999/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    const regData = (await regJson()) as Record<string, unknown>;
    const clientId = regData.client_id as string;

    const codeVerifier = 'revocation-test-code-verifier-long-enough-for-pkce';
    const codeChallenge = await computeCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { json: authJson } = await client.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [{ projectId: PROJECT_ID, role: 'viewer' }],
      }),
    });
    const authData = (await authJson()) as Record<string, unknown>;
    const code = new URL(authData.redirectUri as string).searchParams.get('code') as string;

    const { json: tokenJson } = await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: 'http://localhost:9999/callback',
        client_id: clientId,
      }),
    });
    const tokens = (await tokenJson()) as Record<string, unknown>;

    // Revoke the refresh token
    const body = new URLSearchParams({
      token: tokens.refresh_token as string,
    });
    const { response } = await unauthClient.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    expect(response.status).toBe(200);
  });

  it('POST /oauth/revoke returns 200 for invalid/unknown token (RFC 7009)', async () => {
    const body = new URLSearchParams({ token: 'nonexistent-token' });
    const { response } = await unauthClient.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    // RFC 7009: always return 200
    expect(response.status).toBe(200);
  });
});

// ============================================
// CONNECTED APPS / SESSION MANAGEMENT
// ============================================
describe('OAuth Session Management', () => {
  let sessionClientId: string;
  let sessionId: string;

  beforeAll(async () => {
    // Register a client and complete an OAuth flow to create a session
    const { json: regJson } = await unauthClient.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Route Test App',
        redirect_uris: ['http://localhost:9999/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    const regData = (await regJson()) as Record<string, unknown>;
    sessionClientId = regData.client_id as string;

    const codeVerifier = 'session-mgmt-code-verifier-long-enough-for-pkce';
    const codeChallenge = await computeCodeChallenge(codeVerifier);

    // Consent
    const params = new URLSearchParams({
      client_id: sessionClientId,
      redirect_uri: 'http://localhost:9999/callback',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const { json: authJson } = await client.request(`/oauth/authorize?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grants: [
          { projectId: PROJECT_ID, role: 'editor' },
          { projectId: PROJECT_2_ID, role: 'viewer' },
        ],
      }),
    });
    const authData = (await authJson()) as Record<string, unknown>;
    const code = new URL(authData.redirectUri as string).searchParams.get('code') as string;

    // Exchange for tokens (this creates the session)
    await unauthClient.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: 'http://localhost:9999/callback',
        client_id: sessionClientId,
      }),
    });
  });

  it('GET /oauth/sessions returns 401 for unauthenticated user', async () => {
    const { response } = await unauthClient.request('/oauth/sessions');
    expect(response.status).toBe(401);
  });

  it('GET /oauth/sessions returns list of connected apps', async () => {
    const { response, json } = await client.request('/oauth/sessions');
    expect(response.status).toBe(200);
    const data = (await json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);

    // Find our session
    const session = data.find((s) => (s.client as Record<string, unknown>).id === sessionClientId);
    expect(session).toBeDefined();
    sessionId = (session as { id: string }).id;
  });

  it('GET /oauth/sessions/:sessionId returns session details', async () => {
    const { response, json } = await client.request(`/oauth/sessions/${sessionId}`);
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.session).toBeDefined();
    expect(data.grants).toBeDefined();
    expect(Array.isArray(data.grants)).toBe(true);
  });

  it('GET /oauth/sessions/:sessionId returns 404 for non-existent session', async () => {
    const { response } = await client.request('/oauth/sessions/non-existent-id');
    expect(response.status).toBe(404);
  });

  it('PATCH /oauth/sessions/:sessionId/grants/:projectId updates grant role', async () => {
    const { response, json } = await client.request(
      `/oauth/sessions/${sessionId}/grants/${PROJECT_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      }
    );
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.message).toContain('updated');
  });

  it('PATCH /oauth/sessions/:sessionId/grants/:projectId returns 404 for non-existent session', async () => {
    const { response } = await client.request(
      `/oauth/sessions/non-existent-id/grants/${PROJECT_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      }
    );
    expect(response.status).toBe(404);
  });

  it('POST /oauth/sessions/:sessionId/grants adds a new project grant', async () => {
    // First revoke project 2 so we can re-add it
    await client.request(`/oauth/sessions/${sessionId}/grants/${PROJECT_2_ID}`, {
      method: 'DELETE',
    });

    const { response, json } = await client.request(`/oauth/sessions/${sessionId}/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_2_ID, role: 'viewer' }),
    });
    expect(response.status).toBe(201);
    const data = (await json()) as Record<string, unknown>;
    expect(data.message).toContain('added');
  });

  it('POST /oauth/sessions/:sessionId/grants rejects duplicate grant', async () => {
    const { response, json } = await client.request(`/oauth/sessions/${sessionId}/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_2_ID, role: 'editor' }),
    });
    expect(response.status).toBe(400);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('invalid_request');
    expect(data.error_description as string).toContain('already');
  });

  it('POST /oauth/sessions/:sessionId/grants rejects non-owned project', async () => {
    const { response, json } = await client.request(`/oauth/sessions/${sessionId}/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'non-existent-project', role: 'viewer' }),
    });
    expect(response.status).toBe(400);
    const data = (await json()) as Record<string, unknown>;
    expect(data.error).toBe('invalid_request');
  });

  it('POST /oauth/sessions/:sessionId/grants returns 404 for non-existent session', async () => {
    const { response } = await client.request(`/oauth/sessions/non-existent-id/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_ID, role: 'viewer' }),
    });
    expect(response.status).toBe(404);
  });

  it('DELETE /oauth/sessions/:sessionId/grants/:projectId revokes a project grant', async () => {
    const { response, json } = await client.request(
      `/oauth/sessions/${sessionId}/grants/${PROJECT_2_ID}`,
      { method: 'DELETE' }
    );
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.message).toContain('revoked');
  });

  it('DELETE /oauth/sessions/:sessionId/grants/:projectId returns 404 for non-existent session', async () => {
    const { response } = await client.request(
      `/oauth/sessions/non-existent-id/grants/${PROJECT_ID}`,
      { method: 'DELETE' }
    );
    expect(response.status).toBe(404);
  });

  it('DELETE /oauth/sessions/:sessionId revokes the session', async () => {
    const { response, json } = await client.request(`/oauth/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    const data = (await json()) as Record<string, unknown>;
    expect(data.message).toContain('revoked');
  });

  it('DELETE /oauth/sessions/:sessionId returns 404 for non-existent session', async () => {
    const { response } = await client.request('/oauth/sessions/non-existent-id', {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });
});
