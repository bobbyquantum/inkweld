/**
 * Unit tests for the stateless MCP handler (protocol 2026-07-28).
 *
 * These drive `handleMcpRequest` with a minimal fake Hono context to verify
 * the stateless dispatch behaviour: `server/discover`, per-request `_meta`
 * protocol version validation, `resultType: "complete"` envelopes, removal of
 * the `initialize` handshake, and unknown-method 404s.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import {
  createSuccessResponse,
  JSON_RPC_ERRORS,
  MCP_PROTOCOL_VERSION,
  META_KEYS,
} from '../src/mcp/mcp.types';
import { registerTool } from '../src/mcp/mcp.handler';

interface FakeContext {
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
  };
  get: (key: string) => unknown;
  json: (body: unknown, status?: number, headers?: Record<string, string>) => Response;
}

function makeContext(body: unknown, headers: Record<string, string> = {}): FakeContext {
  const mcpContext = { type: 'legacy', permissions: [], key: {}, projectId: 'p' } as never;
  const db = {} as never;
  const ctx: FakeContext = {
    req: {
      header: (name) => headers[name],
      json: async () => body,
    },
    get: (key) => (key === 'mcpContext' ? mcpContext : db),
    json: (payload, status = 200, hdr = {}) => {
      const init: ResponseInit = { status };
      if (Object.keys(hdr).length > 0) init.headers = hdr;
      return new Response(JSON.stringify(payload), init);
    },
  };
  return ctx;
}

function metaBody(method: string, params: Record<string, unknown> = {}, id = 1) {
  return {
    jsonrpc: '2.0',
    method,
    params: {
      ...params,
      _meta: {
        [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION,
        [META_KEYS.clientInfo]: { name: 'test', version: '1.0.0' },
        [META_KEYS.clientCapabilities]: {},
      },
    },
    id,
  };
}

interface RpcEnvelope {
  id: string | number;
  error?: { code: number; message: string; data?: Record<string, unknown> };
  result?: Record<string, unknown>;
}

/** Parse an MCP JSON-RPC response into a typed envelope. */
async function parseRpc(res: Response): Promise<RpcEnvelope> {
  return (await res.json()) as RpcEnvelope;
}

describe('MCP stateless handler (2026-07-28)', () => {
  beforeEach(() => {
    // Register a throwaway tool so tools/list has something to return.
    registerTool({
      tool: {
        name: `stateless-test-${Date.now()}-${Math.random()}`,
        description: 'test',
        inputSchema: { type: 'object' },
      },
      requiredPermissions: [],
      execute: async () => ({ ok: true }),
    });
  });

  it('serves server/discover with supported versions, capabilities and identity', async () => {
    const c = makeContext(metaBody('server/discover'));
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(200);
    const json = await parseRpc(res);
    expect(json.id).toBe(1);
    expect(json.error).toBeUndefined();
    const result = json.result as {
      resultType: string;
      supportedVersions: string[];
      capabilities: unknown;
      _meta: { [key: string]: { name: string } };
    };
    expect(result.resultType).toBe('complete');
    expect(result.supportedVersions).toContain(MCP_PROTOCOL_VERSION);
    expect(result.capabilities).toBeDefined();
    expect(result._meta[META_KEYS.serverInfo].name).toBe('inkweld-mcp');
  });

  it('returns resultType complete and serverInfo on list endpoints', async () => {
    const c = makeContext(metaBody('tools/list'));
    const res = await handleMcpRequest(c as never);
    const json = await parseRpc(res);
    const result = json.result as { resultType: string; tools: unknown; _meta: unknown };
    expect(result.resultType).toBe('complete');
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result._meta).toBeDefined();
  });

  it('serves legacy requests without _meta (dual-era), e.g. tools/list', async () => {
    const body = { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 };
    const c = makeContext(body);
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(200);
    const json = await parseRpc(res);
    expect(json.error).toBeUndefined();
    expect(Array.isArray((json.result as { tools: unknown[] }).tools)).toBe(true);
  });

  it('answers legacy initialize with an Mcp-Session-Id header', async () => {
    const body = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {} },
      id: 1,
    };
    const c = makeContext(body);
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Mcp-Session-Id')).toBeTruthy();
    const json = (await res.json()) as {
      result: { protocolVersion: string; capabilities: unknown };
    };
    expect(json.result.protocolVersion).toBe('2025-11-25');
    expect(json.result.capabilities).toBeDefined();
  });

  it('rejects requests missing clientCapabilities in _meta with 400', async () => {
    const body = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: { _meta: { [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION } },
      id: 1,
    };
    const c = makeContext(body);
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(400);
    const json = await parseRpc(res);
    expect(json.error?.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
  });

  it('rejects an unsupported protocol version with -32022', async () => {
    const body = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {
        _meta: {
          [META_KEYS.protocolVersion]: '2025-11-25',
          [META_KEYS.clientCapabilities]: {},
        },
      },
      id: 1,
    };
    const c = makeContext(body);
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(400);
    const json = await parseRpc(res);
    expect(json.error?.code).toBe(JSON_RPC_ERRORS.UNSUPPORTED_PROTOCOL_VERSION);
    const supported = json.error?.data?.supported as string[];
    expect(supported).toContain(MCP_PROTOCOL_VERSION);
  });

  it('rejects a header/body protocol version mismatch with HeaderMismatch -32020', async () => {
    const c = makeContext(metaBody('tools/list'), {
      'MCP-Protocol-Version': '2025-11-25',
    });
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(400);
    const json = await parseRpc(res);
    expect(json.error?.code).toBe(JSON_RPC_ERRORS.HEADER_MISMATCH);
  });

  it('no longer supports the initialize handshake', async () => {
    // A stateless-era client sends initialize with per-request _meta, which is
    // now an unknown method -> 404 with -32601.
    const c = makeContext(
      metaBody('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {},
      })
    );
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(404);
    const json = await parseRpc(res);
    expect(json.error?.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('no longer supports ping', async () => {
    const c = makeContext(metaBody('ping'));
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(404);
    const json = await parseRpc(res);
    expect(json.error?.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('returns 202 Accepted for notifications (no id)', async () => {
    const body = {
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 999 },
    };
    const c = makeContext(body);
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('returns 404 with -32601 for unknown methods', async () => {
    const c = makeContext(metaBody('bogus/method'));
    const res = await handleMcpRequest(c as never);
    expect(res.status).toBe(404);
    const json = await parseRpc(res);
    expect(json.error?.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('does not mint an Mcp-Session-Id header on responses', async () => {
    const c = makeContext(metaBody('tools/list'));
    const res = await handleMcpRequest(c as never);
    expect(res.headers.get('Mcp-Session-Id')).toBeNull();
  });

  it('createSuccessResponse preserves resultType when passed a wrapped result', () => {
    const result = { resultType: 'complete', supportedVersions: [MCP_PROTOCOL_VERSION] };
    const resp = createSuccessResponse(1, result) as {
      result: { resultType: string };
    };
    expect(resp.result.resultType).toBe('complete');
  });
});
