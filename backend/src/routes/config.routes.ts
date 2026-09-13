import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { config } from '../config/env';
import { PROTOCOL_VERSION, MIN_CLIENT_VERSION } from '../config/protocol';
import { imageGenerationService } from '../services/image-generation.service';
import { configService } from '../services/config.service';
import { getPasswordPolicy } from '../services/password-validation.service';
import type { AppContext } from '../types/context';

const configRoutes = new OpenAPIHono<AppContext>();

// Schema definitions
const ConfigResponseSchema = z
  .object({
    version: z.string().openapi({ example: '1.0.0', description: 'Application version' }),
    protocolVersion: z.number().openapi({
      example: 1,
      description: 'API protocol version for client compatibility checking',
    }),
    minClientVersion: z.string().openapi({
      example: '0.1.0',
      description: 'Minimum client version required to connect to this server',
    }),
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
    aiAutoReview: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI-powered auto-review is available' }),
    aiImageGeneration: z
      .boolean()
      .openapi({ example: true, description: 'Whether AI-powered image generation is available' }),
    appMode: z
      .enum(['ONLINE', 'LOCAL', 'BOTH'])
      .openapi({ example: 'BOTH', description: 'Application mode configuration' }),
    defaultServerName: z.string().optional().openapi({
      example: 'http://localhost:3000',
      description: 'Default server name to pre-populate in setup form',
    }),
    userApprovalRequired: z
      .boolean()
      .openapi({ example: false, description: 'Whether admin approval is required for new users' }),
    emailEnabled: z.boolean().openapi({
      example: false,
      description: 'Whether transactional email is enabled (affects forgot-password availability)',
    }),
    requireEmail: z.boolean().openapi({
      example: false,
      description: 'Whether email address is required during registration',
    }),
    passwordPolicy: z
      .object({
        minLength: z.number().openapi({ example: 8, description: 'Minimum password length' }),
        requireUppercase: z
          .boolean()
          .openapi({ example: true, description: 'Require uppercase letter' }),
        requireLowercase: z
          .boolean()
          .openapi({ example: true, description: 'Require lowercase letter' }),
        requireNumber: z.boolean().openapi({ example: true, description: 'Require number' }),
        requireSymbol: z
          .boolean()
          .openapi({ example: true, description: 'Require special character' }),
      })
      .openapi({
        description: 'Password policy configuration for registration and password reset',
      }),
    passkeysEnabled: z.boolean().openapi({
      example: true,
      description:
        'Whether passkey (WebAuthn) authentication is enabled. When false, all passkey endpoints return 403.',
    }),
    passwordLoginEnabled: z.boolean().openapi({
      example: false,
      description:
        'Whether username/password authentication is enabled. When false the app is fully ' +
        'passwordless: /login, /forgot-password, /reset-password and registration password ' +
        'fields are all disabled. The frontend uses this to hide password UI entirely.',
    }),
    emailRecoveryEnabled: z.boolean().openapi({
      example: false,
      description:
        'Whether email-based recovery is enabled. When passwords are off, this controls the ' +
        'magic-link passkey-enrolment recovery flow. When passwords are on, this gates the ' +
        'forgot-password reset email.',
    }),
    legacyMcpEnabled: z.boolean().openapi({
      example: false,
      description:
        'Whether legacy MCP API keys (long-lived project-scoped tokens) are enabled. When ' +
        'false (default) the "Legacy API Keys" section in project settings is hidden and only ' +
        'OAuth-based MCP connections are offered.',
    }),
    mcpEnabled: z.boolean().openapi({
      example: true,
      description:
        'Whether MCP (Model Context Protocol) access is enabled. The AI kill switch takes ' +
        'precedence: when the kill switch is on, MCP is disabled regardless of this flag.',
    }),
    privacyPolicyUrl: z.string().optional().openapi({
      example: 'https://example.com/privacy',
      description:
        'URL of the instance privacy policy, if configured by an admin. Absent when unset.',
    }),
    termsUrl: z.string().optional().openapi({
      example: 'https://example.com/terms',
      description:
        'URL of the instance terms of service, if configured by an admin. Absent when unset.',
    }),
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
    protocolVersion: PROTOCOL_VERSION,
    minClientVersion: MIN_CLIENT_VERSION,
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

  // Every flag below is a config lookup; fetch them in ONE round trip (this
  // public endpoint is hit on every page load and used to issue ~15 serial
  // queries), and run the independent async checks concurrently.
  const isTruthy = (v: string) => v === 'true' || v === '1';
  const [cfg, passwordPolicy] = await Promise.all([
    configService.getMany(db, [
      'AI_KILL_SWITCH',
      'AI_TEXT_ENABLED',
      'AI_TEXT_DEFAULT_PROVIDER',
      'AI_OPENROUTER_API_KEY',
      'AI_ANTHROPIC_API_KEY',
      'AI_OPENAI_API_KEY',
      'EMAIL_ENABLED',
      'REQUIRE_EMAIL',
      'PASSKEYS_ENABLED',
      'PASSWORD_LOGIN_ENABLED',
      'EMAIL_RECOVERY_ENABLED',
      'LEGACY_MCP_ENABLED',
      'MCP_ENABLED',
      'PRIVACY_POLICY_URL',
      'TERMS_OF_SERVICE_URL',
    ] as const),
    getPasswordPolicy(db),
  ]);

  // Check AI kill switch status
  // If locked by env var, always use the env value
  // Otherwise, check database or fall back to default (true = AI disabled)
  const lockedByEnv = config.aiKillSwitch.lockedByEnv;
  const aiKillSwitch = lockedByEnv
    ? config.aiKillSwitch.enabled
    : isTruthy(cfg.AI_KILL_SWITCH.value);

  // If kill switch is ON (enabled = true), all AI features are disabled
  let hasOpenAI = false;
  let hasImageGeneration = false;

  if (!aiKillSwitch) {
    // Kill switch is OFF, check actual AI availability
    if (isTruthy(cfg.AI_TEXT_ENABLED.value)) {
      // Check if the configured default provider has an API key
      const provider = cfg.AI_TEXT_DEFAULT_PROVIDER.value || 'openai';
      let providerKey: string;
      if (provider === 'openrouter') {
        providerKey = cfg.AI_OPENROUTER_API_KEY.value || process.env.AI_OPENROUTER_API_KEY || '';
      } else if (provider === 'anthropic') {
        providerKey = cfg.AI_ANTHROPIC_API_KEY.value || process.env.AI_ANTHROPIC_API_KEY || '';
      } else {
        providerKey = cfg.AI_OPENAI_API_KEY.value || process.env.OPENAI_API_KEY || '';
      }
      hasOpenAI = providerKey.trim().length > 0;
    }

    // Check if ANY image generation provider is available
    // This properly checks OpenAI, OpenRouter, Fal.ai, and Stable Diffusion
    hasImageGeneration = await imageGenerationService.isAvailable(db);
  }

  // Get app mode configuration
  const appModeEnv = process.env.APP_MODE?.toUpperCase() || 'BOTH';
  const appMode = ['ONLINE', 'LOCAL', 'BOTH'].includes(appModeEnv)
    ? (appModeEnv as 'ONLINE' | 'LOCAL' | 'BOTH')
    : 'BOTH';

  // Get default server name
  const defaultServerName = process.env.DEFAULT_SERVER_NAME?.trim() || undefined;

  // Optional legal links configured by the admin. Trimmed; empty values are
  // omitted from the payload so the frontend can simply check presence.
  const privacyPolicyUrl = cfg.PRIVACY_POLICY_URL.value.trim() || undefined;
  const termsUrl = cfg.TERMS_OF_SERVICE_URL.value.trim() || undefined;

  return c.json({
    aiKillSwitch,
    aiKillSwitchLockedByEnv: lockedByEnv,
    aiAutoReview: hasOpenAI,
    aiImageGeneration: hasImageGeneration,
    appMode,
    defaultServerName,
    userApprovalRequired: config.userApprovalRequired,
    emailEnabled: isTruthy(cfg.EMAIL_ENABLED.value),
    requireEmail: isTruthy(cfg.REQUIRE_EMAIL.value),
    passwordPolicy,
    passkeysEnabled: isTruthy(cfg.PASSKEYS_ENABLED.value),
    // Whether password login + email-recovery flows are available. These two
    // flags drive the "passwordless mode" UX in the frontend.
    passwordLoginEnabled: isTruthy(cfg.PASSWORD_LOGIN_ENABLED.value),
    emailRecoveryEnabled: isTruthy(cfg.EMAIL_RECOVERY_ENABLED.value),
    // Legacy MCP API keys (default OFF — OAuth is the recommended method).
    legacyMcpEnabled: isTruthy(cfg.LEGACY_MCP_ENABLED.value),
    // MCP access as a whole (default ON). The AI kill switch takes precedence.
    mcpEnabled: isTruthy(cfg.MCP_ENABLED.value),
    privacyPolicyUrl,
    termsUrl,
  });
});

export default configRoutes;
