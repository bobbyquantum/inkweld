import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { commentService } from '../services/comment.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';
import { type AppContext } from '../types/context';
import {
  CommentThreadSchema,
  CommentThreadSummarySchema,
  CommentMessageSchema,
  CreateCommentThreadRequestSchema,
  AddCommentMessageRequestSchema,
  UnreadCountSchema,
  MarkCommentsSeenRequestSchema,
} from '../schemas/comment.schemas';
import {
  errorResponses,
  MessageResponseSchema,
  ProjectPathParamsSchema,
} from '../schemas/common.schemas';

const commentRoutes = new OpenAPIHono<AppContext>();

commentRoutes.use('*', requireAuth);

/** Helper: resolve project and check at least read access */
async function resolveProjectAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  username: string,
  slug: string,
  userId: string
) {
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) throw new NotFoundError('Project not found');
  if (project.userId !== userId) {
    const access = await collaborationService.checkAccess(db, project.id, userId);
    if (!access.canRead) throw new ForbiddenError();
    return { project, canWrite: access.canWrite };
  }
  return { project, canWrite: true };
}

function toIsoOrNull(ts: number | null | undefined): string | null {
  return ts ? new Date(ts).toISOString() : null;
}

// ────────────────────────────────────────────────────────────
// List threads for a project (summaries)
// ────────────────────────────────────────────────────────────
const listProjectCommentsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug',
  tags: ['Comments'],
  operationId: 'listProjectComments',
  request: { params: ProjectPathParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(CommentThreadSummarySchema) } },
      description: 'List of comment thread summaries',
    },
    ...errorResponses.authEntity('Project'),
  },
});

commentRoutes.openapi(listProjectCommentsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  const threads = await commentService.listByProjectId(db, project.id);

  return c.json(
    threads.map((t) => ({
      ...t,
      createdAt: new Date(t.createdAt).toISOString(),
      updatedAt: new Date(t.updatedAt).toISOString(),
      resolvedAt: toIsoOrNull(t.resolvedAt),
    })),
    200
  );
});

// ────────────────────────────────────────────────────────────
// List threads for a document (with messages)
// ────────────────────────────────────────────────────────────
const listDocumentCommentsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/doc/:documentName',
  tags: ['Comments'],
  operationId: 'listDocumentComments',
  request: {
    params: ProjectPathParamsSchema.extend({
      documentName: z
        .string()
        .openapi({ description: 'Document name (last segment of Yjs documentId)' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(CommentThreadSchema) } },
      description: 'List of comment threads with messages',
    },
    ...errorResponses.authEntity('Project'),
  },
});

commentRoutes.openapi(listDocumentCommentsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const documentName = c.req.param('documentName');
  const { project } = await resolveProjectAccess(db, username, slug, user.id);

  const documentId = `${username}:${slug}:${documentName}`;
  const threads = await commentService.listByDocumentId(db, project.id, documentId);

  return c.json(
    threads.map((t) => ({
      ...t,
      createdAt: new Date(t.createdAt).toISOString(),
      updatedAt: new Date(t.updatedAt).toISOString(),
      resolvedAt: toIsoOrNull(t.resolvedAt),
      messages: t.messages.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt).toISOString(),
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
      })),
    })),
    200
  );
});

// ────────────────────────────────────────────────────────────
// Get a single thread
// ────────────────────────────────────────────────────────────
const getThreadRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/threads/:threadId',
  tags: ['Comments'],
  operationId: 'getCommentThread',
  request: {
    params: ProjectPathParamsSchema.extend({
      threadId: z.string().openapi({ description: 'Comment thread ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: CommentThreadSchema } },
      description: 'Comment thread with messages',
    },
    ...errorResponses.authEntity('Thread'),
  },
});

commentRoutes.openapi(getThreadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  const thread = await commentService.getThread(db, c.req.param('threadId'));

  if (thread?.projectId !== project.id) throw new NotFoundError('Thread not found');

  return c.json(
    {
      ...thread,
      createdAt: new Date(thread.createdAt).toISOString(),
      updatedAt: new Date(thread.updatedAt).toISOString(),
      resolvedAt: toIsoOrNull(thread.resolvedAt),
      messages: thread.messages.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt).toISOString(),
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
      })),
    },
    200
  );
});

