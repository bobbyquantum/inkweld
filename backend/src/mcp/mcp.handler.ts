/**
 * MCP (Model Context Protocol) Handler
 *
 * Core JSON-RPC handler for MCP protocol messages.
 * Handles initialization, resource listing/reading, tools, and prompts.
 */

import type { Context } from 'hono';
import type { AppContext } from '../types/context';
import {
  type JsonRpcRequest as _JsonRpcRequest,
  type JsonRpcResponse as _JsonRpcResponse,
  type McpInitializeParams,
  type McpInitializeResult,
  type McpResource,
  type McpResourceContents,
  type McpTool,
  type McpPrompt,
  type McpContext,
  createErrorResponse,
  createSuccessResponse,
  parseJsonRpcRequest,
  JSON_RPC_ERRORS,
  hasPermission,
} from './mcp.types';
import { logger } from '../services/logger.service';

const mcpLog = logger.child('MCP');

// Protocol version we support
const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'inkweld-mcp';
const SERVER_VERSION = '1.0.0';

// ============================================
// Resource Registry
// ============================================

interface ResourceHandler {
  getResources: (ctx: McpContext, db: unknown) => Promise<McpResource[]>;
  readResource: (ctx: McpContext, db: unknown, uri: string) => Promise<McpResourceContents | null>;
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
  execute: (ctx: McpContext, db: unknown, args: Record<string, unknown>) => Promise<unknown>;
}

const toolRegistry = new Map<string, ToolHandler>();

/**
 * Register a tool
 */
export function registerTool(handler: ToolHandler): void {
  toolRegistry.set(handler.tool.name, handler);
}

// ============================================
// Prompt Registry
// ============================================

interface PromptHandler {
  prompt: McpPrompt;
  getPrompt: (
    ctx: McpContext,
    args: Record<string, unknown>
  ) => Promise<{
    description?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
  }>;
}

const promptRegistry = new Map<string, PromptHandler>();

/**
 * Register a prompt
 */
export function registerPrompt(handler: PromptHandler): void {
  promptRegistry.set(handler.prompt.name, handler);
}

// ============================================
// Method Handlers
// ============================================

/**
 * Handle initialize request
 */
async function handleInitialize(
  c: Context<AppContext>,
  params: McpInitializeParams
): Promise<McpInitializeResult> {
  const mcpContext = c.get('mcpContext');

  // Update context with client info
  if (mcpContext) {
    mcpContext.initialized = true;
    mcpContext.clientInfo = params.clientInfo;
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    capabilities: {
      resources: {
        subscribe: false, // TODO: implement subscriptions
        listChanged: false,
      },
      tools: {
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
    },
  };
}

/**
 * Handle resources/list request
 */
async function handleResourcesList(c: Context<AppContext>): Promise<{ resources: McpResource[] }> {
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
  return { resources: allResources };
}

/**
 * Handle resources/read request
 */
async function handleResourcesRead(
  c: Context<AppContext>,
  params: { uri: string }
): Promise<{ contents: McpResourceContents[] }> {
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
      return { contents: [content] };
    }
  }

  throw { code: JSON_RPC_ERRORS.RESOURCE_NOT_FOUND, message: `Resource not found: ${uri}` };
}

/**
 * Handle tools/list request
 */
async function handleToolsList(c: Context<AppContext>): Promise<{ tools: McpTool[] }> {
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

  return { tools };
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
    throw { code: JSON_RPC_ERRORS.METHOD_NOT_FOUND, message: `Unknown tool: ${name}` };
  }

  // Check permissions
  const hasToolPermission = handler.requiredPermissions.some((p) => hasPermission(mcpContext, p));

  if (!hasToolPermission && handler.requiredPermissions.length > 0) {
    throw {
      code: JSON_RPC_ERRORS.INVALID_REQUEST,
      message: `Permission denied. Required: ${handler.requiredPermissions.join(' or ')}`,
    };
  }

  // Execute tool
  return handler.execute(mcpContext, db, args);
}

/**
 * Handle prompts/list request
 */
async function handlePromptsList(_c: Context<AppContext>): Promise<{ prompts: McpPrompt[] }> {
  return { prompts: Array.from(promptRegistry.values()).map((h) => h.prompt) };
}

/**
 * Handle prompts/get request
 */
