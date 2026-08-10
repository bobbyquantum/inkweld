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
import { startTestServer, stopTestServer, enablePasswordLoginForTests } from './server-test-helper';

let testServer: { port: number; baseUrl: string };
let db: ReturnType<typeof getDatabase>;
let apiKey: string;

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
    Authorization: `Bearer ${apiKey}`,
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

  // Create a project and an MCP key so header-validation tests can authenticate.
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

  const keyRes = await fetch(`${testServer.baseUrl}/api/v1/mcp-keys/${USERNAME}/${SLUG}/keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test', permissions: ['read:project', 'read:elements'] }),
  });
  if (!keyRes.ok) {
    throw new Error(`key creation failed: ${keyRes.status} ${await keyRes.text()}`);
  }
  const { fullKey } = (await keyRes.json()) as { fullKey: string };
  apiKey = fullKey;
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
      Authorization: `Bearer ${apiKey}`,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020); // HeaderMismatch
  });

  it('returns 400 HeaderMismatch when Mcp-Method header is missing', async () => {
    const res = await postMcp(rpcBody('tools/list'), {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': VERSION,
      Authorization: `Bearer ${apiKey}`,
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
      Authorization: `Bearer ${apiKey}`,
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
});
