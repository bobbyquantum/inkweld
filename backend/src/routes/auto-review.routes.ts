/**
 * Auto-review routes — server-side document linting via Yjs mark insertion.
 *
 * These endpoints load the Yjs document, run the OpenAI-compatible LLM
 * on each paragraph, and surgically apply `auto_review` marks back onto
 * the Y.XmlText nodes. Changes sync to all connected clients via the
 * existing Yjs update listener.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { autoReviewService } from '../services/auto-review.service';
import { autoReviewRejectionService } from '../services/auto-review-rejection.service';
import { openAILintService } from '../services/openai-lint.service';
import { requireAuth } from '../middleware/auth';
import { logger } from '../services/logger.service';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const lintReviewLog = logger.child('AutoReview');
const lintReviewRoutes = new OpenAPIHono<AppContext>();

lintReviewRoutes.use('*', requireAuth);

// Schemas

const ReviewRequestSchema = z
  .object({
    style: z.string().default('general').openapi({
      example: 'academic',
      description: 'The writing style to check against',
    }),
    level: z
      .enum(['low', 'medium', 'high'])
      .default('medium')
      .openapi({ example: 'medium', description: 'Level of linting strictness' }),
  })
  .openapi('AutoReviewRequest');

const SuggestionSchema = z
  .object({
    id: z.string().openapi({ example: '0-5-abc123', description: 'Unique suggestion ID' }),
    message: z
      .string()
      .openapi({ example: 'Consider using active voice', description: 'Explanation' }),
    suggestion: z
      .string()
      .openapi({ example: 'The cat sat', description: 'Suggested replacement' }),
    category: z.string().openapi({ example: 'grammar', description: 'Error category' }),
    severity: z
      .enum(['error', 'warning', 'suggestion'])
      .openapi({ example: 'suggestion', description: 'Severity level' }),
    paragraphStart: z.number().openapi({ description: 'Start offset in paragraph' }),
    paragraphEnd: z.number().openapi({ description: 'End offset in paragraph' }),
    originalText: z.string().openapi({ description: 'Original text with the issue' }),
  })
  .openapi('AutoReviewSuggestion');

const ReviewResponseSchema = z
  .object({
    suggestions: z.array(SuggestionSchema).openapi({ description: 'Lint suggestions' }),
    clearedMarks: z.number().openapi({ description: 'Number of existing marks that were cleared' }),
  })
  .openapi('AutoReviewResponse');

const SimpleResultSchema = z
  .object({
    success: z.boolean().openapi({ description: 'Whether the operation succeeded' }),
  })
  .openapi('AutoReviewResult');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('AutoReviewError');

const DocParamsSchema = ProjectPathParamsSchema.extend({
  docId: z.string().openapi({ description: 'Document element ID' }),
});

// POST /:username/:slug/docs/:docId/auto-review/review — run a auto-review
const reviewRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/docs/:docId/auto-review/review',
  operationId: 'reviewDocumentAutoReview',
  tags: ['Auto-Review'],
  request: {
    params: DocParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: ReviewRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ReviewResponseSchema } },
      description: 'Auto-review results',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'No write access',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
    503: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'AI auto-review not configured',
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
lintReviewRoutes.openapi(reviewRoute, async (c: any) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const docId = c.req.param('docId');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const user = c.get('user');
  if (user && project.userId !== user.id) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canWrite) return c.json({ error: 'Unauthorized' }, 403);
  }

  if (!(await openAILintService.isAiEnabled(db))) {
    return c.json(
      { error: 'AI auto-review is not configured. Set an OpenAI-compatible API key.' },
      503
    );
  }

  try {
    const body = await c.req.json();
    const { style, level } = ReviewRequestSchema.parse(body);
    const documentId = `${username}:${slug}:${docId}/`;

    const result = await autoReviewService.reviewDocument(db, documentId, style, level);
    return c.json(result, 200);
  } catch (error: unknown) {
    lintReviewLog.error('Error in review endpoint', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 503);
  }
});

// POST /:username/:slug/docs/:docId/auto-review/accept — accept a suggestion
const acceptRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/docs/:docId/auto-review/accept',
  operationId: 'acceptAutoReviewSuggestion',
  tags: ['Auto-Review'],
  request: {
    params: DocParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            suggestionId: z.string().openapi({ description: 'Suggestion ID to accept' }),
            replacement: z.string().openapi({ description: 'Replacement text' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SimpleResultSchema } },
      description: 'Suggestion accepted',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Suggestion not found',
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
lintReviewRoutes.openapi(acceptRoute, async (c: any) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const docId = c.req.param('docId');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const user = c.get('user');
  if (user && project.userId !== user.id) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canWrite) return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    const body = await c.req.json();
    const { suggestionId, replacement } = body as {
      suggestionId: string;
      replacement: string;
    };
    const documentId = `${username}:${slug}:${docId}/`;

    // Read mark info before accepting (the mark is removed on accept).
    const info = await autoReviewService.getSuggestionInfo(documentId, suggestionId);

    const success = await autoReviewService.acceptSuggestion(documentId, suggestionId, replacement);
    if (success && info) {
      // Delete matching rejections since the issue is now resolved.
      await autoReviewRejectionService.deleteMatchingRejections(
        db,
        project.id,
        docId,
        info.originalText
      );
    }
    return c.json({ success }, success ? 200 : 404);
  } catch (error: unknown) {
    lintReviewLog.error('Error accepting suggestion', error);
    return c.json({ success: false }, 500);
  }
});

// POST /:username/:slug/docs/:docId/auto-review/reject — reject a suggestion
const rejectRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/docs/:docId/auto-review/reject',
  operationId: 'rejectAutoReviewSuggestion',
  tags: ['Auto-Review'],
  request: {
    params: DocParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            suggestionId: z.string().openapi({ description: 'Suggestion ID to reject' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SimpleResultSchema } },
      description: 'Suggestion rejected',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Suggestion not found',
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
lintReviewRoutes.openapi(rejectRoute, async (c: any) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const docId = c.req.param('docId');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const user = c.get('user');
  if (user && project.userId !== user.id) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canWrite) return c.json({ error: 'Unauthorized' }, 403);
  }

  try {
    const body = await c.req.json();
    const { suggestionId } = body as { suggestionId: string };
    const documentId = `${username}:${slug}:${docId}/`;

    // Read mark info before rejecting (the mark is removed on reject).
    const info = await autoReviewService.getSuggestionInfo(documentId, suggestionId);

    const success = await autoReviewService.rejectSuggestion(documentId, suggestionId);
    if (success && info) {
      // Store the rejection so the LLM doesn't repeat this suggestion.
      const user = c.get('user');
      await autoReviewRejectionService.addRejection(db, {
        projectId: project.id,
        documentId,
        elementId: docId,
        rejection: {
          originalText: info.originalText,
          suggestionText: info.suggestion,
          category: info.category,
          message: info.message,
        },
        userId: user?.id ?? '',
      });
    }
    return c.json({ success }, success ? 200 : 404);
  } catch (error: unknown) {
    lintReviewLog.error('Error rejecting suggestion', error);
    return c.json({ success: false }, 500);
  }
});

// POST /:username/:slug/docs/:docId/auto-review/clear — clear all auto-review marks
const clearRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/docs/:docId/auto-review/clear',
  operationId: 'clearAutoReviewMarks',
  tags: ['Auto-Review'],
  request: {
    params: DocParamsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SimpleResultSchema } },
      description: 'Marks cleared',
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
lintReviewRoutes.openapi(clearRoute, async (c: any) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const docId = c.req.param('docId');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const user = c.get('user');
  if (user && project.userId !== user.id) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canWrite) return c.json({ error: 'Unauthorized' }, 403);
  }

  const documentId = `${username}:${slug}:${docId}/`;
  await autoReviewService.clearAllMarks(documentId);
  return c.json({ success: true }, 200);
});

export default lintReviewRoutes;