async function handlePromptsGet(
  c: Context<AppContext>,
  params: { name: string; arguments?: Record<string, unknown> }
): Promise<unknown> {
  const mcpContext = c.get('mcpContext');

  if (!mcpContext) {
    throw new Error('MCP context not available');
  }

  const { name, arguments: args = {} } = params;

  const handler = promptRegistry.get(name);
  if (!handler) {
    throw { code: JSON_RPC_ERRORS.METHOD_NOT_FOUND, message: `Unknown prompt: ${name}` };
  }

  return handler.getPrompt(mcpContext, args);
}

// ============================================
// Main Handler
// ============================================

/**
 * Generate a secure session ID for MCP Streamable HTTP transport
 */
function generateSessionId(): string {
  // Use crypto-safe random for session ID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Main MCP JSON-RPC handler for Streamable HTTP transport
 *
 * Implements MCP protocol version 2025-06-18:
 * - Returns Mcp-Session-Id header on initialize response
 * - Returns 202 Accepted for notifications
 * - Validates MCP-Protocol-Version header when present
 */
export async function handleMcpRequest(c: Context<AppContext>): Promise<Response> {
  let requestId: string | number | undefined = undefined;
  const startTime = Date.now();

  mcpLog.info('[HANDLER] Request received');

  try {
    // Check MCP-Protocol-Version header if present
    const clientProtocolVersion = c.req.header('MCP-Protocol-Version');
    if (clientProtocolVersion && clientProtocolVersion !== PROTOCOL_VERSION) {
      // Log but don't reject - be lenient for compatibility
      mcpLog.debug(
        `Client protocol version ${clientProtocolVersion} differs from ${PROTOCOL_VERSION}`
      );
    }

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
    const { method, params = {} } = request;

    mcpLog.info(`[START] ${method} (id: ${requestId})`);

    // Check if this is a notification (no id = no response expected)
    const isNotification = requestId === undefined;

    // Route to appropriate handler
    let result: unknown;
    let isInitialize = false;

    switch (method) {
      case 'initialize':
        result = await handleInitialize(c, params as unknown as McpInitializeParams);
        isInitialize = true;
        break;

      case 'initialized':
      case 'notifications/initialized':
        // Client acknowledges initialization - return 202 Accepted for notifications
        if (isNotification) {
          return new Response(null, { status: 202 });
        }
        result = {};
        break;

      case 'resources/list':
        result = await handleResourcesList(c);
        break;

      case 'resources/read':
        result = await handleResourcesRead(c, params as { uri: string });
        break;

      case 'resources/templates/list':
        // TODO: implement resource templates
        result = { resourceTemplates: [] };
        break;

      case 'tools/list':
        result = await handleToolsList(c);
        break;

      case 'tools/call':
        result = await handleToolsCall(
          c,
          params as { name: string; arguments?: Record<string, unknown> }
        );
        break;

      case 'prompts/list':
        result = await handlePromptsList(c);
        break;

      case 'prompts/get':
        result = await handlePromptsGet(
          c,
          params as { name: string; arguments?: Record<string, unknown> }
        );
        break;

      case 'ping':
        result = {};
        break;

      default:
        mcpLog.info(`[END] unknown method (${Date.now() - startTime}ms)`);
        return c.json(
          createErrorResponse(
            requestId ?? 0,
            JSON_RPC_ERRORS.METHOD_NOT_FOUND,
            `Unknown method: ${method}`
          )
        );
    }

    const elapsed = Date.now() - startTime;
    mcpLog.info(`[END] ${method} (${elapsed}ms)`);

    // Build response with appropriate headers
    const responseBody = createSuccessResponse(requestId ?? 0, result);

    // For initialize, return Mcp-Session-Id header
    if (isInitialize) {
      const sessionId = generateSessionId();
      mcpLog.debug(`MCP session initialized: ${sessionId}`);
      return c.json(responseBody, 200, {
        'Mcp-Session-Id': sessionId,
      });
    }

    return c.json(responseBody);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    mcpLog.error('MCP', `[ERROR] (${elapsed}ms)`, { error: err });

    // Handle structured errors
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      const error = err as { code: number; message: string };
      return c.json(createErrorResponse(requestId ?? 0, error.code, error.message));
    }

    // Handle unexpected errors
    return c.json(
      createErrorResponse(
        requestId ?? 0,
        JSON_RPC_ERRORS.INTERNAL_ERROR,
        err instanceof Error ? err.message : 'Internal server error'
      )
    );
  }
}
