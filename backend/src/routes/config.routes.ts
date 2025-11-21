import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { config } from '../config/env.js';

const configRoutes = new OpenAPIHono();

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

const CaptchaSettingsSchema = z
  .object({
    enabled: z.boolean().openapi({ example: true, description: 'Whether reCAPTCHA is enabled' }),
    siteKey: z.string().optional().openapi({
      example: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
      description: 'reCAPTCHA site key for client-side validation',
    }),
  })
  .openapi('CaptchaSettings');

const SystemFeaturesSchema = z
  .object({
    aiLinting: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI-powered linting is available' }),
    aiImageGeneration: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI-powered image generation is available' }),
    captcha: CaptchaSettingsSchema.openapi({
      description: 'ReCaptcha configuration for registration',
    }),
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

configRoutes.openapi(getFeaturesRoute, (c) => {
  // Check if OpenAI API key is configured
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const hasOpenAI = !!openaiApiKey && openaiApiKey.trim().length > 0;

  // Check reCAPTCHA configuration
  const recaptchaEnabled = process.env.RECAPTCHA_ENABLED?.toLowerCase() === 'true';
  const recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;
  const captchaSettings = {
    enabled: recaptchaEnabled && !!recaptchaSiteKey,
    siteKey: recaptchaEnabled ? recaptchaSiteKey : undefined,
  };

  // Get app mode configuration
  const appModeEnv = process.env.APP_MODE?.toUpperCase() || 'BOTH';
  const appMode = ['ONLINE', 'OFFLINE', 'BOTH'].includes(appModeEnv)
    ? (appModeEnv as 'ONLINE' | 'OFFLINE' | 'BOTH')
    : 'BOTH';

  // Get default server name
  const defaultServerName = process.env.DEFAULT_SERVER_NAME?.trim() || undefined;

  return c.json({
    aiLinting: hasOpenAI,
    aiImageGeneration: hasOpenAI,
    captcha: captchaSettings,
    appMode,
    defaultServerName,
    userApprovalRequired: config.userApprovalRequired,
  });
});

export default configRoutes;
