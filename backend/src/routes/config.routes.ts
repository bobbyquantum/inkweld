import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { config } from '../config/env';
import { imageGenerationService } from '../services/image-generation.service';
import { configService } from '../services/config.service';
import type { AppContext } from '../types/context';

const configRoutes = new OpenAPIHono<AppContext>();

// Schema definitions
const ConfigResponseSchema = z
  .object({
    version: z.string().openapi({ example: '1.0.0', description: 'Application version' }),
    userApprovalRequired: z
      .boolean()
      .openapi({ example: false, description: 'Whether admin approval is required for new users' }),
    githubEnabled: z
      .boolean()
      .openapi({ example: true, description: 'Whether GitHub OAuth is enabled' }),
  })
  .openapi('ConfigResponse');

const SystemFeaturesSchema = z
  .object({
    aiKillSwitch: z.boolean().openapi({
      example: true,
      description:
        'Master kill switch for ALL AI features. When true (default), all AI features are disabled.',
    }),
    aiKillSwitchLockedByEnv: z.boolean().openapi({
      example: false,
      description:
        'Whether the AI kill switch is locked by environment variable and cannot be changed in admin UI.',
    }),
    aiLinting: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI-powered linting is available' }),
    aiImageGeneration: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI-powered image generation is available' }),
    appMode: z
      .enum(['ONLINE', 'OFFLINE', 'BOTH'])
      .openapi({ example: 'BOTH', description: 'Application mode configuration' }),
    defaultServerName: z.string().optional().openapi({
      example: 'http://localhost:3000',
      description: 'Default server name to pre-populate in setup form',
    }),
    userApprovalRequired: z
      .boolean()
      .openapi({ example: false, description: 'Whether admin approval is required for new users' }),
  })
  .openapi('SystemFeatures');

// Get app configuration route
const getConfigRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Configuration'],
  operationId: 'getAppConfiguration',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ConfigResponseSchema,
        },
      },
      description: 'Application configuration',
    },
  },
});

configRoutes.openapi(getConfigRoute, (c) => {
  return c.json({
    version: config.version,
    userApprovalRequired: config.userApprovalRequired,
    githubEnabled: config.github.enabled,
  });
});

// Get system features configuration route
const getFeaturesRoute = createRoute({
  method: 'get',
  path: '/features',
  tags: ['Configuration'],
  operationId: 'getSystemFeatures',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SystemFeaturesSchema,
        },
      },
      description: 'System features configuration',
    },
  },
});

configRoutes.openapi(getFeaturesRoute, async (c) => {
  const db = c.get('db');

  // Check AI kill switch status
  // If locked by env var, always use the env value
  // Otherwise, check database or fall back to default (true = AI disabled)
  let aiKillSwitch: boolean;
  const lockedByEnv = config.aiKillSwitch.lockedByEnv;

  if (lockedByEnv) {
    // Environment variable takes precedence - cannot be changed in admin UI
    aiKillSwitch = config.aiKillSwitch.enabled;
  } else {
    // Check database value (or default)
    aiKillSwitch = await configService.getBoolean(db, 'AI_KILL_SWITCH');
  }

  // If kill switch is ON (enabled = true), all AI features are disabled
  let hasOpenAI = false;
  let hasImageGeneration = false;

  if (!aiKillSwitch) {
    // Kill switch is OFF, check actual AI availability
    // Check if OpenAI API key is configured (for AI linting)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    hasOpenAI = !!openaiApiKey && openaiApiKey.trim().length > 0;

    // Check if ANY image generation provider is available
    // This properly checks OpenAI, OpenRouter, Fal.ai, and Stable Diffusion
    hasImageGeneration = await imageGenerationService.isAvailable(db);
  }

  // Get app mode configuration
  const appModeEnv = process.env.APP_MODE?.toUpperCase() || 'BOTH';
  const appMode = ['ONLINE', 'OFFLINE', 'BOTH'].includes(appModeEnv)
    ? (appModeEnv as 'ONLINE' | 'OFFLINE' | 'BOTH')
    : 'BOTH';

  // Get default server name
  const defaultServerName = process.env.DEFAULT_SERVER_NAME?.trim() || undefined;

  return c.json({
    aiKillSwitch,
    aiKillSwitchLockedByEnv: lockedByEnv,
    aiLinting: hasOpenAI,
    aiImageGeneration: hasImageGeneration,
    appMode,
    defaultServerName,
    userApprovalRequired: config.userApprovalRequired,
  });
});

export default configRoutes;
