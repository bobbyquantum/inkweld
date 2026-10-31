/**
 * `create_media_upload` and the URLs it hands out, through the real HTTP stack:
 * an agent asks for a URL over MCP, sends the file with a plain HTTP request,
 * and places the result on a canvas.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { config } from '../src/config/env';
import { signMediaUploadToken, verifyMediaUploadToken } from '../src/mcp/media-upload-token';
import { mcpSigningSecret } from '../src/mcp/mcp.auth';
import { isCrossOriginPath } from '../src/middleware/open-origin';
import { pathForLogging } from '../src/middleware/request-logger';
import { configService } from '../src/services/config.service';
import { getStorageService } from '../src/services/storage.service';
import { mcpOAuthService } from '../src/services/mcp-oauth.service';
import { startTestServer, stopTestServer, enablePasswordLoginForTests } from './server-test-helper';
import * as bcrypt from 'bcryptjs';

const USER_ID = crypto.randomUUID();
const USERNAME = 'mcpuploaduser';
const SLUG = 'mcp-upload-test';
const VERSION = '2026-07-28';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);

let baseUrl: string;
let db: ReturnType<typeof getDatabase>;
let projectId: string;
let clientId: string;
let sessionId: string;
let accessToken: string;

interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

interface ToolJson {
  result?: ToolResult;
  error?: { message: string };
}

async function rpcTool(name: string, args: Record<string, unknown>): Promise<ToolJson> {
  const res = await fetch(`${baseUrl}/api/v1/ai/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'MCP-Protocol-Version': VERSION,
      'Mcp-Method': 'tools/call',
      'Mcp-Name': name,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: 1,
      params: {
        name,
        arguments: { project: `${USERNAME}/${SLUG}`, ...args },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': VERSION,
          'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  return (await res.json()) as ToolJson;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const json = await rpcTool(name, args);
  return json.result as ToolResult;
}

/**
 * Become a new MCP session. A new session supersedes the same client's older
 * one, so each test starts with its own.
 */
async function useSession(role = 'editor'): Promise<void> {
  const { sessionId: id, tokens } = await mcpOAuthService.createSession(db, {
    userId: USER_ID,
    clientId,
    grants: [{ projectId, role }],
    issuer: baseUrl,
  });
  sessionId = id;
  accessToken = tokens.accessToken;
}

async function createUpload(format = 'png') {
  const result = await callTool('create_media_upload', { format });
  expect(result.isError).toBeUndefined();
  return result.structuredContent as {
    uploadUrl: string;
    method: string;
    mediaUrl: string;
    expiresAt: string;
    maxBytes: number;
  };
}

function put(url: string, body: BodyInit = PNG): Promise<Response> {
  return fetch(url, { method: 'PUT', body });
}

function claims(filename = 'img-direct.png') {
  return {
    userId: USER_ID,
    username: USERNAME,
    sessionId,
    projectId,
    owner: USERNAME,
    slug: SLUG,
    filename,
  };
}

const UPLOADS = () => `${baseUrl}/api/v1/ai/mcp/uploads`;

