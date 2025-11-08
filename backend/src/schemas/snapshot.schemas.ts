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
    name: z.string().openapi({ example: 'Chapter 1 Draft' }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'First draft of chapter 1' }),
    wordCount: z.number().nullable().optional().openapi({ example: 1250 }),
    metadata: z
      .record(z.any())
      .nullable()
      .optional()
      .openapi({ example: { version: 1 } }),
    createdAt: z.string().datetime().openapi({ example: '2023-01-01T00:00:00.000Z' }),
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
      .max(255)
      .openapi({ example: 'Chapter 1 Draft', description: 'Snapshot name' }),
    description: z
      .string()
      .max(1000)
      .optional()
      .openapi({ example: 'First draft of chapter 1', description: 'Snapshot description' }),
    yDocState: z
      .string()
      .openapi({ example: 'base64encodedstate...', description: 'Base64 encoded Yjs document state' }),
    stateVector: z
      .string()
      .optional()
      .openapi({ example: 'base64vector...', description: 'Base64 encoded state vector' }),
    wordCount: z.number().optional().openapi({ example: 1250, description: 'Word count' }),
    metadata: z
      .record(z.any())
      .optional()
      .openapi({ example: { version: 1 }, description: 'Additional metadata' }),
  })
  .openapi({ ref: 'CreateSnapshotRequest' });

/**
 * Snapshots list response
 * @component SnapshotsListResponse
 */
export const SnapshotsListResponseSchema = z
  .array(DocumentSnapshotSchema)
  .openapi({ ref: 'SnapshotsListResponse' });

/**
 * Snapshot with content response (includes full Yjs state)
 * @component SnapshotWithContent
 */
export const SnapshotWithContentSchema = z
  .object({
    id: z.string().openapi({ example: 'snap-123' }),
    documentId: z.string().openapi({ example: 'doc-456' }),
    name: z.string().openapi({ example: 'Chapter 1 Draft' }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'First draft of chapter 1' }),
    wordCount: z.number().nullable().optional().openapi({ example: 1250 }),
    metadata: z
      .record(z.any())
      .nullable()
      .optional()
      .openapi({ example: { version: 1 } }),
    createdAt: z.string().datetime().openapi({ example: '2023-01-01T00:00:00.000Z' }),
    yDocState: z.string().openapi({ example: 'base64encodedstate...' }),
    stateVector: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: 'base64vector...' }),
  })
  .openapi({ ref: 'SnapshotWithContent' });
