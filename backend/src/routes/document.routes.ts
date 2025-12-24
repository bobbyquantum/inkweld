import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { yjsService } from '../services/yjs.service';
import { requireAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const documentRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all document routes
documentRoutes.use('*', requireAuth);

// Schemas
const DocumentSchema = z
  .object({
    id: z.string().openapi({ example: 'doc-123', description: 'Document ID' }),
    name: z.string().openapi({ example: 'Chapter 1', description: 'Document name' }),
    type: z.string().openapi({ example: 'ITEM', description: 'Document type' }),
    createdAt: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' }),
    updatedAt: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' }),
  })
  .openapi('Document');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('DocumentError');

// List all documents in a project
const listDocsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/docs',
  operationId: 'listProjectDocuments',
  tags: ['Documents'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(DocumentSchema),
        },
      },
      description: 'List of documents',
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
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Unauthorized access',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

documentRoutes.openapi(listDocsRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  // Verify project exists
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Check access
  const user = c.get('user');
  if (!user || project.userId !== user.id) {
    // TODO: Check collaborator access when implemented
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Get elements from Yjs document and filter for items (documents)
  try {
    const elements = await yjsService.getElements(username, slug);
    const documents = elements.filter((e) => e.type === 'ITEM');
    return c.json(documents, 200);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return c.json({ error: 'Failed to fetch documents' }, 500);
  }
});

// Get document metadata
const getDocRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/docs/:docId',
  operationId: 'getProjectDocument',
  tags: ['Documents'],
  request: {
    params: ProjectPathParamsSchema.extend({
      docId: z.string().openapi({ example: 'doc-123', description: 'Document ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DocumentSchema,
        },
      },
      description: 'Document metadata',
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
      description: 'Document not found',
    },
  },
});

documentRoutes.openapi(getDocRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const docId = c.req.param('docId');

  // Verify project exists
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Return placeholder - full implementation would query the element from Yjs
  return c.json(
    {
      id: docId,
      name: 'Document',
      type: 'ITEM',
    },
    200
  );
});

// Render document as HTML
const renderHtmlRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/docs/:docId/html',
  tags: ['Documents'],
  operationId: 'renderDocumentAsHtml',
  request: {
    params: ProjectPathParamsSchema.extend({
      docId: z.string().openapi({ description: 'Document ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'text/html': {
          schema: {
            type: 'string',
          },
        },
      },
      description: 'Rendered HTML content',
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
      description: 'Document not found',
    },
  },
});

documentRoutes.openapi(renderHtmlRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const docId = c.req.param('docId');

  // Verify project exists
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Placeholder HTML rendering
  // Full implementation would load from LevelDB and render ProseMirror content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Document: ${docId}</h1>
  <p>HTML rendering not yet implemented in Hono backend.</p>
  <p>Project: ${username}/${slug}</p>
</body>
</html>
`;

  return c.html(html);
});

export default documentRoutes;