beforeAll(async () => {
  const server = await startTestServer();
  baseUrl = server.baseUrl;
  db = getDatabase();
  await enablePasswordLoginForTests();
  await db.delete(projects).where(eq(projects.slug, SLUG));
  await db.delete(users).where(eq(users.username, USERNAME));
  await db.insert(users).values({
    id: USER_ID,
    username: USERNAME,
    email: `${USERNAME}@example.com`,
    password: await bcrypt.hash('adminpass123', 10),
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: 'adminpass123' }),
  });
  const { token } = (await login.json()) as { token: string };
  const created = await fetch(`${baseUrl}/api/v1/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'MCP Upload Test', slug: SLUG }),
  });
  projectId = ((await created.json()) as { id: string }).id;

  const client = await mcpOAuthService.registerClient(db, {
    clientName: 'MCP upload test',
    redirectUris: ['http://localhost:3000/callback'],
  });
  clientId = client.clientId;

  await configService.set(db, 'AI_KILL_SWITCH', 'false');
  await configService.set(db, 'MCP_ENABLED', 'true');
});

afterAll(async () => {
  await db.delete(projects).where(eq(projects.slug, SLUG));
  await db.delete(users).where(eq(users.username, USERNAME));
  await configService.delete(db, 'SYNC_QUOTA_ENABLED');
  await stopTestServer();
});

beforeEach(() => useSession());

afterEach(async () => {
  await configService.set(db, 'AI_KILL_SWITCH', 'false');
  await configService.set(db, 'MCP_ENABLED', 'true');
});

describe('create_media_upload', () => {
  it('hands out a URL, and what to use once the file is there', async () => {
    const upload = await createUpload('jpeg');
    expect(upload.method).toBe('PUT');
    expect(upload.uploadUrl).toStartWith(`${UPLOADS()}/`);
    expect(upload.mediaUrl).toMatch(/^media:\/\/img-[\w-]+\.jpg$/);
    expect(new Date(upload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(upload.maxBytes).toBeGreaterThan(0);
  });

  it('points at the address the agent reached, whatever BASE_URL says', async () => {
    const configured = process.env.BASE_URL;
    process.env.BASE_URL = 'https://stale.example.com';
    try {
      const upload = await createUpload();
      expect(upload.uploadUrl).toStartWith(`${UPLOADS()}/`);
    } finally {
      if (configured === undefined) delete process.env.BASE_URL;
      else process.env.BASE_URL = configured;
    }
  });

  it('refuses a format the upload route would not accept', async () => {
    const result = await callTool('create_media_upload', { format: 'svg' });
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain('format must be one of');
  });

  it('refuses a project outside the grants', async () => {
    const result = await callTool('create_media_upload', {
      project: 'someone/else',
      format: 'png',
    });
    expect(result.isError).toBe(true);
  });

  it('is not offered to a read-only session', async () => {
    await useSession('viewer');
    const json = await rpcTool('create_media_upload', { format: 'png' });
    expect(JSON.stringify(json)).toContain('ermission');
    expect(json.result?.structuredContent).toBeUndefined();
  });
});

describe('uploading', () => {
  it('takes a file from a plain request, then the agent can use it', async () => {
    const upload = await createUpload();

    const res = await put(upload.uploadUrl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mediaUrl: upload.mediaUrl,
      size: PNG.byteLength,
      mimeType: 'image/png',
    });

    const read = await callTool('get_media_content', { mediaUrl: upload.mediaUrl });
    expect(read.isError).toBeUndefined();
    expect(read.content?.[1]?.type).toBe('image');

    const created = await callTool('create_element', { name: 'Cover', type: 'CANVAS' });
    const canvasId = (created.structuredContent as { element: { id: string } }).element.id;

    const edited = await callTool('edit_canvas', {
      elementId: canvasId,
      add: [{ id: 'art', type: 'image', src: upload.mediaUrl, width: 800, height: 600 }],
    });
    expect(edited.isError).toBeUndefined();

    const canvas = await callTool('get_canvas', { elementId: canvasId });
    expect(canvas.structuredContent?.objects).toEqual([
      expect.objectContaining({ id: 'art', src: upload.mediaUrl }),
    ]);
  });

  it('works once', async () => {
    const upload = await createUpload();
    expect((await put(upload.uploadUrl)).status).toBe(200);
    const again = await put(upload.uploadUrl);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toContain('already been used');
  });

  it('refuses a file of a different format than it was created for', async () => {
    const upload = await createUpload();
    const res = await put(upload.uploadUrl, JPEG);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('image/jpeg');
  });

  it('refuses something that is not an image, such as SVG', async () => {
    const upload = await createUpload();
    const res = await put(upload.uploadUrl, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('not a PNG');
  });

  it('refuses an empty request', async () => {
    const upload = await createUpload();
    expect((await put(upload.uploadUrl, new Uint8Array())).status).toBe(400);
  });

  it('stores nothing for a refused upload', async () => {
    const upload = await createUpload();
    await put(upload.uploadUrl, JPEG);
    const storage = getStorageService();
    const filename = upload.mediaUrl.substring('media://'.length);
    expect(await storage.projectFileExists(USERNAME, SLUG, filename)).toBe(false);
  });
});

describe('who may upload', () => {
  it('refuses a tampered token', async () => {
    const upload = await createUpload();
    const res = await put(`${upload.uploadUrl}x`);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('create_media_upload');
  });

  it('refuses an expired token', async () => {
    const longAgo = Date.now() - 24 * 60 * 60 * 1000;
    const { token } = await signMediaUploadToken(claims(), {}, longAgo);
    expect((await put(`${UPLOADS()}/${token}`)).status).toBe(401);
  });

  it('does not take a token signed for something else', async () => {
    const secret = mcpSigningSecret({ DATABASE_KEY: config.databaseKey });
    const exp = Math.floor(Date.now() / 1000) + 600;
    const session = await sign({ ...claims(), exp }, secret, 'HS256');
    expect((await put(`${UPLOADS()}/${session}`)).status).toBe(401);
    expect((await put(`${UPLOADS()}/${accessToken}`)).status).toBe(401);
  });

  it('notices the wrong audience even with the right key', async () => {
    const key = `${mcpSigningSecret({ DATABASE_KEY: config.databaseKey })}:inkweld:mcp-media-upload`;
    const exp = Math.floor(Date.now() / 1000) + 600;
    const token = await sign({ ...claims(), aud: 'something-else', exp }, key, 'HS256');
    expect(await verifyMediaUploadToken(token, {})).toBeNull();
  });

  it('stops working when the session is revoked', async () => {
    const upload = await createUpload();
    await mcpOAuthService.revokeSession(db, sessionId, 'test');
    expect((await put(upload.uploadUrl)).status).toBe(401);
  });

  it('stops working when MCP is turned off, by either switch', async () => {
    const upload = await createUpload();
    await configService.set(db, 'MCP_ENABLED', 'false');
    const disabled = await put(upload.uploadUrl);
    expect(disabled.status).toBe(403);
    expect(await disabled.text()).toContain('disabled by the administrator');

    await configService.set(db, 'MCP_ENABLED', 'true');
    await configService.set(db, 'AI_KILL_SWITCH', 'true');
    const killed = await put(upload.uploadUrl);
    expect(killed.status).toBe(403);
    expect(await killed.text()).toContain('kill switch');
  });

  it('refuses a project that is gone or was renamed', async () => {
    const { token } = await signMediaUploadToken({ ...claims(), slug: 'moved-away' }, {});
    expect((await put(`${UPLOADS()}/${token}`)).status).toBe(404);
  });

  it('refuses a session without write access to the project', async () => {
    const { token } = await signMediaUploadToken(
      { ...claims(), projectId: crypto.randomUUID() },
      {}
    );
    expect((await put(`${UPLOADS()}/${token}`)).status).toBe(404);

    await useSession('viewer');
    const fromViewer = await signMediaUploadToken(claims('img-viewer.png'), {});
    expect((await put(`${UPLOADS()}/${fromViewer.token}`)).status).toBe(403);
  });

  it('refuses a user who lost access to the project', async () => {
    const { token } = await signMediaUploadToken(
      { ...claims('img-stranger.png'), userId: crypto.randomUUID() },
      {}
    );
    expect((await put(`${UPLOADS()}/${token}`)).status).toBe(403);
  });
});

describe('sync capacity', () => {
  it('refuses an upload over the allowance, with the code clients look for', async () => {
    await configService.set(db, 'SYNC_QUOTA_ENABLED', 'true');
    await db.update(users).set({ syncQuotaBytes: 1 }).where(eq(users.id, USER_ID));
    try {
      const upload = await createUpload();
      const res = await put(upload.uploadUrl);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('QUOTA_EXCEEDED');
    } finally {
      await db.update(users).set({ syncQuotaBytes: null }).where(eq(users.id, USER_ID));
      await configService.delete(db, 'SYNC_QUOTA_ENABLED');
    }
  });
});

describe('the route', () => {
  it('keeps the token out of the logs, while it can still be used', () => {
    expect(pathForLogging('/api/v1/ai/mcp/uploads/eyJhbGciOi.abc.def')).toBe(
      '/api/v1/ai/mcp/uploads/<token>'
    );
    expect(pathForLogging('/api/v1/ai/mcp')).toBe('/api/v1/ai/mcp');
  });

  it('is open to any origin, since the caller is not a browser page', () => {
    expect(isCrossOriginPath('/api/v1/ai/mcp/uploads/abc')).toBe(true);
  });

  it('answers a CORS preflight for PUT', async () => {
    const res = await fetch(`${UPLOADS()}/abc`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'PUT' },
    });
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
  });

  it('does not put the JSON-RPC endpoint behind it', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/mcp`);
    expect(res.status).toBe(405);
  });
});
