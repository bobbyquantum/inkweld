import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { openAILintService } from '../services/openai-lint.service';
import { logger } from '../services/logger.service';
import type { AppContext } from '../types/context';

const lintLog = logger.child('Lint');
const lintRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all lint routes
lintRoutes.use('*', requireAuth);

// Schemas
const LintRequestSchema = z
  .object({
    paragraph: z.string().max(4096).openapi({
      example: 'This is a sample text.',
      description: 'The paragraph text to be checked',
    }),
    style: z
      .string()
      .openapi({ example: 'academic', description: 'The writing style to check against' }),
    level: z
      .enum(['low', 'medium', 'high'])
      .openapi({ example: 'medium', description: 'The level of linting strictness' }),
  })
  .openapi('LintRequest');

const CorrectionSchema = z
  .object({
    start_pos: z.number().openapi({ example: 0, description: 'Start position of the error' }),
    end_pos: z.number().openapi({ example: 4, description: 'End position of the error' }),
    original_text: z
      .string()
      .openapi({ example: 'This', description: 'The original text with the error' }),
    corrected_text: z
      .string()
      .openapi({ example: 'This', description: 'The suggested correction' }),
    error_type: z.string().openapi({ example: 'grammar', description: 'Type of error' }),
    recommendation: z
      .string()
      .openapi({ example: 'Consider...', description: 'Explanation of the correction' }),
  })
  .openapi('Correction');

const StyleRecommendationSchema = z
  .object({
    suggestion: z
      .string()
      .openapi({ example: 'Use active voice', description: 'Style suggestion' }),
    reason: z.string().openapi({
      example: 'Active voice is more engaging',
      description: 'Reason for the suggestion',
    }),
  })
  .openapi('StyleRecommendation');

const LintResponseSchema = z
  .object({
    original_paragraph: z.string().openapi({ description: 'The original paragraph' }),
    corrections: z.array(CorrectionSchema).openapi({ description: 'List of corrections' }),
    style_recommendations: z
      .array(StyleRecommendationSchema)
      .openapi({ description: 'List of style recommendations' }),
    source: z
      .enum(['openai', 'languagetool'])
      .openapi({ example: 'openai', description: 'The linting service source' }),
  })
  .openapi('LintResponse');

const LintStatusSchema = z
  .object({
    enabled: z.boolean().openapi({ example: true, description: 'Whether AI linting is enabled' }),
    service: z.string().openapi({ example: 'openai', description: 'The AI service being used' }),
  })
  .openapi('LintStatus');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('LintError');

// Get lint status
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['Linting'],
  operationId: 'getLintStatus',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LintStatusSchema,
        },
      },
      description: 'AI service status',
    },
  },
});

lintRoutes.openapi(statusRoute, (c) => {
  return c.json({
    enabled: openAILintService.isAiEnabled(),
    service: openAILintService.isAiEnabled() ? 'openai' : 'none',
  });
});

// Lint paragraph
const lintRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Linting'],
  operationId: 'lintParagraph',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LintRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LintResponseSchema,
        },
      },
      description: 'Lint results',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Invalid request',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not authenticated',
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'AI linting service unavailable',
    },
  },
});

lintRoutes.openapi(lintRoute, async (c) => {
  try {
    const body = await c.req.json();
    const validatedBody = LintRequestSchema.parse(body);

    if (!openAILintService.isAiEnabled()) {
      return c.json(
        {
          error: 'AI linting features are not available. Please configure OPENAI_API_KEY.',
        },
        503
      );
    }

    const result = await openAILintService.processText(
      validatedBody.paragraph,
      validatedBody.style,
      validatedBody.level
    );

    return c.json(result, 200);
  } catch (error: unknown) {
    lintLog.error('Error in lint endpoint', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (error instanceof Error && error.name === 'ZodError') {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    return c.json({ error: errorMessage || 'Failed to process linting request' }, 503);
  }
});

export default lintRoutes;
