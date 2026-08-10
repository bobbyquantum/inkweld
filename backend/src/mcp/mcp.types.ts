/**
 * MCP (Model Context Protocol) type definitions
 *
 * Based on MCP specification revision 2026-07-28 (stateless)
 * https://modelcontextprotocol.io/specification/2026-07-28
 *
 * This revision made MCP stateless: there is no `initialize` handshake, no
 * protocol-level session, and no `Mcp-Session-Id` header. Every request
 * carries its protocol version and client capabilities in `_meta`, and the
 * server identifies itself in each result's `_meta`.
 */

import type { McpAccessKey, McpPermission } from '../services/mcp-key.service';
import type { DurableObjectNamespace } from '../types/cloudflare';

/**
 * Protocol version this server implements (2026-07-28 "stateless" revision)
 */
export const MCP_PROTOCOL_VERSION = '2026-07-28';

/**
 * `_meta` key prefixes reserved for MCP use (see spec basic/index `_meta`).
 */
export const META_KEYS = {
  protocolVersion: 'io.modelcontextprotocol/protocolVersion',
  clientInfo: 'io.modelcontextprotocol/clientInfo',
  clientCapabilities: 'io.modelcontextprotocol/clientCapabilities',
  serverInfo: 'io.modelcontextprotocol/serverInfo',
  logLevel: 'io.modelcontextprotocol/logLevel',
  subscriptionId: 'io.modelcontextprotocol/subscriptionId',
} as const;

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
  // MCP 2026-07-28 reserved error codes (-32020 to -32099)
  HEADER_MISMATCH: -32020,
  MISSING_REQUIRED_CLIENT_CAPABILITY: -32021,
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
  // Resource-not-found now aligns with JSON-RPC Invalid Params (-32602).
  // Retained for backwards compatibility; clients SHOULD still accept -32002.
  RESOURCE_NOT_FOUND: -32602,
} as const;

/**
 * Error class for JSON-RPC errors that preserves the `code` property
 * required by the MCP error handling pipeline.
 */
export class McpRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

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
// Stateless (2026-07-28) Types
// ============================================

/**
 * Per-request `_meta` metadata. In the stateless protocol every request carries
 * its protocol version, client info, and client capabilities here.
 */
export interface McpRequestMeta {
  [META_KEYS.protocolVersion]?: string;
  [META_KEYS.clientInfo]?: McpClientInfo;
  [META_KEYS.clientCapabilities]?: Record<string, unknown>;
  [META_KEYS.logLevel]?: string;
  [META_KEYS.subscriptionId]?: string | number;
  /** OpenTelemetry trace context */
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
  [key: string]: unknown;
}

/**
 * Result type discriminator required on all 2026-07-28 results.
 */
export type McpResultType = 'complete' | 'input_required' | (string & {});

/**
 * `server/discover` response payload (2026-07-28).
 */
export interface McpDiscoverResult {
  resultType: 'complete';
  supportedVersions: string[];
  capabilities: McpCapabilities;
  _meta?: { [META_KEYS.serverInfo]?: McpServerInfo };
  instructions?: string;
  ttlMs?: number;
  cacheScope?: 'public' | 'private';
}

/**
 * Parse the request `_meta` object from JSON-RPC params.
 */
export function getRequestMeta(params?: Record<string, unknown>): McpRequestMeta | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const meta = (params as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== 'object') return undefined;
  return meta as McpRequestMeta;
}

/**
 * The server's identity to embed in result `_meta`.
 */
export function serverMeta(): { _meta: { [META_KEYS.serverInfo]: McpServerInfo } } {
  return {
    _meta: {
      [META_KEYS.serverInfo]: {
        name: 'inkweld-mcp',
        version: '1.0.0',
      },
    },
  };
}

/**
 * Wrap a result object with the required `resultType: 'complete'` field and
 * the server identity `_meta`, per the stateless spec. Any `_meta` already
 * present on the result (e.g. tool-provided metadata) is merged in rather
 * than discarded.
 */
