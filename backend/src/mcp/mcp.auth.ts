/**
 * MCP Authentication Middleware
 *
 * Validates API keys or OAuth JWT tokens and sets up MCP context for handlers.
 * Supports both:
 * - Legacy API keys (iw_proj_...) for single-project access
 * - OAuth JWT tokens (eyJ...) for multi-project access
 */

import type { Context, Next } from 'hono';
import type { AppContext } from '../types/context';
import type { DurableObjectNamespace } from '../types/cloudflare';
import { mcpKeyService, parsePermissions } from '../services/mcp-key.service';
import { mcpOAuthService, type CloudflareEnv } from '../services/mcp-oauth.service';
import { projectService } from '../services/project.service';
import type { McpContext, McpLegacyContext, McpOAuthContext, McpOAuthGrant } from './mcp.types';
import { createErrorResponse, JSON_RPC_ERRORS } from './mcp.types';
import { logger } from '../services/logger.service';

const mcpLog = logger.child('MCP-Auth');

/**
 * Get the base URL for constructing OAuth metadata URLs
 * Uses c.env for Cloudflare Workers, falls back to process.env for local dev
 */
function getBaseUrl(c: Context<AppContext>): string {
  // Note: On Cloudflare Workers, use c.env; on Bun/Node, use process.env
  return (
    (c.env as Record<string, string>)?.BASE_URL || process.env.BASE_URL || 'https://localhost:8333'
  );
}

/**
 * Get the WWW-Authenticate header value for 401 responses
 * This is required by RFC 9728 for OAuth-protected resources
 *
 * Format per MCP spec:
 *   WWW-Authenticate: Bearer realm="mcp", resource_metadata="<url>"
 */
function getWwwAuthenticateHeader(c: Context<AppContext>): string {
  const resourceMetadataUrl = `${getBaseUrl(c)}/.well-known/oauth-protected-resource`;
  return `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`;
}

// Extend Hono context with MCP context
declare module 'hono' {
  interface ContextVariableMap {
    mcpContext: McpContext;
  }
}

/**
 * Extract bearer token from request
 * Supports:
 * - Authorization: Bearer <token>
 * - X-API-Key: <token>
 */
