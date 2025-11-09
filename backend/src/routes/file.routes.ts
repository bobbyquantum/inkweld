import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { fileStorageService } from '../services/file-storage.service';
import { getDb, type AppContext } from '../middleware/database.middleware';

const fileRoutes = new Hono<AppContext>();

// Schemas
const fileSchema = z.object({
  name: z.string().describe('File name'),
  size: z.number().optional().describe('File size in bytes'),
  uploadDate: z.string().optional().describe('Upload timestamp'),
});

const uploadResponseSchema = z.object({
  name: z.string().describe('Uploaded file name'),
  size: z.number().describe('File size in bytes'),
  uploadDate: z.string().describe('Upload timestamp'),
});

const deleteResponseSchema = z.object({
  message: z.string().describe('Success message'),
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
    const db = getDb(c);
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

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
    } catch {
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
    const db = getDb(c);
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const storedName = c.req.param('storedName');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

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
    } catch {
      return c.json({ error: 'Failed to read file' }, 500);
    }
  }
);

// Upload file
fileRoutes.post(
  '/:username/:slug/files',
  describeRoute({
    description: 'Upload a file to the project',
    tags: ['Files'],
    responses: {
      200: {
        description: 'File uploaded successfully',
        content: {
          'application/json': {
            schema: resolver(uploadResponseSchema),
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
    const db = getDb(c);
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    try {
      const formData = await c.req.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return c.json({ error: 'No file provided' }, 400);
      }

      const buffer = await file.arrayBuffer();
      const fileName = file.name;

      await fileStorageService.writeProjectFile(username, slug, fileName, Buffer.from(buffer));

      return c.json({
        name: fileName,
        size: buffer.byteLength,
        uploadDate: new Date().toISOString(),
      });
    } catch (error) {
      console.error('File upload error:', error);
      return c.json({ error: 'Failed to upload file' }, 500);
    }
  }
);

// Delete file
fileRoutes.delete(
  '/:username/:slug/files/:storedName',
  describeRoute({
    description: 'Delete a file from the project',
    tags: ['Files'],
    responses: {
      200: {
        description: 'File deleted successfully',
        content: {
          'application/json': {
            schema: resolver(deleteResponseSchema),
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
        description: 'File or project not found',
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
    const db = getDb(c);
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const storedName = c.req.param('storedName');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    try {
      const fileExists = await fileStorageService.projectFileExists(username, slug, storedName);
      if (!fileExists) {
        return c.json({ error: 'File not found' }, 404);
      }

      await fileStorageService.deleteProjectFile(username, slug, storedName);

      return c.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('File delete error:', error);
      return c.json({ error: 'Failed to delete file' }, 500);
    }
  }
);

export default fileRoutes;
