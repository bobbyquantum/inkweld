/**
 * Integration tests for the MCP stateless Streamable HTTP endpoint
 * (protocol 2026-07-28): header validation, GET/DELETE 405, and the auth gate,
 * exercised through the real HTTP routes.
 *
 * Note: auth runs before header validation, so unauthenticated requests are
 * rejected with 401 first; header-validation failures surface as 400
 * HeaderMismatch for authenticated requests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { configService } from '../src/services/config.service';
import { mcpOAuthService } from '../src/services/mcp-oauth.service';
import { userService } from '../src/services/user.service';
import { startTestServer, stopTestServer, enablePasswordLoginForTests } from './server-test-helper';

let testServer: { port: number; baseUrl: string };
let db: ReturnType<typeof getDatabase>;
let accessToken: string;

const USER_ID = crypto.randomUUID();
const USERNAME = 'mcpintuser';
const SLUG = 'mcp-int-test';

const VERSION = '2026-07-28';

function rpcBody(method: string, extra: Record<string, unknown> = {}, id = 1) {
  return {
    jsonrpc: '2.0',
    method,
    params: {
      ...extra,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': VERSION,
        'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
    id,
  };
}

/** Build the standard required request headers for a method. */
function standardHeaders(method: string, name?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': VERSION,
    'Mcp-Method': method,
    ...(name ? { 'Mcp-Name': name } : {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

beforeAll(async () => {
  testServer = await startTestServer();
  db = getDatabase();
  // Password login is disabled by default (passwordless-first); opt in so the
  // test can log in and mint an MCP key.
  await enablePasswordLoginForTests();
  await db.delete(projects).where(eq(projects.slug, SLUG));
  await db.delete(users).where(eq(users.username, USERNAME));
  const hashedPassword = await bcrypt.hash('adminpass123', 10);
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: hashedPassword,
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  // Create a project and an OAuth session so header-validation tests can authenticate.
  const login = await fetch(`${testServer.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: 'adminpass123' }),
  });
  const { token } = (await login.json()) as { token: string };

  const projectRes = await fetch(`${testServer.baseUrl}/api/v1/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'MCP Int Test', slug: SLUG }),
  });
  if (!projectRes.ok) {
    throw new Error(`project creation failed: ${projectRes.status} ${await projectRes.text()}`);
  }

  const project = (await projectRes.json()) as { id: string };

  const client = await mcpOAuthService.registerClient(db, {
    clientName: 'MCP route test',
    redirectUris: ['http://localhost:3000/callback'],
  });
  const { tokens } = await mcpOAuthService.createSession(db, {
    userId: USER_ID,
    clientId: client.clientId,
    grants: [{ projectId: project.id, role: 'viewer' }],
    issuer: testServer.baseUrl,
  });
  accessToken = tokens.accessToken;

  // Ensure MCP is available for these tests (the AI kill switch defaults to ON
  // and would otherwise 403 every request).
  await configService.set(db, 'AI_KILL_SWITCH', 'false');
  await configService.set(db, 'MCP_ENABLED', 'true');
});

afterAll(async () => {
  await db.delete(projects).where(eq(projects.slug, SLUG));
  await db.delete(users).where(eq(users.username, USERNAME));
  await stopTestServer();
});

