/**
 * Integration tests for the MCP stateless Streamable HTTP endpoint
 * (protocol 2026-07-28): header validation, GET/DELETE 405, and the auth gate,
 * exercised through the real HTTP routes.
 *
 * Note: header validation middleware runs BEFORE auth, so header-validation
 * failures surface as 400 HeaderMismatch even without a token.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer } from './server-test-helper';

let testServer: { port: number; baseUrl: string };
let db: ReturnType<typeof getDatabase>;

const USER_ID = crypto.randomUUID();

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
  };
}

beforeAll(async () => {
  testServer = await startTestServer();
  db = getDatabase();
  await db.delete(users).where(eq(users.username, 'mcpintuser'));
  await db.delete(projects).where(eq(projects.slug, 'mcp-int-test'));
  const hashedPassword = await bcrypt.hash('adminpass123', 10);
  await db.insert(users).values({
    id: USER_ID,
    username: 'mcpintuser',
    email: 'mcpintuser@example.com',
    password: hashedPassword,
    approved: true,
    enabled: true,
    isAdmin: false,
  });
});

afterAll(async () => {
  await db.delete(projects).where(eq(projects.slug, 'mcp-int-test'));
  await db.delete(users).where(eq(users.username, 'mcpintuser'));
  await stopTestServer(testServer);
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

  it('returns 400 HeaderMismatch when MCP-Protocol-Version header is missing', async () => {
    const res = await postMcp(rpcBody('server/discover'), {
      'Content-Type': 'application/json',
      'Mcp-Method': 'server/discover',
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020); // HeaderMismatch
  });

  it('returns 400 HeaderMismatch when Mcp-Method header is missing', async () => {
    const res = await postMcp(rpcBody('tools/list'), {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': VERSION,
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
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: number } };
    expect(json.error.code).toBe(-32020);
  });

  it('returns 401 with WWW-Authenticate for unauthenticated requests with valid headers', async () => {
    const res = await postMcp(rpcBody('server/discover'), standardHeaders('server/discover'));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata');
  });
});
