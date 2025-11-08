/**
 * Document snapshot OpenAPI schemas
 */
import { z } from 'zod';
import 'zod-openapi/extend';

/**
 * Document snapshot information
 * @component DocumentSnapshot
 */
export const DocumentSnapshotSchema = z
  .object({
    id: z.string().openapi({ example: 'snap-123' }),
    documentId: z.string().openapi({ example: 'doc-456' }),
    projectId: z.string().openapi({ example: 'proj-789' }),
    name: z.string().openapi({ example: 'Chapter 1 Draft' }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'First draft of chapter 1' }),
    createdDate: z.string().datetime().openapi({ example: '2023-01-01T00:00:00.000Z' }),
    yjsStateVector: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'base64encodedstate...' }),
  })
  .openapi({ ref: 'DocumentSnapshot' });

/**
 * Create snapshot request
 * @component CreateSnapshotRequest
 */
export const CreateSnapshotRequestSchema = z
  .object({
    documentId: z.string().openapi({ example: 'doc-456', description: 'Document ID' }),
    name: z
      .string()
      .min(1)
      .openapi({ example: 'Chapter 1 Draft', description: 'Snapshot name' }),
    description: z
      .string()
      .optional()
      .openapi({ example: 'First draft of chapter 1', description: 'Snapshot description' }),
  })
  .openapi({ ref: 'CreateSnapshotRequest' });

/**
 * Snapshots list response
 * @component SnapshotsListResponse
 */
export const SnapshotsListResponseSchema = z
  .object({
    snapshots: z.array(DocumentSnapshotSchema),
    total: z.number().openapi({ example: 5 }),
  })
  .openapi({ ref: 'SnapshotsListResponse' });

/**
 * Snapshot with content response
 * @component SnapshotWithContent
 */
export const SnapshotWithContentSchema = z
  .object({
    id: z.string().openapi({ example: 'snap-123' }),
    documentId: z.string().openapi({ example: 'doc-456' }),
    projectId: z.string().openapi({ example: 'proj-789' }),
    name: z.string().openapi({ example: 'Chapter 1 Draft' }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'First draft of chapter 1' }),
    createdDate: z.string().datetime().openapi({ example: '2023-01-01T00:00:00.000Z' }),
    yjsStateVector: z.string().openapi({ example: 'base64encodedstate...' }),
    content: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'Chapter content...' }),
  })
  .openapi({ ref: 'SnapshotWithContent' });
