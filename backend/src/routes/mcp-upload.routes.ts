/**
 * Media uploads for MCP agents: the URLs `create_media_upload` hands out.
 *
 * The token in the path is the only credential, because the caller is an
 * agent's HTTP tool rather than its MCP session. It names one new file, and
 * everything it was issued against is checked again here, so revoking the
 * session or the collaborator's access stops a URL that has not been used yet.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { lookup } from 'mime-types';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../errors';
import { mintDoJwt } from '../mcp/mcp.auth';
import { mcpUnavailableReason } from '../mcp/mcp-availability';
import { MCP_PERMISSIONS } from '../mcp/mcp-permissions';
import { verifyMediaUploadToken } from '../mcp/media-upload-token';
import { ErrorResponseSchema, QuotaExceededSchema } from '../schemas/common.schemas';
import { collaborationService } from '../services/collaboration.service';
import { sniffImageType } from '../services/image.service';
import { mcpOAuthService } from '../services/mcp-oauth.service';
import { projectService } from '../services/project.service';
import { quotaService } from '../services/quota.service';
import { getStorageService } from '../services/storage.service';
import { userService } from '../services/user.service';
import type { AppContext, DatabaseInstance } from '../types/context';
import { MAX_MEDIA_UPLOAD_BYTES, rejectEmptyUpload } from '../utils/upload';

const mcpUploadRoutes = new OpenAPIHono<AppContext>();

// Reject empty uploads (400) and oversized ones (413) before the body is read.
mcpUploadRoutes.use('/:token', rejectEmptyUpload, bodyLimit({ maxSize: MAX_MEDIA_UPLOAD_BYTES }));

const uploadRoute = createRoute({
  method: 'put',
  path: '/:token',
  operationId: 'uploadMcpMedia',
  // The token in the path is the only credential, so opt out of the global
  // bearerAuth requirement: the caller is an agent with a plain HTTP client.
  security: [],
  tags: ['MCP'],
  summary: 'Upload an image through a create_media_upload URL',
  description:
    'Stores the request body as the one image file the token names. The token comes from the ' +
    'create_media_upload MCP tool, works once and expires after a few minutes.',
  request: {
    params: z.object({
      token: z.string().openapi({ description: 'The token from create_media_upload' }),
    }),
    body: {
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              mediaUrl: z.string().openapi({ example: 'media://img-abc.png' }),
              size: z.number().openapi({ description: 'Bytes stored' }),
              mimeType: z.string().openapi({ example: 'image/png' }),
            })
            .openapi('McpMediaUploadResponse'),
        },
      },
      description: 'File stored',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Empty, not a supported image, or not the format the upload was created for',
    },
    401: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'The URL is invalid or has expired, or its session was revoked',
    },
    403: {
      content: {
        'application/json': { schema: z.union([ErrorResponseSchema, QuotaExceededSchema]) },
      },
      description: 'MCP is disabled, access was withdrawn, or sync capacity is exceeded',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Project not found',
    },
    409: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'This URL has already been used',
    },
    413: { description: 'File too large' },
  },
});

/**
 * Whether this user can still sign in, and a session still grants them write
 * access to the project. Disabling an account does not revoke its sessions, and
 * the owner of a project always has access to it.
 */
async function canStillWrite(
  db: DatabaseInstance,
  sessionId: string,
  userId: string,
  projectId: string
): Promise<boolean> {
  const user = await userService.findById(db, userId);
  if (!user || !userService.canLogin(user)) return false;
  const access = await collaborationService.checkAccess(db, projectId, userId);
  if (!access.canWrite) return false;
  const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
  return grants.some(
    (grant) =>
      grant.projectId === projectId && grant.permissions.includes(MCP_PERMISSIONS.WRITE_ELEMENTS)
  );
}

mcpUploadRoutes.openapi(uploadRoute, async (c) => {
  const db = c.get('db');
  const env = c.env as Record<string, unknown> | undefined;

  const unavailable = await mcpUnavailableReason(db);
  if (unavailable) throw new ForbiddenError(unavailable);

  const claims = await verifyMediaUploadToken(c.req.param('token'), env);
  if (!claims || (await mcpOAuthService.isSessionRevoked(db, claims.sessionId))) {
    throw new UnauthorizedError(
      'This upload URL is invalid or has expired. Call create_media_upload for a new one.'
    );
  }
  const { owner, slug, filename, userId, username, sessionId, projectId } = claims;

  // By owner and slug as well as id: a renamed project's files live elsewhere.
  const project = await projectService.findByUsernameAndSlug(db, owner, slug);
  if (project?.id !== projectId) throw new NotFoundError('Project not found');
  if (!(await canStillWrite(db, sessionId, userId, projectId))) {
    throw new ForbiddenError('Access denied');
  }

  const data = new Uint8Array(await c.req.arrayBuffer());
  const mimeType = sniffImageType(Buffer.from(data));
  if (!mimeType) {
    throw new BadRequestError('The file is not a PNG, JPEG, WebP or GIF image.');
  }
  if (mimeType !== lookup(filename)) {
    throw new BadRequestError(
      `The file is ${mimeType}, but this upload was created for ${String(lookup(filename))}.`
    );
  }

  const storage = getStorageService(c.get('storage'));
  if (await storage.projectFileExists(owner, slug, filename)) {
    return c.json({ error: 'This upload URL has already been used.' }, 409);
  }

  await quotaService.assertCanStore(db, project.userId, data.byteLength, 'media_upload', {
    r2: c.get('storage'),
    env: env as never,
    // The size endpoint of the Durable Object wants the caller's token, and
    // this caller has no session of its own.
    authToken: await mintDoJwt(username, userId, env),
  });
  await storage.saveProjectFile(owner, slug, filename, data, mimeType);

  return c.json({ mediaUrl: `media://${filename}`, size: data.byteLength, mimeType }, 200);
});

export default mcpUploadRoutes;