function extractToken(c: Context): string | null {
  // Check Authorization header
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check X-API-Key header (legacy support)
  const apiKeyHeader = c.req.header('X-API-Key');
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Get client IP from request
 */
function getClientIp(c: Context): string | undefined {
  return (
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || c.req.header('X-Real-IP') || undefined
  );
}

/**
 * Handle legacy API key authentication (iw_proj_...)
 */
async function handleLegacyApiKey(
  c: Context<AppContext>,
  token: string,
  clientIp: string | undefined
): Promise<Response | McpLegacyContext> {
  const db = c.get('db');

  // Validate key
  const validation = await mcpKeyService.validateKey(db, token, clientIp);

  if (!validation.valid || !validation.key) {
    c.header('WWW-Authenticate', getWwwAuthenticateHeader(c));
    return c.json(
      createErrorResponse(
        0,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        validation.error || 'Invalid API key'
      ),
      401
    );
  }

  // Get project info
  const project = await projectService.findById(db, validation.key.projectId);
  if (!project) {
    return c.json(createErrorResponse(0, JSON_RPC_ERRORS.INTERNAL_ERROR, 'Project not found'), 404);
  }

  // Get the user to find the username
  const { users } = await import('../db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select().from(users).where(eq(users.id, project.userId)).limit(1);

  if (!user?.username) {
    return c.json(
      createErrorResponse(0, JSON_RPC_ERRORS.INTERNAL_ERROR, 'Project owner not found'),
      500
    );
  }

  // Return legacy context
  return {
    type: 'legacy',
    key: validation.key,
    projectId: validation.key.projectId,
    permissions: parsePermissions(validation.key.permissions),
    username: user.username,
    slug: project.slug,
    clientIp,
    initialized: false,
    authToken: token,
    env: c.env as { YJS_PROJECTS?: DurableObjectNamespace; [key: string]: unknown },
  };
}

/**
 * Handle OAuth JWT authentication (eyJ...)
 */
async function handleOAuthJwt(
  c: Context<AppContext>,
  token: string,
  clientIp: string | undefined
): Promise<Response | McpOAuthContext> {
  // Verify JWT - pass c.env for Cloudflare Workers compatibility
  const payload = await mcpOAuthService.verifyAccessToken(token, c.env as CloudflareEnv);

  if (!payload) {
    c.header('WWW-Authenticate', getWwwAuthenticateHeader(c));
    return c.json(
      createErrorResponse(0, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid or expired access token'),
      401
    );
  }

  // Check if session has been revoked
  const db = c.get('db');
  const revoked = await mcpOAuthService.isSessionRevoked(db, payload.session_id);
  if (revoked) {
    mcpLog.info(`[AUTH] OAuth session ${payload.session_id} has been revoked`);
    c.header('WWW-Authenticate', getWwwAuthenticateHeader(c));
    return c.json(
      createErrorResponse(0, JSON_RPC_ERRORS.INVALID_REQUEST, 'Session has been revoked'),
      401
    );
  }

  // Look up grants from database (not in token to keep it small)
  const sessionGrants = await mcpOAuthService.getSessionGrants(db, payload.session_id);

  // Convert grants to McpOAuthGrant format
  const grants: McpOAuthGrant[] = sessionGrants.map((g) => ({
    projectId: g.projectId,
    slug: g.projectSlug,
    username: g.ownerUsername,
    role: g.role,
    permissions: g.permissions,
  }));

  // Return OAuth context
  return {
    type: 'oauth',
    userId: payload.sub,
    sessionId: payload.session_id,
    clientId: payload.client_id,
    username: payload.username,
    grants,
    clientIp,
    initialized: false,
    authToken: token,
    env: c.env as { YJS_PROJECTS?: DurableObjectNamespace; [key: string]: unknown },
  };
}

/**
 * MCP authentication middleware
 *
 * Validates the token (API key or JWT) and sets up the MCP context.
 * Supports both legacy API keys and OAuth JWT tokens.
 */
export async function mcpAuth(c: Context<AppContext>, next: Next): Promise<Response | void> {
  mcpLog.info('[AUTH] Starting auth middleware');

  // Extract token
  const token = extractToken(c);
  if (!token) {
    mcpLog.info('[AUTH] No token found');
    c.header('WWW-Authenticate', getWwwAuthenticateHeader(c));
    return c.json(
      createErrorResponse(
        0,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        'Missing authorization. Use Authorization: Bearer <token> or X-API-Key header.'
      ),
      401
    );
  }

  mcpLog.info(`[AUTH] Token found, type: ${token.substring(0, 10)}...`);

  const clientIp = getClientIp(c);

  let mcpContext: McpContext | Response;

  // Determine auth type by token prefix
  if (token.startsWith('iw_proj_')) {
    // Legacy API key
    mcpLog.debug('Using legacy API key authentication');
    mcpContext = await handleLegacyApiKey(c, token, clientIp);
  } else if (token.startsWith('eyJ')) {
    // JWT (base64-encoded JSON starts with eyJ)
    mcpLog.debug('Using OAuth JWT authentication');
    mcpContext = await handleOAuthJwt(c, token, clientIp);
  } else {
    c.header('WWW-Authenticate', getWwwAuthenticateHeader(c));
    return c.json(
      createErrorResponse(
        0,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        'Invalid token format. Expected API key (iw_proj_...) or JWT.'
      ),
      401
    );
  }

  // Check if we got an error response
  if (mcpContext instanceof Response) {
    mcpLog.info('[AUTH] Auth returned error response');
    return mcpContext;
  }

  mcpLog.info(`[AUTH] Auth successful, type: ${mcpContext.type}`);

  c.set('mcpContext', mcpContext);

  return next();
}

/**
 * Check if MCP context has a specific permission (for legacy compatibility)
 * For OAuth: checks if ANY grant has the permission (use hasProjectPermission for specific project)
 */
export function requirePermission(c: Context<AppContext>, ...permissions: string[]): boolean {
  const mcpContext = c.get('mcpContext');
  if (!mcpContext) return false;

  if (mcpContext.type === 'legacy') {
    return permissions.some((p) => mcpContext.permissions.includes(p as never));
  } else {
    // OAuth: check if any grant has the permission
    return mcpContext.grants.some((grant) =>
      permissions.some((p) => grant.permissions.includes(p))
    );
  }
}

/**
 * Get the project context for the current request
 * For legacy auth: returns the single project
 * For OAuth auth: requires projectId to be specified or inferred from request
 */
export function getProjectContext(
  ctx: McpContext,
  projectId?: string
): { projectId: string; username: string; slug: string; permissions: string[] } | null {
  if (ctx.type === 'legacy') {
    return {
      projectId: ctx.projectId,
      username: ctx.username,
      slug: ctx.slug,
      permissions: ctx.permissions,
    };
  } else {
    // OAuth: find grant for the specified project
    if (!projectId) return null;
    const grant = ctx.grants.find((g) => g.projectId === projectId);
    if (!grant) return null;
    return {
      projectId: grant.projectId,
      username: grant.username,
      slug: grant.slug,
      permissions: grant.permissions,
    };
  }
}

/**
 * Get all accessible projects for the current context
 */
export function getAccessibleProjects(
  ctx: McpContext
): Array<{ projectId: string; username: string; slug: string; permissions: string[] }> {
  if (ctx.type === 'legacy') {
    return [
      {
        projectId: ctx.projectId,
        username: ctx.username,
        slug: ctx.slug,
        permissions: ctx.permissions,
      },
    ];
  } else {
    return ctx.grants.map((g) => ({
      projectId: g.projectId,
      username: g.username,
      slug: g.slug,
      permissions: g.permissions,
    }));
  }
}

/**
 * Create an error response for permission denied
 */
export function permissionDenied(requiredPermissions: string[]): Response {
  return new Response(
    JSON.stringify(
      createErrorResponse(
        0,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        `Permission denied. Required: ${requiredPermissions.join(' or ')}`
      )
    ),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
