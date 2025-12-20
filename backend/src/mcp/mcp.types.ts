/**
 * MCP (Model Context Protocol) type definitions
 *
 * Based on MCP specification revision 2025-06-18
 * https://modelcontextprotocol.io/specification/2025-06-18
 */

import type { McpAccessKey, McpPermission } from '../db/schema/mcp-access-keys';

// ============================================
// JSON-RPC Types
// ============================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number; // Optional for notifications
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP-specific
  RESOURCE_NOT_FOUND: -32002,
} as const;

// ============================================
// MCP Protocol Types
// ============================================

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpClientInfo {
  name: string;
  version: string;
}

export interface McpCapabilities {
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface McpInitializeParams {
  protocolVersion: string;
  clientInfo: McpClientInfo;
  capabilities?: McpCapabilities;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: McpServerInfo;
  capabilities: McpCapabilities;
}

// ============================================
// Resource Types
// ============================================

export interface McpResourceAnnotations {
  audience?: Array<'user' | 'assistant'>;
  priority?: number;
  lastModified?: string;
}

export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  annotations?: McpResourceAnnotations;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
  annotations?: McpResourceAnnotations;
}

// ============================================
// Tool Types
// ============================================

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  outputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: McpToolAnnotations;
}

export interface McpToolResult {
  content: McpToolResultContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

export type McpToolResultContent =
  | McpTextContent
  | McpImageContent
  | McpResourceContent
  | McpResourceLinkContent;

export interface McpTextContent {
  type: 'text';
  text: string;
  annotations?: McpResourceAnnotations;
}

export interface McpImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
  annotations?: McpResourceAnnotations;
}

export interface McpResourceContent {
  type: 'resource';
  resource: McpResourceContents;
}

export interface McpResourceLinkContent {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: McpResourceAnnotations;
}

// ============================================
// Prompt Types
// ============================================

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: McpPromptMessageContent;
}

export type McpPromptMessageContent = McpTextContent | McpImageContent | McpResourceContent;

export interface McpPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

// ============================================
// MCP Context (for handlers)
// ============================================

export interface McpContext {
  /** Validated API key */
  key: McpAccessKey;
  /** Project ID the key grants access to */
  projectId: string;
  /** Parsed permissions from the key */
  permissions: McpPermission[];
  /** Project username (parsed from URL) */
  username: string;
  /** Project slug (parsed from URL) */
  slug: string;
  /** Client IP address */
  clientIp?: string;
  /** Whether the session is initialized */
  initialized: boolean;
  /** Client info from initialization */
  clientInfo?: McpClientInfo;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  };
}

/**
 * Create a JSON-RPC success response
 */
export function createSuccessResponse(id: string | number, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * Parse a JSON-RPC request from body
 * Supports both requests (with id) and notifications (without id)
 */
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  if (!body || typeof body !== 'object') return null;

  const req = body as Record<string, unknown>;

  if (req.jsonrpc !== '2.0') return null;
  if (typeof req.method !== 'string') return null;

  // id is optional for notifications, but if present must be string or number
  if (req.id !== undefined && req.id !== null) {
    if (typeof req.id !== 'string' && typeof req.id !== 'number') return null;
  }

  return {
    jsonrpc: '2.0',
    id: req.id as string | number | undefined,
    method: req.method,
    params: req.params as Record<string, unknown> | undefined,
  };
}
