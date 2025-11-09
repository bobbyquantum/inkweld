import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { fileStorageService } from '../services/file-storage.service';

const fileRoutes = new Hono();

// Schemas
const fileSchema = z.object({
  name: z.string().describe('File name'),
  size: z.number().optional().describe('File size in bytes'),
  uploadDate: z.string().optional().describe('Upload timestamp'),
});

const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// List files in project
fileRoutes.get(
  '/:username/:slug/files',
  describeRoute({
    description: 'List all files in a project',
    tags: ['Files'],
    responses: {
      200: {
        description: 'List of files',
        content: {
          'application/json': {
            schema: resolver(z.array(fileSchema)),
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

    try {
      const files = await fileStorageService.listProjectFiles(username, slug);
      return c.json(
        files.map((name) => ({
          name,
        }))
      );
    } catch (error) {
      return c.json({ error: 'Failed to list files' }, 500);
    }
  }
);

// Download file
fileRoutes.get(
  '/:username/:slug/files/:storedName',
  describeRoute({
    description: 'Download a file from the project',
    tags: ['Files'],
    responses: {
      200: {
        description: 'File content',
        content: {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
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
        description: 'File not found',
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
    const storedName = c.req.param('storedName');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(username, slug);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    try {
      const fileExists = await fileStorageService.projectFileExists(username, slug, storedName);
      if (!fileExists) {
        return c.json({ error: 'File not found' }, 404);
      }

      const buffer = await fileStorageService.readProjectFile(username, slug, storedName);
      const uint8Array = new Uint8Array(buffer);

      return c.body(uint8Array, 200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${storedName}"`,
        'Content-Length': buffer.length.toString(),
      });
    } catch (error) {
      return c.json({ error: 'Failed to read file' }, 500);
    }
  }
);

export default fileRoutes;
