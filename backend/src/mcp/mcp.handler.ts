/**
 * MCP (Model Context Protocol) Handler
 *
 * Core JSON-RPC handler for MCP protocol messages.
 * Handles initialization, resource listing/reading, tools, and prompts.
 */

import type { Context } from 'hono';
import type { AppContext, DatabaseInstance } from '../types/context';
import {
  type McpInitializeParams,
  type McpResource,
  type McpResourceContents,
  type McpTool,
  type McpContext,
  createErrorResponse,
  createSuccessResponse,
  parseJsonRpcRequest,
  JSON_RPC_ERRORS,
  McpRpcError,
  hasPermission,
  MCP_PROTOCOL_VERSION,
  META_KEYS,
  getRequestMeta,
  toCompleteResult,
} from './mcp.types';
import { logger } from '../services/logger.service';

const mcpLog = logger.child('MCP');

// Protocol version we support (2026-07-28 stateless revision)
const PROTOCOL_VERSION = MCP_PROTOCOL_VERSION;

/**
 * The server capabilities advertised by `server/discover` and included in
 * results. In the stateless protocol these no longer vary per-connection.
 */
const SERVER_CAPABILITIES = {
  resources: {
    listChanged: false,
  },
  tools: {
    listChanged: false,
  },
  prompts: {
    listChanged: false,
  },
};

// ============================================
// Resource Registry
// ============================================

interface ResourceHandler {
  getResources: (ctx: McpContext, db: DatabaseInstance) => Promise<McpResource[]>;
  readResource: (
    ctx: McpContext,
    db: DatabaseInstance,
    uri: string
  ) => Promise<McpResourceContents | null>;
}

const resourceHandlers: ResourceHandler[] = [];

/**
 * Register a resource handler
 */
export function registerResourceHandler(handler: ResourceHandler): void {
  resourceHandlers.push(handler);
}

// ============================================
// Tool Registry
// ============================================

interface ToolHandler {
  tool: McpTool;
  requiredPermissions: string[];
  execute: (
    ctx: McpContext,
    db: DatabaseInstance,
    args: Record<string, unknown>
  ) => Promise<unknown>;
}

const toolRegistry = new Map<string, ToolHandler>();

/**
 * Register a tool
 */
export function registerTool(handler: ToolHandler): void {
  toolRegistry.set(handler.tool.name, handler);
}

// ============================================
// Method Handlers
// ============================================

/**
 * Validate the per-request `_meta` protocol fields.
 *
 * Every modern request MUST include `io.modelcontextprotocol/protocolVersion`
 * and `io.modelcontextprotocol/clientCapabilities` in `_meta`. A request
 * missing a required field is malformed and is rejected with
 * `Invalid Params` (-32602) and HTTP 400. An unsupported version is rejected
 * with `UnsupportedProtocolVersionError` (-32022) and HTTP 400.
 *
 * @throws McpRpcError when the request is missing required `_meta` fields,
 *   carries an unsupported version, or the version header/body mismatch.
 */