// ────────────────────────────────────────────────────────────
// Create a comment thread
// ────────────────────────────────────────────────────────────
const createThreadRoute = createRoute({
  method: 'post',
  path: '/:username/:slug',
  tags: ['Comments'],
  operationId: 'createCommentThread',
  request: {
    params: ProjectPathParamsSchema,
    body: { content: { 'application/json': { schema: CreateCommentThreadRequestSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: CommentThreadSchema } },
      description: 'Comment thread created',
    },
    ...errorResponses.badRequest,
    ...errorResponses.authEntity('Project'),
  },
});

commentRoutes.openapi(createThreadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project, canWrite } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  if (!canWrite) throw new ForbiddenError();

  const body = await c.req.json();
  const data = CreateCommentThreadRequestSchema.parse(body);

  const thread = await commentService.createThread(db, {
    id: data.id,
    documentId: data.documentId,
    projectId: project.id,
    authorId: user.id,
    text: data.text,
  });

  return c.json(
    {
      ...thread,
      createdAt: new Date(thread.createdAt).toISOString(),
      updatedAt: new Date(thread.updatedAt).toISOString(),
      resolvedAt: toIsoOrNull(thread.resolvedAt),
      messages: thread.messages.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt).toISOString(),
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
      })),
    },
    201
  );
});

// ────────────────────────────────────────────────────────────
// Add a message (reply) to a thread
// ────────────────────────────────────────────────────────────
const addMessageRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/threads/:threadId/messages',
  tags: ['Comments'],
  operationId: 'addCommentMessage',
  request: {
    params: ProjectPathParamsSchema.extend({
      threadId: z.string().openapi({ description: 'Comment thread ID' }),
    }),
    body: { content: { 'application/json': { schema: AddCommentMessageRequestSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: CommentMessageSchema } },
      description: 'Message added',
    },
    ...errorResponses.authEntity('Thread'),
  },
});

commentRoutes.openapi(addMessageRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project, canWrite } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  if (!canWrite) throw new ForbiddenError();

  const threadId = c.req.param('threadId');
  const thread = await commentService.findById(db, threadId);
  if (thread?.projectId !== project.id) throw new NotFoundError('Thread not found');

  const body = await c.req.json();
  const data = AddCommentMessageRequestSchema.parse(body);

  const message = await commentService.addMessage(db, {
    threadId,
    authorId: user.id,
    text: data.text,
  });

  return c.json(
    {
      ...message,
      createdAt: new Date(message.createdAt).toISOString(),
      editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null,
    },
    201
  );
});

