import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { AppContext } from '../types/context';
import { mcpAuth, handleMcpRequest } from '../mcp';

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
// MCP JSON-RPC Endpoint (API Key Auth)
// ============================================

const mcpJsonRpcRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['MCP'],
  operationId: 'mcpJsonRpc',
  description:
    'MCP (Model Context Protocol) JSON-RPC endpoint. Authenticate with Bearer token or X-API-Key header.',
  request: {
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
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Invalid or missing API key',
    },
  },
});

// Apply MCP auth and handler
mcpRoutes.use('/', mcpAuth);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Handler types are complex with OpenAPI
mcpRoutes.openapi(mcpJsonRpcRoute, handleMcpRequest as any);

export default mcpRoutes;
