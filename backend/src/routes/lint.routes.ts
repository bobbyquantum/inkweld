import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { openAILintService } from '../services/openai-lint.service';

const lintRoutes = new Hono();

// Schemas
const lintRequestSchema = z.object({
  paragraph: z.string().max(4096).describe('The paragraph text to be checked'),
  style: z.string().describe('The writing style to check against'),
  level: z.enum(['low', 'medium', 'high']).describe('The level of linting strictness'),
});

const correctionSchema = z.object({
  start_pos: z.number().describe('Start position of the error'),
  end_pos: z.number().describe('End position of the error'),
  original_text: z.string().describe('The original text with the error'),
  corrected_text: z.string().describe('The suggested correction'),
  error_type: z.string().describe('Type of error'),
  recommendation: z.string().describe('Explanation of the correction'),
});

const styleRecommendationSchema = z.object({
  suggestion: z.string().describe('Style suggestion'),
  reason: z.string().describe('Reason for the suggestion'),
});

const lintResponseSchema = z.object({
  original_paragraph: z.string().describe('The original paragraph'),
  corrections: z.array(correctionSchema).describe('List of corrections'),
  style_recommendations: z
    .array(styleRecommendationSchema)
    .describe('List of style recommendations'),
  source: z.enum(['openai', 'languagetool']).describe('The linting service source'),
});

const lintStatusSchema = z.object({
  enabled: z.boolean().describe('Whether AI linting is enabled'),
  service: z.string().describe('The AI service being used'),
});

const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// Get lint status
lintRoutes.get(
  '/status',
  describeRoute({
    description: 'Check if AI linting features are available',
    tags: ['Linting'],
    responses: {
      200: {
        description: 'AI service status',
        content: {
          'application/json': {
            schema: resolver(lintStatusSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      enabled: openAILintService.isAiEnabled(),
      service: openAILintService.isAiEnabled() ? 'openai' : 'none',
    });
  }
);

// Lint paragraph
lintRoutes.post(
  '/',
  describeRoute({
    description: 'Lint a paragraph for grammar, spelling, and style issues',
    tags: ['Linting'],
    responses: {
      200: {
        description: 'Lint results',
        content: {
          'application/json': {
            schema: resolver(lintResponseSchema),
          },
        },
      },
      400: {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
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
      503: {
        description: 'AI linting service unavailable',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  validator('json', lintRequestSchema),
  async (c) => {
    try {
      const validatedBody = c.req.valid('json');

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

      return c.json(result);
    } catch (error: unknown) {
      console.error('Error in lint endpoint:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error && error.name === 'ZodError') {
        return c.json({ error: 'Invalid request body' }, 400);
      }
      return c.json({ error: errorMessage || 'Failed to process linting request' }, 500);
    }
  }
);

export default lintRoutes;
