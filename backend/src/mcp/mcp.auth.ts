/**
 * MCP Authentication Middleware
 *
 * Validates API keys and sets up MCP context for handlers.
 */

import type { Context, Next } from 'hono';
import type { AppContext } from '../types/context';
import { mcpKeyService, parsePermissions } from '../services/mcp-key.service';
import { projectService } from '../services/project.service';
import type { McpContext } from './mcp.types';
import { createErrorResponse, JSON_RPC_ERRORS } from './mcp.types';

// Extend Hono context with MCP context
declare module 'hono' {
  interface ContextVariableMap {
    mcpContext: McpContext;
  }
}

/**
 * Extract API key from request
 * Supports:
 * - Authorization: Bearer iw_proj_...
 * - X-API-Key: iw_proj_...
 */
function extractApiKey(c: Context): string | null {
  // Check Authorization header
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check X-API-Key header
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
 * MCP authentication middleware
 *
 * Validates the API key and sets up the MCP context.
 * The context includes the validated key, project info, and permissions.
 */
export async function mcpAuth(c: Context<AppContext>, next: Next): Promise<Response | void> {
  const db = c.get('db');

  // Extract API key
  const apiKey = extractApiKey(c);
  if (!apiKey) {
    return c.json(
      createErrorResponse(
        0,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        'Missing API key. Use Authorization: Bearer <key> or X-API-Key header.'
      ),
      401
    );
  }

  // Validate key
  const clientIp = getClientIp(c);
  const validation = await mcpKeyService.validateKey(db, apiKey, clientIp);

  if (!validation.valid || !validation.key) {
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

  // Set up MCP context
  const mcpContext: McpContext = {
    key: validation.key,
    projectId: validation.key.projectId,
    permissions: parsePermissions(validation.key.permissions),
    username: user.username,
    slug: project.slug,
    clientIp,
    initialized: false,
  };

  c.set('mcpContext', mcpContext);

  return next();
}

/**
 * Check if MCP context has a specific permission
 */
export function requirePermission(c: Context<AppContext>, ...permissions: string[]): boolean {
  const mcpContext = c.get('mcpContext');
  if (!mcpContext) return false;

  return permissions.some((p) => mcpContext.permissions.includes(p as never));
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