// ────────────────────────────────────────────────────────────
// Resolve a thread
// ────────────────────────────────────────────────────────────
const resolveThreadRoute = createRoute({
  method: 'patch',
  path: '/:username/:slug/threads/:threadId/resolve',
  tags: ['Comments'],
  operationId: 'resolveCommentThread',
  request: {
    params: ProjectPathParamsSchema.extend({
      threadId: z.string().openapi({ description: 'Comment thread ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Thread resolved',
    },
    ...errorResponses.authEntity('Thread'),
  },
});

commentRoutes.openapi(resolveThreadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project, canWrite } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  if (!canWrite) throw new ForbiddenError();

  const threadId = c.req.param('threadId');
  const thread = await commentService.findById(db, threadId);
  if (thread?.projectId !== project.id) throw new NotFoundError('Thread not found');

  await commentService.resolve(db, threadId, user.id);
  return c.json({ message: 'Thread resolved' }, 200);
});

// ────────────────────────────────────────────────────────────
// Unresolve a thread
// ────────────────────────────────────────────────────────────
const unresolveThreadRoute = createRoute({
  method: 'patch',
  path: '/:username/:slug/threads/:threadId/unresolve',
  tags: ['Comments'],
  operationId: 'unresolveCommentThread',
  request: {
    params: ProjectPathParamsSchema.extend({
      threadId: z.string().openapi({ description: 'Comment thread ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Thread unresolved',
    },
    ...errorResponses.authEntity('Thread'),
  },
});

commentRoutes.openapi(unresolveThreadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project, canWrite } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  if (!canWrite) throw new ForbiddenError();

  const threadId = c.req.param('threadId');
  const thread = await commentService.findById(db, threadId);
  if (thread?.projectId !== project.id) throw new NotFoundError('Thread not found');

  await commentService.unresolve(db, threadId);
  return c.json({ message: 'Thread unresolved' }, 200);
});

// ────────────────────────────────────────────────────────────
// Delete a thread (author or admin only)
// ────────────────────────────────────────────────────────────
const deleteThreadRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/threads/:threadId',
  tags: ['Comments'],
  operationId: 'deleteCommentThread',
  request: {
    params: ProjectPathParamsSchema.extend({
      threadId: z.string().openapi({ description: 'Comment thread ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Thread deleted',
    },
    ...errorResponses.authEntity('Thread'),
  },
});

commentRoutes.openapi(deleteThreadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );

  const threadId = c.req.param('threadId');
  const thread = await commentService.findById(db, threadId);
  if (thread?.projectId !== project.id) throw new NotFoundError('Thread not found');

  // Only thread author or project owner can delete
  if (thread.authorId !== user.id && project.userId !== user.id) {
    throw new ForbiddenError();
  }

  await commentService.deleteThread(db, threadId);
  return c.json({ message: 'Thread deleted' }, 200);
});

// ────────────────────────────────────────────────────────────
// Delete a message (author only, deletes thread if last msg)
// ────────────────────────────────────────────────────────────
const deleteMessageRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/threads/:threadId/messages/:messageId',
  tags: ['Comments'],
  operationId: 'deleteCommentMessage',
  request: {
    params: ProjectPathParamsSchema.extend({
      threadId: z.string().openapi({ description: 'Comment thread ID' }),
      messageId: z.string().openapi({ description: 'Comment message ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ message: z.string(), threadDeleted: z.boolean() }),
        },
      },
      description: 'Message deleted',
    },
    ...errorResponses.authEntity('Message'),
  },
});

commentRoutes.openapi(deleteMessageRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );

  const threadId = c.req.param('threadId');
  const thread = await commentService.findById(db, threadId);
  if (thread?.projectId !== project.id) throw new NotFoundError('Thread not found');

  const messageId = c.req.param('messageId');
  const msg = await commentService.findMessageById(db, messageId);
  if (msg?.threadId !== threadId) throw new NotFoundError('Message not found');

  // Only message author or project owner can delete
  if (msg.authorId !== user.id && project.userId !== user.id) {
    throw new ForbiddenError();
  }

  const result = await commentService.deleteMessage(db, messageId);
  return c.json({ message: 'Message deleted', threadDeleted: result.threadDeleted }, 200);
});

// ────────────────────────────────────────────────────────────
// Get unread counts
// ────────────────────────────────────────────────────────────
const getUnreadCountsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/unread',
  tags: ['Comments'],
  operationId: 'getCommentUnreadCounts',
  request: { params: ProjectPathParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(UnreadCountSchema) } },
      description: 'Unread comment counts per document',
    },
    ...errorResponses.authEntity('Project'),
  },
});

commentRoutes.openapi(getUnreadCountsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { project } = await resolveProjectAccess(
    db,
    c.req.param('username'),
    c.req.param('slug'),
    user.id
  );
  const counts = await commentService.getUnreadCounts(db, project.id, user.id);
  return c.json(counts, 200);
});

// ────────────────────────────────────────────────────────────
// Mark comments as seen
// ────────────────────────────────────────────────────────────
const markSeenRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/seen',
  tags: ['Comments'],
  operationId: 'markCommentsSeen',
  request: {
    params: ProjectPathParamsSchema,
    body: { content: { 'application/json': { schema: MarkCommentsSeenRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Comments marked as seen',
    },
    ...errorResponses.authEntity('Project'),
  },
});

commentRoutes.openapi(markSeenRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  await resolveProjectAccess(db, c.req.param('username'), c.req.param('slug'), user.id);

  const body = await c.req.json();
  const data = MarkCommentsSeenRequestSchema.parse(body);

  await commentService.markSeen(db, user.id, data.documentId);
  return c.json({ message: 'Comments marked as seen' }, 200);
});

export { commentRoutes };
