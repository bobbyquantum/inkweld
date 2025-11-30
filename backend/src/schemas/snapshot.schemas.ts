/**
 * Document snapshot OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';

/**
 * Document snapshot information
 * @component DocumentSnapshot
 */
export const DocumentSnapshotSchema = z
  .object({
    id: z.string(),
    documentId: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    wordCount: z.number().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .openapi('DocumentSnapshot');

/**
 * Create snapshot request
 * @component CreateSnapshotRequest
 */
export const CreateSnapshotRequestSchema = z
  .object({
    documentId: z.string(),
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    yDocState: z.string(),
    stateVector: z.string().optional(),
    wordCount: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('CreateSnapshotRequest');

/**
 * Snapshots list response
 * @component SnapshotsListResponse
 */
export const SnapshotsListResponseSchema = z
  .array(DocumentSnapshotSchema)
  .openapi('SnapshotsListResponse');

/**
 * Snapshot with content response (includes full Yjs state)
 * @component SnapshotWithContent
 */
export const SnapshotWithContentSchema = z
  .object({
    id: z.string(),
    documentId: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    wordCount: z.number().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: z.string().datetime(),
    yDocState: z.string(),
    stateVector: z.string().nullable().optional(),
  })
  .openapi('SnapshotWithContent');
