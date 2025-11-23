import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { openAIImageService } from '../services/openai-image.service';
import type { AppContext } from '../types/context';

const aiImageRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all ai-image routes
aiImageRoutes.use('*', requireAuth);

// Schemas
const ImageGenerateRequestSchema = z
  .object({
    prompt: z
      .string()
      .openapi({ example: 'A beautiful landscape', description: 'The image generation prompt' }),
    model: z
      .enum(['dall-e-2', 'dall-e-3'])
      .optional()
      .openapi({ example: 'dall-e-3', description: 'AI model to use' }),
    n: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .openapi({ example: 1, description: 'Number of images to generate' }),
    quality: z
      .enum(['standard', 'hd'])
      .optional()
      .openapi({ example: 'standard', description: 'Image quality' }),
    response_format: z
      .enum(['url', 'b64_json'])
      .optional()
      .openapi({ example: 'url', description: 'Response format' }),
    size: z
      .enum(['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'])
      .optional()
      .openapi({ example: '1024x1024', description: 'Image size' }),
    style: z
      .enum(['vivid', 'natural'])
      .optional()
      .openapi({ example: 'vivid', description: 'Image style' }),
  })
  .openapi('ImageGenerateRequest');

const ImageDataSchema = z
  .object({
    b64_json: z.string().optional().openapi({ description: 'Base64-encoded JSON image data' }),
    url: z
      .string()
      .optional()
      .openapi({ example: 'https://example.com/image.png', description: 'URL to the image' }),
    revised_prompt: z.string().optional().openapi({ description: 'The revised prompt used' }),
  })
  .openapi('ImageData');

const ImageResponseSchema = z
  .object({
    created: z.number().openapi({ example: 1234567890, description: 'Unix timestamp of creation' }),
    data: z.array(ImageDataSchema).openapi({ description: 'Generated images' }),
    source: z.string().openapi({ example: 'openai', description: 'Source service' }),
  })
  .openapi('ImageResponse');

const StatusSchema = z
  .object({
    enabled: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI image generation is enabled' }),
    service: z.string().openapi({ example: 'openai', description: 'The AI service being used' }),
  })
  .openapi('AIImageStatus');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('AIImageError');

// Generate image route
const generateRoute = createRoute({
  method: 'post',
  path: '/generate',
  tags: ['AI Image Generation'],
  operationId: 'generateAIImage',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ImageGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ImageResponseSchema,
        },
      },
      description: 'Image generated successfully',
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
      description: 'AI image generation service unavailable',
    },
  },
});

aiImageRoutes.openapi(generateRoute, async (c) => {
  try {
    const body = await c.req.json();
    const validatedBody = ImageGenerateRequestSchema.parse(body);

    if (!openAIImageService.isAiEnabled()) {
      return c.json(
        {
          error: 'AI image generation features are not available. Please configure OPENAI_API_KEY.',
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

    return c.json(result, 200);
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling needs name/message properties
    const err = error as any;
    console.error('Error in image generation endpoint:', err);
    if (err.name === 'ZodError') {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    return c.json({ error: err.message || 'Failed to generate image' }, 503);
  }
});

// Get image generation status route
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['AI Image Generation'],
  operationId: 'getAIImageStatus',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: StatusSchema,
        },
      },
      description: 'Service status',
    },
  },
});

aiImageRoutes.openapi(statusRoute, (c) => {
  return c.json({
    enabled: openAIImageService.isAiEnabled(),
    service: openAIImageService.isAiEnabled() ? 'openai' : 'none',
  });
});

export default aiImageRoutes;
