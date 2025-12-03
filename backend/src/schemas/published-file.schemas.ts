import { z } from '@hono/zod-openapi';

/**
 * Share permission enum
 */
export const SharePermissionSchema = z
  .enum(['private', 'collaborators', 'link', 'public'])
  .openapi({ example: 'private', description: 'Sharing permission level' });

/**
 * Published file metadata
 */
export const PublishedFileMetadataSchema = z.object({
  title: z.string().openapi({ example: 'My Novel', description: 'Title at time of publishing' }),
  author: z.string().openapi({ example: 'John Doe', description: 'Author at time of publishing' }),
  subtitle: z
    .string()
    .nullable()
    .openapi({ example: 'A Story', description: 'Subtitle at time of publishing' }),
  language: z
    .string()
    .nullable()
    .openapi({ example: 'en', description: 'Language at time of publishing' }),
  itemCount: z.number().openapi({ example: 12, description: 'Number of content items included' }),
  wordCount: z
    .number()
    .nullable()
    .openapi({ example: 50000, description: 'Word count if available' }),
});

/**
 * Published file response schema
 */
export const PublishedFileSchema = z
  .object({
    id: z.string().openapi({ example: 'abc-123', description: 'Unique identifier' }),
    projectId: z.string().openapi({ example: 'proj-456', description: 'Project ID' }),
    filename: z.string().openapi({ example: 'my-novel.epub', description: 'Original filename' }),
    format: z
      .string()
      .openapi({ example: 'EPUB', description: 'File format: EPUB, PDF_SIMPLE, HTML, MARKDOWN' }),
    mimeType: z.string().openapi({ example: 'application/epub+zip', description: 'MIME type' }),
    size: z.number().openapi({ example: 102400, description: 'File size in bytes' }),
    planName: z.string().openapi({ example: 'Full Export', description: 'Publish plan name' }),
    sharePermission: SharePermissionSchema,
    shareToken: z
      .string()
      .nullable()
      .openapi({ example: 'abc123xyz', description: 'Share token for link-based sharing' }),
    createdAt: z.string().openapi({
      example: '2024-01-01T00:00:00.000Z',
      description: 'Creation timestamp',
    }),
    updatedAt: z.string().openapi({
      example: '2024-01-01T00:00:00.000Z',
      description: 'Last modified timestamp',
    }),
    metadata: PublishedFileMetadataSchema,
  })
  .openapi('PublishedFile');

/**
 * Create published file request schema
 */
export const CreatePublishedFileRequestSchema = z
  .object({
    filename: z.string().min(1).openapi({ example: 'my-novel.epub', description: 'Filename' }),
    format: z.string().openapi({ example: 'EPUB', description: 'File format' }),
    mimeType: z.string().openapi({ example: 'application/epub+zip', description: 'MIME type' }),
    planName: z.string().openapi({ example: 'Full Export', description: 'Publish plan name' }),
    sharePermission: SharePermissionSchema.optional().default('private'),
    metadata: PublishedFileMetadataSchema,
  })
  .openapi('CreatePublishedFileRequest');

/**
 * Update published file request schema
 */
export const UpdatePublishedFileRequestSchema = z
  .object({
    sharePermission: SharePermissionSchema.optional(),
    filename: z.string().min(1).optional().openapi({ description: 'New filename' }),
  })
  .openapi('UpdatePublishedFileRequest');

/**
 * Share link response schema
 */
export const ShareLinkResponseSchema = z
  .object({
    shareToken: z.string().openapi({ example: 'abc123xyz', description: 'Share token' }),
    shareUrl: z.string().url().openapi({
      example: 'https://inkweld.app/share/abc123xyz',
      description: 'Full share URL',
    }),
    expiresAt: z.string().optional().openapi({ description: 'Expiration timestamp if applicable' }),
  })
  .openapi('ShareLinkResponse');

/**
 * Published file error schema
 */
export const PublishedFileErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'File not found', description: 'Error message' }),
  })
  .openapi('PublishedFileError');

/**
 * Published file ID path parameter schema
 */
export const PublishedFileIdParamSchema = z.object({
  fileId: z.string().openapi({ example: 'abc-123', description: 'Published file ID' }),
});
