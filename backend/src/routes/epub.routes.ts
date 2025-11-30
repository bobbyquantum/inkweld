import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const epubRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all epub routes
epubRoutes.use('*', requireAuth);

// Schemas
const EpubResponseSchema = z
  .object({
    originalName: z.string().openapi({ example: 'project.epub', description: 'Original filename' }),
    storedName: z.string().openapi({ example: 'project-123.epub', description: 'Stored filename' }),
    contentType: z.string().openapi({ example: 'application/epub+zip', description: 'MIME type' }),
    size: z.number().openapi({ example: 102400, description: 'File size in bytes' }),
    uploadDate: z
      .string()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' }),
  })
  .openapi('EpubResponse');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('EpubError');

// Export project as EPUB
const exportEpubRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/epub',
  tags: ['Export'],
  operationId: 'exportProjectAsEpub',
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: EpubResponseSchema,
        },
      },
      description: 'EPUB export metadata',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not authenticated',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Project not found',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Export failed',
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not implemented',
    },
  },
});

epubRoutes.openapi(exportEpubRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  // Verify project exists
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Placeholder - full implementation would:
  // 1. Load project elements from Yjs
  // 2. Load document content from LevelDB
  // 3. Use @smoores/epub to generate EPUB file
  // 4. Save to file storage
  // 5. Return metadata
  return c.json(
    {
      error: 'EPUB export not yet implemented in Hono backend',
    },
    501
  );
});

export default epubRoutes;
