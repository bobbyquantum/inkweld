/**
 * MCP Streamable HTTP Transport Routes
 *
 * Implements the MCP Streamable HTTP transport (protocol version 2026-07-28,
 * stateless):
 * - POST: Handle JSON-RPC requests, respond with application/json
 * - GET / DELETE: Return 405 Method Not Allowed (no SSE endpoint, no sessions)
 * - Every request carries its protocol version in `_meta`
 * - Required standard headers (MCP-Protocol-Version, Mcp-Method, Mcp-Name)
 *   are validated against the body; mismatches return HeaderMismatch (-32020)
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { AppContext } from '../types/context';
import { mcpAuth, handleMcpRequest } from '../mcp';
import { createErrorResponse, JSON_RPC_ERRORS, META_KEYS, getRequestMeta } from '../mcp';

const mcpRoutes = new OpenAPIHono<AppContext>();

// Schema for OpenAPI docs
const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('MCPError');

const JsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]).optional(), // Optional for notifications
    method: z.string(),
    params: z.record(z.string(), z.any()).optional(),
  })
  .openapi('JsonRpcRequest');

const JsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    result: z.any().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.any().optional(),
      })
      .optional(),
  })
  .openapi('JsonRpcResponse');

// ============================================
// MCP Streamable HTTP POST Endpoint
// ============================================

const mcpJsonRpcRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpJsonRpc',
  description:
    'MCP Streamable HTTP endpoint (stateless, protocol 2026-07-28). Send JSON-RPC messages via POST. Authenticate with Bearer token or X-API-Key header. Each request carries its protocol version in _meta.',
  request: {
    headers: z.object({
      'MCP-Protocol-Version': z.string().optional().openapi({
        example: '2026-07-28',
        description:
          'MCP protocol version, must match _meta.io.modelcontextprotocol/protocolVersion',
      }),
      'Mcp-Method': z.string().optional().openapi({
        example: 'server/discover',
        description: 'The JSON-RPC method, must match the request body method',
      }),
      'Mcp-Name': z.string().optional().openapi({
        description:
          'The tool/prompt name or resource URI (required for tools/call, resources/read, prompts/get)',
      }),
      Authorization: z
        .string()
        .optional()
        .openapi({ description: 'Bearer token (OAuth JWT or legacy API key)' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: JsonRpcRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: JsonRpcResponseSchema,
        },
      },
      description: 'JSON-RPC response',
    },
    202: {
      description: 'Accepted (for notifications and responses)',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Invalid or missing authorization',
    },
  },
});

// ============================================
// MCP Streamable HTTP GET / DELETE (Not Supported)
// ============================================
// The 2026-07-28 stateless revision removed the GET SSE stream endpoint and
// the protocol-level session (Mcp-Session-Id) / DELETE termination. Servers
// that support only this revision MUST respond 405 to GET and DELETE.

const mcpUnsupportedRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpSse',
  description:
    'The 2026-07-28 stateless MCP revision removed the GET SSE stream endpoint. Returns 405 Method Not Allowed.',
  responses: {
    405: {
      description: 'Method Not Allowed',
    },
  },
});

mcpRoutes.openapi(mcpUnsupportedRoute, (c) => {
  return c.body(null, 405);
});

const mcpDeleteRoute = createRoute({
  method: 'delete',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpDeleteSession',
  description:
    'The 2026-07-28 stateless MCP revision removed protocol-level sessions. Returns 405 Method Not Allowed.',
  responses: {
    405: {
      description: 'Method Not Allowed',
    },
  },
});

mcpRoutes.openapi(mcpDeleteRoute, (c) => {
  return c.body(null, 405);
});

// ============================================
// Header validation middleware
// ============================================

/**
 * Base64 sentinel marker used to encode `Mcp-Name` / `Mcp-Param-*` values that
 * cannot be represented as plain ASCII header values.
 */
const BASE64_SENTINEL_PREFIX = '=?base64?';
const BASE64_SENTINEL_SUFFIX = '?=';