export function toCompleteResult(result: Record<string, unknown>): Record<string, unknown> {
  const existingMeta = (result._meta ?? {}) as Record<string, unknown>;
  return {
    resultType: 'complete' as McpResultType,
    ...result,
    _meta: { ...existingMeta, ...serverMeta()._meta },
  };
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
  McpTextContent | McpImageContent | McpResourceContent | McpResourceLinkContent;

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

/**
 * Base context fields shared by all auth types
 */
interface McpContextBase {
  /** Client IP address */
  clientIp?: string;
  /** Client info from the request `_meta` (stateless protocol) */
  clientInfo?: McpClientInfo;
  /** Auth token for passing to Durable Objects */
  authToken?: string;
  /** Environment bindings (Cloudflare Workers only) */
  env?: {
    YJS_PROJECTS?: DurableObjectNamespace;
    [key: string]: unknown;
  };
}

/**
 * Context for legacy API key authentication (single project)
 */
export interface McpLegacyContext extends McpContextBase {
  /** Auth type discriminator */
  type: 'legacy';
  /** Validated API key */
  key: McpAccessKey;
  /** Project ID the key grants access to */
  projectId: string;
  /** Parsed permissions from the key */
  permissions: McpPermission[];
  /** Project owner username */
  username: string;
  /** Project slug */
  slug: string;
}

/**
 * OAuth project grant with permissions
 */
export interface McpOAuthGrant {
  /** Project ID */
  projectId: string;
  /** Project slug */
  slug: string;
  /** Project owner username */
  username: string;
  /** Collaboration role (viewer, editor, admin) */
  role: string;
  /** Permissions for this project */
  permissions: string[];
}

/**
 * Context for OAuth JWT authentication (multi-project)
 */
export interface McpOAuthContext extends McpContextBase {
  /** Auth type discriminator */
  type: 'oauth';
  /** User ID from JWT */
  userId: string;
  /** OAuth session ID */
  sessionId: string;
  /** Client ID from JWT */
  clientId: string;
  /** Username from JWT */
  username: string;
  /** Project grants with permissions */
  grants: McpOAuthGrant[];
}

/**
 * Unified MCP context type (discriminated union)
 */
export type McpContext = McpLegacyContext | McpOAuthContext;

/**
 * Active project context - used by handlers that operate on a single project
 * For legacy auth: uses the single project from the context
 * For OAuth auth: uses the first grant (handlers that need multi-project should check context.type)
 */
export interface ActiveProjectContext {
  projectId: string;
  username: string;
  slug: string;
  role: string;
  permissions: string[];
}

/**
 * Get the active project context from an MCP context
 * For legacy auth, returns the single project
 * For OAuth auth, returns the first grant (or null if no grants)
 *
 * Note: Handlers that need multi-project access should check context.type === 'oauth'
 * and iterate through context.grants
 */
export function getActiveProject(ctx: McpContext): ActiveProjectContext | null {
  if (ctx.type === 'legacy') {
    return {
      projectId: ctx.projectId,
      username: ctx.username,
      slug: ctx.slug,
      role: 'legacy',
      permissions: ctx.permissions,
    };
  } else {
    // OAuth: return first grant or null
    const firstGrant = ctx.grants[0];
    if (!firstGrant) return null;
    return {
      projectId: firstGrant.projectId,
      username: firstGrant.username,
      slug: firstGrant.slug,
      role: firstGrant.role,
      permissions: firstGrant.permissions,
    };
  }
}

/**
 * Check if context has a specific permission (for the active project)
 */
export function hasPermission(ctx: McpContext, ...permissions: string[]): boolean {
  if (ctx.type === 'legacy') {
    return permissions.some((p) => ctx.permissions.includes(p as never));
  } else {
    // OAuth: check first grant
    const firstGrant = ctx.grants[0];
    if (!firstGrant) return false;
    return permissions.some((p) => firstGrant.permissions.includes(p));
  }
}

/**
 * Get project-specific context from an MCP context for a specific project ID
 * For legacy auth: returns context only if projectId matches
 * For OAuth auth: finds the matching grant
 */
export function getProjectById(ctx: McpContext, projectId: string): ActiveProjectContext | null {
  if (ctx.type === 'legacy') {
    if (ctx.projectId !== projectId) return null;
    return {
      projectId: ctx.projectId,
      username: ctx.username,
      slug: ctx.slug,
      role: 'legacy',
      permissions: ctx.permissions,
    };
  } else {
    const grant = ctx.grants.find((g) => g.projectId === projectId);
    if (!grant) return null;
    return {
      projectId: grant.projectId,
      username: grant.username,
      slug: grant.slug,
      role: grant.role,
      permissions: grant.permissions,
    };
  }
}

/**
 * Legacy context type for backward compatibility
 * @deprecated Use McpContext with type discriminator instead
 */
export interface LegacyMcpContext {
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
  /** Client info from the request `_meta` (stateless protocol) */
  clientInfo?: McpClientInfo;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get all projects the context has access to
 * For legacy auth: returns single project as array
 * For OAuth auth: returns all grants as array
 */
export function getAllProjects(ctx: McpContext): ActiveProjectContext[] {
  if (ctx.type === 'legacy') {
    return [
      {
        projectId: ctx.projectId,
        username: ctx.username,
        slug: ctx.slug,
        role: 'legacy',
        permissions: ctx.permissions,
      },
    ];
  } else {
    return ctx.grants.map((grant) => ({
      projectId: grant.projectId,
      username: grant.username,
      slug: grant.slug,
      role: grant.role,
      permissions: grant.permissions,
    }));
  }
}

/**
 * Get project context by username and slug
 * For legacy auth: returns context only if username/slug matches
 * For OAuth auth: finds the matching grant
 */
export function getProjectByKey(
  ctx: McpContext,
  username: string,
  slug: string
): ActiveProjectContext | null {
  if (ctx.type === 'legacy') {
    if (ctx.username !== username || ctx.slug !== slug) return null;
    return {
      projectId: ctx.projectId,
      username: ctx.username,
      slug: ctx.slug,
      role: 'legacy',
      permissions: ctx.permissions,
    };
  } else {
    const grant = ctx.grants.find((g) => g.username === username && g.slug === slug);
    if (!grant) return null;
    return {
      projectId: grant.projectId,
      username: grant.username,
      slug: grant.slug,
      role: grant.role,
      permissions: grant.permissions,
    };
  }
}

/**
 * Check if context has a specific permission for a given project
 * For legacy auth: checks against the single project
 * For OAuth auth: checks against the grants for the specified project
 */
export function hasProjectPermission(
  ctx: McpContext,
  username: string,
  slug: string,
  ...permissions: string[]
): boolean {
  const project = getProjectByKey(ctx, username, slug);
  if (!project) return false;
  return permissions.some((p) => project.permissions.includes(p));
}

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
    error: { code, message, ...(data !== undefined ? { data } : {}) },
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