function validateRequestMeta(
  params: Record<string, unknown> | undefined,
  headerVersion?: string | null
): string {
  const meta = getRequestMeta(params);
  const bodyVersion = meta?.[META_KEYS.protocolVersion];
  const hasClientCapabilities = meta?.[META_KEYS.clientCapabilities] !== undefined;

  if (headerVersion && bodyVersion && headerVersion !== bodyVersion) {
    throw new McpRpcError(
      JSON_RPC_ERRORS.HEADER_MISMATCH,
      `Header mismatch: MCP-Protocol-Version header '${headerVersion}' does not match body _meta value '${bodyVersion}'`,
      { field: 'MCP-Protocol-Version', header: headerVersion, body: bodyVersion }
    );
  }

  // Body is the source of truth per the spec; the header (when present) must
  // already have been validated by the transport layer. A request missing a
  // required `_meta` field is malformed -> Invalid Params (-32602) per spec,
  // carried on HTTP as 400 (see the catch handler below).
  if (!bodyVersion) {
    throw new McpRpcError(
      JSON_RPC_ERRORS.INVALID_PARAMS,
      'Missing required _meta field: io.modelcontextprotocol/protocolVersion',
      { requiredField: META_KEYS.protocolVersion }
    );
  }

  if (!hasClientCapabilities) {
    throw new McpRpcError(
      JSON_RPC_ERRORS.INVALID_PARAMS,
      'Missing required _meta field: io.modelcontextprotocol/clientCapabilities',
      { requiredField: META_KEYS.clientCapabilities }
    );
  }

  if (bodyVersion !== PROTOCOL_VERSION) {
    throw new McpRpcError(
      JSON_RPC_ERRORS.UNSUPPORTED_PROTOCOL_VERSION,
      'Unsupported protocol version',
      {
        supported: [PROTOCOL_VERSION],
        requested: bodyVersion,
      }
    );
  }

  return bodyVersion;
}

/**
 * Handle `server/discover` (2026-07-28).
 *
 * Advertises the server's supported protocol versions, capabilities, and
 * identity so a client can select a version before sending other requests.
 */
function handleDiscover(): Record<string, unknown> {
  return toCompleteResult({
    supportedVersions: [PROTOCOL_VERSION],
    capabilities: SERVER_CAPABILITIES,
    instructions:
      'Inkweld MCP server: read and edit creative-writing projects, documents, worldbuilding and schemas. Tools operate on projects addressed by `username/slug`.',
    ttlMs: 3600000,
    cacheScope: 'public',
  });
}

/**
 * Handle resources/list request
 */
async function handleResourcesList(c: Context<AppContext>): Promise<Record<string, unknown>> {
  const mcpContext = c.get('mcpContext');
  const db = c.get('db');

  mcpLog.info('[resources/list] Starting...');

  if (!mcpContext) {
    throw new Error('MCP context not available');
  }

  const allResources: McpResource[] = [];

  // Collect resources from all handlers
  let handlerIndex = 0;
  for (const handler of resourceHandlers) {
    mcpLog.info(`[resources/list] Handler ${handlerIndex} starting...`);
    const resources = await handler.getResources(mcpContext, db);
    mcpLog.info(`[resources/list] Handler ${handlerIndex} returned ${resources.length} resources`);
    allResources.push(...resources);
    handlerIndex++;
  }

  mcpLog.info(`[resources/list] Done, total ${allResources.length} resources`);
  return toCompleteResult({ resources: allResources });
}

/**
 * Handle resources/read request
 */
