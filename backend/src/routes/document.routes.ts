import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const documentRoutes = new Hono();

// Schemas
const documentSchema = z.object({
  id: z.string().describe('Document ID'),
  name: z.string().describe('Document name'),
  type: z.string().describe('Document type'),
  createdAt: z.string().optional().describe('Creation timestamp'),
  updatedAt: z.string().optional().describe('Last update timestamp'),
});

const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// List all documents in a project
documentRoutes.get(
  '/:username/:slug/docs',
  describeRoute({
    description: 'List all documents in a project',
    tags: ['Documents'],
    responses: {
      200: {
        description: 'List of documents',
        content: {
          'application/json': {
            schema: resolver(z.array(documentSchema)),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(username, slug);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // For now, return empty array - full implementation would query elements
    // from the project's elements Yjs document
    return c.json([]);
  }
);

// Get document metadata
documentRoutes.get(
  '/:username/:slug/docs/:docId',
  describeRoute({
    description: 'Get document metadata',
    tags: ['Documents'],
    responses: {
      200: {
        description: 'Document metadata',
        content: {
          'application/json': {
            schema: resolver(documentSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      404: {
        description: 'Document not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const docId = c.req.param('docId');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(username, slug);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Return placeholder - full implementation would query the element from Yjs
    return c.json({
      id: docId,
      name: 'Document',
      type: 'ITEM',
    });
  }
);

// Render document as HTML
documentRoutes.get(
  '/:username/:slug/docs/:docId/html',
  describeRoute({
    description: 'Render document as HTML',
    tags: ['Documents'],
    responses: {
      200: {
        description: 'Rendered HTML content',
        content: {
          'text/html': {
            schema: {
              type: 'string',
            },
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      404: {
        description: 'Document not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const docId = c.req.param('docId');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(username, slug);

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
  }
);

export default documentRoutes;
