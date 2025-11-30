import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { getStorageService } from '../services/storage.service';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const fileRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all file routes
fileRoutes.use('*', requireAuth);

// Schemas
const FileSchema = z
  .object({
    name: z.string().openapi({ example: 'document.pdf', description: 'File name' }),
    size: z.number().optional().openapi({ example: 1024, description: 'File size in bytes' }),
    uploadDate: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Upload timestamp' }),
  })
  .openapi('ProjectFile');

const UploadResponseSchema = z
  .object({
    name: z.string().openapi({ example: 'document.pdf', description: 'Uploaded file name' }),
    size: z.number().openapi({ example: 1024, description: 'File size in bytes' }),
    uploadDate: z
      .string()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Upload timestamp' }),
  })
  .openapi('UploadResponse');

const DeleteResponseSchema = z
  .object({
    message: z
      .string()
      .openapi({ example: 'File deleted successfully', description: 'Success message' }),
  })
  .openapi('DeleteResponse');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('FileError');

// List files route
const listFilesRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/files',
  operationId: 'listProjectFiles',
  tags: ['Files'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(FileSchema),
        },
      },
      description: 'List of files',
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
      description: 'Internal server error',
    },
  },
});

fileRoutes.openapi(listFilesRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const files = await storage.listProjectFiles(username, slug);
    return c.json(
      files.map((name) => ({
        name,
      })),
      200
    );
  } catch {
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

// Download file route
const downloadFileRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/files/:storedName',
  operationId: 'downloadProjectFile',
  tags: ['Files'],
  request: {
    params: ProjectPathParamsSchema.extend({
      storedName: z.string().openapi({ example: 'document.pdf', description: 'File name' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      description: 'File content',
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
      description: 'File not found',
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

fileRoutes.openapi(downloadFileRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const storedName = c.req.param('storedName');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const fileExists = await storage.projectFileExists(username, slug, storedName);
    if (!fileExists) {
      return c.json({ error: 'File not found' }, 404);
    }

    const data = await storage.readProjectFile(username, slug, storedName);
    if (!data) {
      return c.json({ error: 'File not found' }, 404);
    }

    const uint8Array = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);

    return c.body(uint8Array, 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${storedName}"`,
      'Content-Length': uint8Array.length.toString(),
    });
  } catch {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

// Upload file route
const uploadFileRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/files',
  operationId: 'uploadProjectFile',
  tags: ['Files'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UploadResponseSchema,
        },
      },
      description: 'File uploaded successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'No file provided',
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
      description: 'Internal server error',
    },
  },
});

fileRoutes.openapi(uploadFileRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');

    if (!fileEntry || typeof fileEntry === 'string') {
      return c.json({ error: 'No file provided' }, 400);
    }

    const file = fileEntry as File;
    const buffer = await file.arrayBuffer();
    const fileName = file.name;

    await storage.saveProjectFile(username, slug, fileName, buffer);

    return c.json(
      {
        name: fileName,
        size: buffer.byteLength,
        uploadDate: new Date().toISOString(),
      },
      200
    );
  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

// Delete file route
const deleteFileRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/files/:storedName',
  operationId: 'deleteProjectFile',
  tags: ['Files'],
  request: {
    params: ProjectPathParamsSchema.extend({
      storedName: z.string().openapi({ example: 'document.pdf', description: 'File name' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DeleteResponseSchema,
        },
      },
      description: 'File deleted successfully',
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
      description: 'File or project not found',
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

fileRoutes.openapi(deleteFileRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const storedName = c.req.param('storedName');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const fileExists = await storage.projectFileExists(username, slug, storedName);
    if (!fileExists) {
      return c.json({ error: 'File not found' }, 404);
    }

    await storage.deleteProjectFile(username, slug, storedName);

    return c.json({ message: 'File deleted successfully' }, 200);
  } catch (error) {
    console.error('File delete error:', error);
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

export default fileRoutes;
