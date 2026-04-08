/**
 * Comment OpenAPI schemas
 */
import { z } from '@hono/zod-openapi';

/**
 * A single message within a comment thread
 * @component CommentMessageResponse
 */
export const CommentMessageSchema = z
  .object({
    id: z.string(),
    threadId: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    text: z.string(),
    createdAt: z.iso.datetime(),
    editedAt: z.iso.datetime().nullable().optional(),
  })
  .openapi('CommentMessageResponse');

/**
 * A comment thread with all its messages
 * @component CommentThreadResponse
 */
export const CommentThreadSchema = z
  .object({
    id: z.string(),
    documentId: z.string(),
    projectId: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    resolved: z.boolean(),
    resolvedBy: z.string().nullable().optional(),
    resolvedAt: z.iso.datetime().nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    messages: z.array(CommentMessageSchema),
  })
  .openapi('CommentThreadResponse');

/**
 * Summary of a comment thread (no messages, used in project-wide lists)
 * @component CommentThreadSummary
 */
export const CommentThreadSummarySchema = z
  .object({
    id: z.string(),
    documentId: z.string(),
    projectId: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    resolved: z.boolean(),
    resolvedBy: z.string().nullable().optional(),
    resolvedAt: z.iso.datetime().nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    messageCount: z.number(),
  })
  .openapi('CommentThreadSummary');

/**
 * Create comment thread request
 * @component CreateCommentThreadRequest
 */
export const CreateCommentThreadRequestSchema = z
  .object({
    /** UUID for the thread, must match the ProseMirror mark commentId */
    id: z.uuid(),
    /** Yjs document ID, e.g. "username:slug:docName" */
    documentId: z.string().min(1),
    /** Initial comment text */
    text: z.string().min(1).max(5000),
  })
  .openapi('CreateCommentThreadRequest');

/**
 * Add reply to a thread
 * @component AddCommentMessageRequest
 */
export const AddCommentMessageRequestSchema = z
  .object({
    text: z.string().min(1).max(5000),
  })
  .openapi('AddCommentMessageRequest');

/**
 * Unread count per document
 * @component UnreadCount
 */
export const UnreadCountSchema = z
  .object({
    documentId: z.string(),
    count: z.number(),
  })
  .openapi('UnreadCount');

/**
 * Mark comments as seen request
 * @component MarkCommentsSeenRequest
 */
export const MarkCommentsSeenRequestSchema = z
  .object({
    documentId: z.string().min(1),
  })
  .openapi('MarkCommentsSeenRequest');