async function handleResourcesRead(
  c: Context<AppContext>,
  params: { uri: string }
): Promise<Record<string, unknown>> {
  const mcpContext = c.get('mcpContext');
  const db = c.get('db');

  if (!mcpContext) {
    throw new Error('MCP context not available');
  }

  const { uri } = params;

  // Try resource handlers
  for (const handler of resourceHandlers) {
    const content = await handler.readResource(mcpContext, db, uri);
    if (content) {
      return toCompleteResult({ contents: [content] });
    }
  }

  throw new McpRpcError(JSON_RPC_ERRORS.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
}

/**
 * Handle tools/list request
 */
async function handleToolsList(c: Context<AppContext>): Promise<Record<string, unknown>> {
  const mcpContext = c.get('mcpContext');

  if (!mcpContext) {
    throw new Error('MCP context not available');
  }

  // Return tools that the user has permission to use
  const tools: McpTool[] = [];

  for (const handler of toolRegistry.values()) {
    // Check if user has any of the required permissions
    const hasToolPermission = handler.requiredPermissions.some((p) => hasPermission(mcpContext, p));

    if (hasToolPermission || handler.requiredPermissions.length === 0) {
      tools.push(handler.tool);
    }
  }

  return toCompleteResult({ tools });
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(
  c: Context<AppContext>,
  params: { name: string; arguments?: Record<string, unknown> }
): Promise<unknown> {
  const mcpContext = c.get('mcpContext');
  const db = c.get('db');

  if (!mcpContext) {
    throw new Error('MCP context not available');
  }

  const { name, arguments: args = {} } = params;

  const handler = toolRegistry.get(name);
  if (!handler) {
    throw new McpRpcError(JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }

  // Check permissions
  const hasToolPermission = handler.requiredPermissions.some((p) => hasPermission(mcpContext, p));

  if (!hasToolPermission && handler.requiredPermissions.length > 0) {
    throw new McpRpcError(
      JSON_RPC_ERRORS.INVALID_REQUEST,
      `Permission denied. Required: ${handler.requiredPermissions.join(' or ')}`
    );
  }

  // Execute tool
  const toolResult = await handler.execute(mcpContext, db, args);
  // Wrap tool results in the required `resultType: 'complete'` envelope.
  if (toolResult && typeof toolResult === 'object') {
    return toCompleteResult(toolResult as Record<string, unknown>);
  }
  return toCompleteResult({});
}

// ============================================
// Main Handler
// ============================================

/**
 * Generate a secure session ID for legacy (pre-2026-07-28) MCP clients that
 * use the `initialize` handshake and expect an `Mcp-Session-Id` header.
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Main MCP JSON-RPC handler for Streamable HTTP transport
 *
 * Implements MCP protocol version 2026-07-28 (stateless):
 * - No `initialize` handshake and no `Mcp-Session-Id` header
 * - Every request carries its protocol version in `_meta`
 * - `server/discover` advertises supported versions
 * - Returns 202 Accepted for notifications
 * - Unknown RPC methods return 404 with a JSON-RPC -32601 error
 */
export async function handleMcpRequest(c: Context<AppContext>): Promise<Response> {
  let requestId: string | number | undefined = undefined;
  const startTime = Date.now();

  mcpLog.info('[HANDLER] Request received');

  try {
    mcpLog.info('[HANDLER] Parsing body...');

    // Parse request body
    const body = await c.req.json().catch(() => null);

    mcpLog.info(`[HANDLER] Body parsed, method: ${(body as Record<string, unknown>)?.method}`);

    const request = parseJsonRpcRequest(body);

    if (!request) {
      return c.json(
        createErrorResponse(0, JSON_RPC_ERRORS.PARSE_ERROR, 'Invalid JSON-RPC request')
      );
    }

    requestId = request.id;
    const { method, params } = request;
    const paramRecord = (params ?? {}) as Record<string, unknown>;

    mcpLog.info(`[START] ${method} (id: ${requestId})`);

    // Check if this is a notification (no id = no response expected)
    const isNotification = requestId === undefined;

    // The 2026-07-28 Streamable HTTP transport returns 202 Accepted with no
    // body for any notification POST (the core protocol defines no
    // client-sent notifications over this transport).
    if (isNotification) {
      mcpLog.info(`[END] notification ${method} (accepted)`);
      return new Response(null, { status: 202 });
    }

    // Dual-era detection: modern clients carry their protocol version in
    // `_meta`; legacy clients (e.g. MCP Inspector 0.22.0, which predates the
    // stateless revision) use the `initialize` handshake. The spec endorses
    // serving both concurrently.
    const requestMeta = getRequestMeta(paramRecord);
    const isModernRequest = requestMeta?.[META_KEYS.protocolVersion] !== undefined;

    if (!isModernRequest) {
      // Legacy-era request. `initialize` is answered with the classic
      // initialize result (and an Mcp-Session-Id header). Other methods are
      // served statelessly without `_meta` requirements below.
      if (method === 'initialize' || method === 'notifications/initialized') {
        const initializeParams = paramRecord as unknown as McpInitializeParams;
        const sessionId = generateSessionId();
        return c.json(
          {
            jsonrpc: '2.0',
            id: requestId,
            result: {
              protocolVersion: initializeParams.protocolVersion || PROTOCOL_VERSION,
              capabilities: SERVER_CAPABILITIES,
              serverInfo: { name: 'inkweld-mcp', version: '1.0.0' },
            },
          },
          200,
          { 'Mcp-Session-Id': sessionId }
        );
      }
      // Legacy ping is answered leniently.
      if (method === 'ping') {
        return c.json({ jsonrpc: '2.0', id: requestId, result: {} });
      }
      mcpLog.info(`[START] legacy ${method} (id: ${requestId})`);
    } else {
      // Validate the per-request `_meta` protocol fields carried in `_meta`.
      validateRequestMeta(paramRecord, c.req.header('MCP-Protocol-Version'));
    }

    // Route to appropriate handler
    let result: unknown;

    switch (method) {
      case 'server/discover':
        result = handleDiscover();
        break;

      case 'resources/list':
        result = await handleResourcesList(c);
        break;

      case 'resources/read':
        result = await handleResourcesRead(c, paramRecord as { uri: string });
        break;

      case 'resources/templates/list':
        // Future work: implement resource templates
        result = toCompleteResult({ resourceTemplates: [] });
        break;

      case 'prompts/list':
        // No prompt templates are defined by this server yet.
        result = toCompleteResult({ prompts: [] });
        break;

      case 'prompts/get':
        // No prompt templates are defined by this server yet.
        throw new McpRpcError(JSON_RPC_ERRORS.INVALID_PARAMS, 'Prompt not found');

      case 'tools/list':
        result = await handleToolsList(c);
        break;

      case 'tools/call':
        result = await handleToolsCall(
          c,
          paramRecord as { name: string; arguments?: Record<string, unknown> }
        );
        break;

      // Removed in the stateless protocol: `initialize`, `notifications/initialized`,
      // `ping`, `notifications/roots/list_changed`, `logging/setLevel`. Unknown
      // methods return 404 with a JSON-RPC -32601 error per the spec.
      default:
        mcpLog.info(`[END] unknown method (${Date.now() - startTime}ms)`);
        return c.json(
          createErrorResponse(
            requestId ?? 0,
            JSON_RPC_ERRORS.METHOD_NOT_FOUND,
            `Unknown method: ${method}`
          ),
          404
        );
    }

    const elapsed = Date.now() - startTime;
    mcpLog.info(`[END] ${method} (${elapsed}ms)`);

    // Build response with appropriate headers. No Mcp-Session-Id is minted:
    // the protocol is stateless.
    const responseBody = createSuccessResponse(requestId ?? 0, result);

    return c.json(responseBody);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    mcpLog.error('MCP', `[ERROR] (${elapsed}ms)`, { error: err });

    // Handle canonical MCP RPC errors (thrown by handlers)
    if (err instanceof McpRpcError) {
      // A request missing a required `_meta` field is malformed; per the spec
      // this is HTTP 400 (Invalid Params). Detect it via the data discriminator
      // rather than string-matching the message.
      const missingRequiredField =
        err.code === JSON_RPC_ERRORS.INVALID_PARAMS &&
        (err.data as Record<string, unknown> | undefined)?.requiredField !== undefined;
      const isMetaValidationFailure =
        err.code === JSON_RPC_ERRORS.UNSUPPORTED_PROTOCOL_VERSION ||
        err.code === JSON_RPC_ERRORS.HEADER_MISMATCH ||
        err.code === JSON_RPC_ERRORS.MISSING_REQUIRED_CLIENT_CAPABILITY ||
        missingRequiredField;
      return c.json(
        createErrorResponse(requestId ?? 0, err.code, err.message, err.data),
        isMetaValidationFailure ? 400 : undefined
      );
    }

    // Handle unexpected errors — sanitize message to avoid leaking internals
    return c.json(
      createErrorResponse(
        requestId ?? 0,
        JSON_RPC_ERRORS.INTERNAL_ERROR,
        err instanceof Error ? err.message : 'Internal server error'
      )
    );
  }
}
