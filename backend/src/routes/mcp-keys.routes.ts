/**
 * MCP Access Key Management Routes
 *
 * REST API for managing MCP access keys from the frontend.
 * These routes use session authentication (not API key auth).
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { mcpKeyService } from '../services/mcp-key.service';
import { MCP_PERMISSIONS, type McpPermission } from '../db/schema/mcp-access-keys';
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from '../errors';
import type { AppContext, DatabaseInstance, User } from '../types/context';

const mcpKeyRoutes = new OpenAPIHono<AppContext>();

// Apply session auth middleware
mcpKeyRoutes.use('*', requireAuth);

// ============================================
// Schemas
// ============================================

const PermissionSchema = z
  .enum([
    'read:project',
    'read:elements',
    'read:documents',
    'read:worldbuilding',
    'read:schemas',
    'read:media',
    'write:elements',
    'write:worldbuilding',
    'write:schemas',
    'write:media',
  ])
  .openapi('McpPermission');

const PublicKeySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    keyPrefix: z.string(),
    permissions: z.array(PermissionSchema),
    expiresAt: z.number().nullable(),
    lastUsedAt: z.number().nullable(),
    createdAt: z.number(),
    revoked: z.boolean(),
  })
  .openapi('McpPublicKey');

const CreateKeyRequestSchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ description: 'Friendly name for the key' }),
    permissions: z.array(PermissionSchema).min(1).openapi({ description: 'Permissions to grant' }),
    expiresAt: z
      .number()
      .optional()
      .openapi({ description: 'Expiration timestamp (ms since epoch)' }),
  })
  .openapi('CreateMcpKeyRequest');

const CreateKeyResponseSchema = z
  .object({
    key: PublicKeySchema,
    fullKey: z.string().openapi({ description: 'Full API key (only shown once!)' }),
  })
  .openapi('CreateMcpKeyResponse');

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('McpKeyError');

const MessageSchema = z
  .object({
    message: z.string(),
  })
  .openapi('McpKeyMessage');

const ProjectPathParams = z.object({
  username: z.string(),
  slug: z.string(),
});

const KeyIdParams = ProjectPathParams.extend({
  keyId: z.string(),
});

// ============================================
// Helper: Verify project ownership
// ============================================

async function verifyProjectOwnership(
  db: DatabaseInstance,
  user: User | undefined | null,
  username: string,
  slug: string
): Promise<{ projectId: string }> {
  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Verify ownership
  if (project.userId !== user.id && !user.isAdmin) {
    throw new ForbiddenError('You do not have access to this project');
  }

  return { projectId: project.id };
}

// ============================================
// Routes
// ============================================

// List all keys for a project
const listKeysRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/keys',
  tags: ['MCP Keys'],
  operationId: 'listMcpKeys',
  request: {
    params: ProjectPathParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(PublicKeySchema),
        },
      },
      description: 'List of API keys',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
  },
});

mcpKeyRoutes.openapi(listKeysRoute, async (c) => {
  const { username, slug } = c.req.param();
  const db = c.get('db');
  const user = c.get('user');
  const { projectId } = await verifyProjectOwnership(db, user, username, slug);

  const keys = await mcpKeyService.getKeysForProject(db, projectId);
  return c.json(keys, 200);
});

// Create a new key
const createKeyRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/keys',
  tags: ['MCP Keys'],
  operationId: 'createMcpKey',
  request: {
    params: ProjectPathParams,
    body: {
      content: {
        'application/json': {
          schema: CreateKeyRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: CreateKeyResponseSchema,
        },
      },
      description: 'Key created. IMPORTANT: The fullKey is only shown once!',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid request',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
  },
});

mcpKeyRoutes.openapi(createKeyRoute, async (c) => {
  const { username, slug } = c.req.param();
  const db = c.get('db');
  const user = c.get('user');
  const { projectId } = await verifyProjectOwnership(db, user, username, slug);

  const body = await c.req.json();
  const { name, permissions, expiresAt } = CreateKeyRequestSchema.parse(body);

  // Validate permissions
  const validPermissions = permissions.filter((p) =>
    Object.values(MCP_PERMISSIONS).includes(p as McpPermission)
  ) as McpPermission[];

  if (validPermissions.length === 0) {
    throw new BadRequestError('At least one valid permission is required');
  }

  const { fullKey, keyRecord } = await mcpKeyService.createKey(
    db,
    projectId,
    name,
    validPermissions,
    expiresAt
  );

  return c.json(
    {
      key: {
        id: keyRecord.id,
        name: keyRecord.name,
        keyPrefix: keyRecord.keyPrefix,
        permissions: validPermissions,
        expiresAt: keyRecord.expiresAt,
        lastUsedAt: keyRecord.lastUsedAt,
        createdAt: keyRecord.createdAt,
        revoked: false,
      },
      fullKey,
    },
    201
  );
});

// Revoke a key
const revokeKeyRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/keys/:keyId/revoke',
  tags: ['MCP Keys'],
  operationId: 'revokeMcpKey',
  request: {
    params: KeyIdParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Key revoked',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Key not found',
    },
  },
});

mcpKeyRoutes.openapi(revokeKeyRoute, async (c) => {
  const { username, slug, keyId } = c.req.param();
  const db = c.get('db');
  const user = c.get('user');
  const { projectId } = await verifyProjectOwnership(db, user, username, slug);

  // Verify key belongs to project
  const key = await mcpKeyService.getKeyById(db, keyId);
  if (!key || key.projectId !== projectId) {
    throw new NotFoundError('Key not found');
  }

  await mcpKeyService.revokeKey(db, keyId, 'Revoked by user');

  return c.json({ message: 'Key revoked successfully' }, 200);
});

// Delete a key permanently
const deleteKeyRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/keys/:keyId',
  tags: ['MCP Keys'],
  operationId: 'deleteMcpKey',
  request: {
    params: KeyIdParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Key deleted',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Key not found',
    },
  },
});

mcpKeyRoutes.openapi(deleteKeyRoute, async (c) => {
  const { username, slug, keyId } = c.req.param();
  const db = c.get('db');
  const user = c.get('user');
  const { projectId } = await verifyProjectOwnership(db, user, username, slug);

  // Verify key belongs to project
  const key = await mcpKeyService.getKeyById(db, keyId);
  if (!key || key.projectId !== projectId) {
    throw new NotFoundError('Key not found');
  }

  await mcpKeyService.deleteKey(db, keyId);

  return c.json({ message: 'Key deleted successfully' }, 200);
});

// Get available permissions (for UI)
const getPermissionsRoute = createRoute({
  method: 'get',
  path: '/permissions',
  tags: ['MCP Keys'],
  operationId: 'getMcpPermissions',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            permissions: z.array(
              z.object({
                id: PermissionSchema,
                name: z.string(),
                description: z.string(),
                category: z.enum(['read', 'write']),
              })
            ),
            presets: z.record(z.string(), z.array(PermissionSchema)),
          }),
        },
      },
      description: 'Available permissions and presets',
    },
  },
});

mcpKeyRoutes.openapi(getPermissionsRoute, async (c) => {
  return c.json({
    permissions: [
      {
        id: 'read:project',
        name: 'Read Project',
        description: 'Read project metadata (title, description)',
        category: 'read',
      },
      {
        id: 'read:elements',
        name: 'Read Elements',
        description: 'Read project tree and element structure',
        category: 'read',
      },
      {
        id: 'read:documents',
        name: 'Read Documents',
        description: 'Read document content',
        category: 'read',
      },
      {
        id: 'read:worldbuilding',
        name: 'Read Worldbuilding',
        description: 'Read worldbuilding data (characters, locations, etc.)',
        category: 'read',
      },
      {
        id: 'read:schemas',
        name: 'Read Schemas',
        description: 'Read template schemas',
        category: 'read',
      },
      {
        id: 'read:media',
        name: 'Read Media',
        description: 'Access media library',
        category: 'read',
      },
      {
        id: 'write:elements',
        name: 'Write Elements',
        description: 'Create, update, and delete elements',
        category: 'write',
      },
      {
        id: 'write:worldbuilding',
        name: 'Write Worldbuilding',
        description: 'Update worldbuilding data',
        category: 'write',
      },
      {
        id: 'write:schemas',
        name: 'Write Schemas',
        description: 'Create and update custom templates',
        category: 'write',
      },
      {
        id: 'write:media',
        name: 'Write Media',
        description: 'Upload media files',
        category: 'write',
      },
    ],
    presets: {
      readOnly: [
        'read:project',
        'read:elements',
        'read:documents',
        'read:worldbuilding',
        'read:schemas',
        'read:media',
      ],
      fullAccess: [
        'read:project',
        'read:elements',
        'read:documents',
        'read:worldbuilding',
        'read:schemas',
        'read:media',
        'write:elements',
        'write:worldbuilding',
        'write:schemas',
        'write:media',
      ],
      worldbuilding: [
        'read:project',
        'read:elements',
        'read:worldbuilding',
        'read:schemas',
        'write:worldbuilding',
      ],
    },
  });
});

export default mcpKeyRoutes;