async function postMcp(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${testServer.baseUrl}/api/v1/ai/mcp`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });
}

describe('MCP stateless endpoint (2026-07-28)', () => {
  it('returns 405 for GET (SSE stream endpoint removed)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/v1/ai/mcp`);
    expect(res.status).toBe(405);
  });

  it('returns 405 for DELETE (sessions removed)', async () => {
    const res = await fetch(`${testServer.baseUrl}/api/v1/ai/mcp`, { method: 'DELETE' });
    expect(res.status).toBe(405);
  });

  it('returns 401 HeaderMismatch-adjacent auth gate for unauthenticated requests', async () => {
    // Auth runs first: an unauthenticated request gets 401 + WWW-Authenticate,
    // even with well-formed headers.
    const res = await postMcp(rpcBody('server/discover'), {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': VERSION,
      'Mcp-Method': 'server/discover',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata');
  });

  it('returns 400 HeaderMismatch when MCP-Protocol-Version header is missing', async () => {
    const res = await postMcp(rpcBody('server/discover'), {
      'Content-Type': 'application/json',
      'Mcp-Method': 'server/discover',
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020); // HeaderMismatch
  });

  it('returns 400 HeaderMismatch when Mcp-Method header is missing', async () => {
    const res = await postMcp(rpcBody('tools/list'), {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': VERSION,
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020);
  });

  it('returns 400 HeaderMismatch when Mcp-Method does not match the body', async () => {
    const res = await postMcp(rpcBody('tools/list'), standardHeaders('tools/call'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020);
  });

  it('returns 400 HeaderMismatch when MCP-Protocol-Version mismatches body _meta', async () => {
    const res = await postMcp(rpcBody('tools/list'), {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-11-25',
      'Mcp-Method': 'tools/list',
      Authorization: `Bearer ${accessToken}`,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020);
  });

  it('serves server/discover for an authenticated, well-formed request', async () => {
    const res = await postMcp(rpcBody('server/discover'), standardHeaders('server/discover'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { supportedVersions?: string[] };
      error?: { code: number };
    };
    expect(json.error).toBeUndefined();
    expect(json.result?.supportedVersions).toContain(VERSION);
  });

  it('returns 403 when MCP is disabled via MCP_ENABLED', async () => {
    await configService.set(db, 'MCP_ENABLED', 'false');
    try {
      const res = await postMcp(rpcBody('server/discover'), standardHeaders('server/discover'));
      expect(res.status).toBe(403);
    } finally {
      await configService.set(db, 'MCP_ENABLED', 'true');
    }
  });

  it('returns 403 when the AI kill switch is on (even if MCP_ENABLED is true)', async () => {
    await configService.set(db, 'AI_KILL_SWITCH', 'true');
    try {
      const res = await postMcp(rpcBody('server/discover'), standardHeaders('server/discover'));
      expect(res.status).toBe(403);
    } finally {
      await configService.set(db, 'AI_KILL_SWITCH', 'false');
    }
  });
});

describe('MCP access follows the account', () => {
  const AGENT_USERNAME = 'mcpagentowner';
  let agentUserId: string;

  /** An account with an agent linked, and that agent's tokens. */
  async function linkAgent() {
    await db.delete(users).where(eq(users.username, AGENT_USERNAME));
    agentUserId = crypto.randomUUID();
    await db.insert(users).values({
      id: agentUserId,
      username: AGENT_USERNAME,
      email: `${AGENT_USERNAME}@example.com`,
      approved: true,
      enabled: true,
      isAdmin: false,
    });
    const client = await mcpOAuthService.registerClient(db, {
      clientName: 'Account test agent',
      redirectUris: ['http://localhost:3000/callback'],
    });
    const { tokens } = await mcpOAuthService.createSession(db, {
      userId: agentUserId,
      clientId: client.clientId,
      grants: [],
      issuer: testServer.baseUrl,
    });
    return { tokens, clientId: client.clientId };
  }

  function discover(token: string) {
    return postMcp(rpcBody('server/discover'), {
      ...standardHeaders('server/discover'),
      Authorization: `Bearer ${token}`,
    });
  }

  function refresh(refreshToken: string, clientId: string) {
    return fetch(`${testServer.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    });
  }

  async function expectTurnedAway(
    tokens: { accessToken: string; refreshToken: string },
    clientId: string
  ) {
    const res = await discover(tokens.accessToken);
    expect(res.status).toBe(401);
    // A client answers this by trying to authorize again, which is where the
    // person finds out why: the sign-in page refuses a disabled account.
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata');

    const refreshed = await refresh(tokens.refreshToken, clientId);
    expect(refreshed.status).toBe(400);
    expect(((await refreshed.json()) as { error: string }).error).toBe('invalid_grant');
  }

  afterAll(async () => {
    await db.delete(users).where(eq(users.username, AGENT_USERNAME));
  });

  it('lets a linked agent in while the account is in good standing', async () => {
    const { tokens } = await linkAgent();
    expect((await discover(tokens.accessToken)).status).toBe(200);
  });

  it('turns the agent away once an admin disables the account', async () => {
    const { tokens, clientId } = await linkAgent();
    await userService.setUserEnabled(db, agentUserId, false);
    await expectTurnedAway(tokens, clientId);
  });

  it('keeps it away after the account is enabled again', async () => {
    const { tokens, clientId } = await linkAgent();
    await userService.setUserEnabled(db, agentUserId, false);
    await userService.setUserEnabled(db, agentUserId, true);
    await expectTurnedAway(tokens, clientId);
  });

  it('turns away the agent of an account that was disabled before sessions were revoked', async () => {
    const { tokens, clientId } = await linkAgent();
    await db.update(users).set({ enabled: false }).where(eq(users.id, agentUserId));
    await expectTurnedAway(tokens, clientId);
  });

  it('turns away an agent linked before the password was reset', async () => {
    const { tokens, clientId } = await linkAgent();
    await db
      .update(users)
      .set({ sessionsValidFrom: Math.floor(Date.now() / 1000) + 60 })
      .where(eq(users.id, agentUserId));
    await expectTurnedAway(tokens, clientId);
  });
});
