import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { openAIImageService } from '../services/openai-image.service';

const aiImageRoutes = new Hono();

// Schemas
const imageGenerateRequestSchema = z.object({
  prompt: z.string().describe('The image generation prompt'),
  model: z.enum(['dall-e-2', 'dall-e-3']).optional().describe('AI model to use'),
  n: z.number().min(1).max(10).optional().describe('Number of images to generate'),
  quality: z.enum(['standard', 'hd']).optional().describe('Image quality'),
  response_format: z.enum(['url', 'b64_json']).optional().describe('Response format'),
  size: z
    .enum(['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'])
    .optional()
    .describe('Image size'),
  style: z.enum(['vivid', 'natural']).optional().describe('Image style'),
});

const imageDataSchema = z.object({
  b64_json: z.string().optional().describe('Base64-encoded JSON image data'),
  url: z.string().optional().describe('URL to the image'),
  revised_prompt: z.string().optional().describe('The revised prompt used'),
});

const imageResponseSchema = z.object({
  created: z.number().describe('Unix timestamp of creation'),
  data: z.array(imageDataSchema).describe('Generated images'),
  source: z.string().describe('Source service'),
});

const statusSchema = z.object({
  enabled: z.boolean().describe('Whether AI image generation is enabled'),
  service: z.string().describe('The AI service being used'),
});

const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// Generate image
aiImageRoutes.post(
  '/generate',
  describeRoute({
    description: 'Generate an image using AI',
    tags: ['AI Image Generation'],
    responses: {
      200: {
        description: 'Image generated successfully',
        content: {
          'application/json': {
            schema: resolver(imageResponseSchema),
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
        description: 'AI image generation service unavailable',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    try {
      const body = await c.req.json();
      const validatedBody = imageGenerateRequestSchema.parse(body);

      if (!openAIImageService.isAiEnabled()) {
        return c.json(
          {
            error:
              'AI image generation features are not available. Please configure OPENAI_API_KEY.',
          },
          503
        );
      }

      const result = await openAIImageService.generate({
        prompt: validatedBody.prompt,
        model: validatedBody.model,
        n: validatedBody.n,
        quality: validatedBody.quality,
        response_format: validatedBody.response_format,
        size: validatedBody.size,
        style: validatedBody.style,
      });

      return c.json(result);
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling needs name/message properties
      const err = error as any;
      console.error('Error in image generation endpoint:', err);
      if (err.name === 'ZodError') {
        return c.json({ error: 'Invalid request body' }, 400);
      }
      return c.json({ error: err.message || 'Failed to generate image' }, 500);
    }
  }
);

// Get image generation status
aiImageRoutes.get(
  '/status',
  describeRoute({
    description: 'Check if AI image generation is available',
    tags: ['AI Image Generation'],
    responses: {
      200: {
        description: 'Service status',
        content: {
          'application/json': {
            schema: resolver(statusSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      enabled: openAIImageService.isAiEnabled(),
      service: openAIImageService.isAiEnabled() ? 'openai' : 'none',
    });
  }
);

export default aiImageRoutes;