/**
 * Decode a header value that may use the Base64 sentinel encoding.
 * The base64 payload is the UTF-8 bytes of the original value, so decode it
 * as UTF-8 (not a raw binary string) to avoid mojibake for non-ASCII names.
 */
function decodeHeaderValue(value: string): string {
  if (value.startsWith(BASE64_SENTINEL_PREFIX) && value.endsWith(BASE64_SENTINEL_SUFFIX)) {
    const payload = value.slice(BASE64_SENTINEL_PREFIX.length, -BASE64_SENTINEL_SUFFIX.length);
    try {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Validate the standard MCP request headers (`MCP-Protocol-Version`,
 * `Mcp-Method`, `Mcp-Name`) against the request body, per the 2026-07-28
 * Streamable HTTP spec. Rejects mismatches with HTTP 400 + HeaderMismatch.
 */
function validateMcpHeaders(c: Context<AppContext>, body: Record<string, unknown>): boolean {
  const params = (body.params ?? {}) as Record<string, unknown>;
  const meta = getRequestMeta(params);
  const method = typeof body.method === 'string' ? body.method : undefined;

  // Notifications (no id) have no defined header requirements in this
  // revision, so skip strict validation for them.
  const isRequest = body.id !== undefined && body.id !== null;
  if (!isRequest) {
    return true;
  }

  // Legacy requests (no `_meta.protocolVersion`) use the pre-stateless
  // handshake and do not send the modern standard headers; treat a request
  // that omits MCP-Protocol-Version as a legacy-era request and skip strict
  // header validation (spec: backward compatibility with handshake versions).
  const isModernRequest = meta?.[META_KEYS.protocolVersion] !== undefined;
  if (!isModernRequest) {
    return true;
  }

  // MCP-Protocol-Version header is required and must match body _meta.
  const headerVersion = c.req.header('MCP-Protocol-Version');
  const bodyVersion = meta?.[META_KEYS.protocolVersion];
  if (!headerVersion || !bodyVersion || headerVersion !== bodyVersion) {
    return false;
  }

  // Mcp-Method header is required and must match body method.
  const headerMethod = c.req.header('Mcp-Method');
  if (!method || !headerMethod || headerMethod !== method) {
    return false;
  }

  // Mcp-Name header is required for tools/call, resources/read, prompts/get.
  if (method === 'tools/call' || method === 'resources/read' || method === 'prompts/get') {
    const headerName = c.req.header('Mcp-Name');
    const sourceValue =
      typeof params.name === 'string'
        ? params.name
        : typeof params.uri === 'string'
          ? params.uri
          : undefined;
    if (!headerName || sourceValue === undefined || decodeHeaderValue(headerName) !== sourceValue) {
      return false;
    }
  }

  return true;
}

function headerMismatch(c: Context<AppContext>, id: string | number = 0): Response {
  return c.json(
    createErrorResponse(id, JSON_RPC_ERRORS.HEADER_MISMATCH, 'MCP request header/body mismatch'),
    400
  );
}

// Apply MCP auth middleware only to POST requests. Auth runs first so that
// unauthenticated callers receive 401 (not header-validation 400s) and the
// untrusted body is not parsed before identity is established.
mcpRoutes.use('/', async (c, next) => {
  // Only apply auth to POST requests
  if (c.req.method === 'POST') {
    return mcpAuth(c, next);
  }
  return next();
});

// Validate standard headers on POST before handing off to the handler.
mcpRoutes.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body !== 'object' ||
      !validateMcpHeaders(c, body as Record<string, unknown>)
    ) {
      const rawId = (body as Record<string, unknown>)?.id;
      return headerMismatch(c, typeof rawId === 'string' || typeof rawId === 'number' ? rawId : 0);
    }
    return next();
  }
  return next();
});

// POST - Main JSON-RPC handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Handler types are complex with OpenAPI
mcpRoutes.openapi(mcpJsonRpcRoute, handleMcpRequest as any);

export default mcpRoutes;
