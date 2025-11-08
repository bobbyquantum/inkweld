import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../config/env.js';

const configRoutes = new Hono();

// Schema definitions
const ConfigResponseSchema = z.object({
  version: z.string().describe('Application version'),
  userApprovalRequired: z.boolean().describe('Whether admin approval is required for new users'),
  githubEnabled: z.boolean().describe('Whether GitHub OAuth is enabled'),
});

const CaptchaSettingsSchema = z.object({
  enabled: z.boolean().describe('Whether reCAPTCHA is enabled'),
  siteKey: z.string().optional().describe('reCAPTCHA site key for client-side validation'),
});

const SystemFeaturesSchema = z.object({
  aiLinting: z.boolean().describe('Whether AI-powered linting is available'),
  aiImageGeneration: z.boolean().describe('Whether AI-powered image generation is available'),
  captcha: CaptchaSettingsSchema.describe('ReCaptcha configuration for registration'),
  appMode: z.enum(['ONLINE', 'OFFLINE', 'BOTH']).describe('Application mode configuration'),
  defaultServerName: z
    .string()
    .optional()
    .describe('Default server name to pre-populate in setup form'),
  userApprovalRequired: z.boolean().describe('Whether admin approval is required for new users'),
});

// Get app configuration
configRoutes.get(
  '/',
  describeRoute({
    description: 'Get public application configuration',
    tags: ['Configuration'],
    responses: {
      200: {
        description: 'Application configuration',
        content: {
          'application/json': {
            schema: resolver(ConfigResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      version: config.version,
      userApprovalRequired: config.userApprovalRequired,
      githubEnabled: config.github.enabled,
    });
  }
);

// Get system features configuration
configRoutes.get(
  '/features',
  describeRoute({
    description: 'Get system features configuration',
    tags: ['Configuration'],
    responses: {
      200: {
        description: 'System features configuration',
        content: {
          'application/json': {
            schema: resolver(SystemFeaturesSchema),
          },
        },
      },
    },
  }),
  (c) => {
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
  }
);

export default configRoutes;
