import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../middleware/auth';
import { configService } from '../services/config.service';
import type { AppContext } from '../types/context';
import { ErrorResponseSchema } from '../schemas/common.schemas';
import { CONFIG_KEYS, CONFIG_CATEGORIES } from '../db/schema/config';

// Schema for config value response
const ConfigValueSchema = z.object({
  key: z.string(),
  value: z.string(),
  category: z.enum(CONFIG_CATEGORIES),
  description: z.string().optional(),
  encrypted: z.boolean(),
  source: z.enum(['database', 'environment', 'default']),
});

const ConfigValuesSchema = z.record(z.string(), ConfigValueSchema);

// Schema for config key info
const ConfigKeyInfoSchema = z.object({
  key: z.string(),
  category: z.enum(CONFIG_CATEGORIES),
  description: z.string(),
  encrypted: z.boolean(),
  type: z.enum(['string', 'boolean']),
  envVar: z.string(),
});

const ConfigKeysListSchema = z.array(ConfigKeyInfoSchema);

// Create the admin config routes
export const adminConfigRoutes = new OpenAPIHono<AppContext>();

// Apply admin middleware to all routes
adminConfigRoutes.use('*', requireAdmin);

// Get available config keys
const listConfigKeysRoute = createRoute({
  method: 'get',
  path: '/keys',
  tags: ['Admin Config'],
  summary: 'List available config keys',
  description: 'Get metadata about all available configuration keys',
  operationId: 'adminListConfigKeys',
  responses: {
    200: {
      description: 'List of config keys with metadata',
      content: {
        'application/json': {
          schema: ConfigKeysListSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminConfigRoutes.openapi(listConfigKeysRoute, async (c) => {
  const keys = Object.entries(CONFIG_KEYS).map(([key, config]) => ({
    key,
    category: config.category,
    description: config.description,
    encrypted: config.encrypted,
    type: config.type,
    envVar: config.envVar,
  }));

  return c.json(keys, 200);
});

// Get all config values
const getAllConfigRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin Config'],
  summary: 'Get all config values',
  description: 'Get all configuration values with their sources',
  operationId: 'adminGetAllConfig',
  responses: {
    200: {
      description: 'All config values',
      content: {
        'application/json': {
          schema: ConfigValuesSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminConfigRoutes.openapi(getAllConfigRoute, async (c) => {
  const db = c.get('db');
  const values = await configService.getAll(db);

  // Mask encrypted values that come from database
  const maskedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (value.encrypted && value.source === 'database' && value.value) {
        return [key, { ...value, value: '********' }];
      }
      // Also mask env-sourced sensitive values
      if (CONFIG_KEYS[key as keyof typeof CONFIG_KEYS]?.encrypted && value.value) {
        return [key, { ...value, value: '********' }];
      }
      return [key, value];
    })
  );

  return c.json(maskedValues, 200);
});

// Get config by category
const getConfigByCategoryRoute = createRoute({
  method: 'get',
  path: '/category/{category}',
  tags: ['Admin Config'],
  summary: 'Get config by category',
  description: 'Get configuration values for a specific category',
  operationId: 'adminGetConfigByCategory',
  request: {
    params: z.object({
      category: z.enum(CONFIG_CATEGORIES),
    }),
  },
  responses: {
    200: {
      description: 'Config values for category',
      content: {
        'application/json': {
          schema: ConfigValuesSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminConfigRoutes.openapi(getConfigByCategoryRoute, async (c) => {
  const db = c.get('db');
  const { category } = c.req.valid('param');
  const values = await configService.getByCategory(db, category);

  // Mask encrypted values
  const maskedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (value.encrypted && value.value) {
        return [key, { ...value, value: '********' }];
      }
      return [key, value];
    })
  );

  return c.json(maskedValues, 200);
});

// Get a single config value
const getConfigRoute = createRoute({
  method: 'get',
  path: '/{key}',
  tags: ['Admin Config'],
  summary: 'Get a config value',
  description: 'Get a single configuration value by key',
  operationId: 'adminGetConfig',
  request: {
    params: z.object({
      key: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Config value',
      content: {
        'application/json': {
          schema: ConfigValueSchema,
        },
      },
    },
    400: {
      description: 'Invalid config key',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminConfigRoutes.openapi(getConfigRoute, async (c) => {
  const db = c.get('db');
  const { key } = c.req.valid('param');

  // Validate key exists
  if (!(key in CONFIG_KEYS)) {
    return c.json({ error: `Invalid config key: ${key}` }, 400);
  }

  const value = await configService.get(db, key as keyof typeof CONFIG_KEYS);

  // Mask encrypted values
  if (value.encrypted && value.value) {
    return c.json({ ...value, value: '********' }, 200);
  }

  return c.json(value, 200);
});

// Set a config value
const setConfigRoute = createRoute({
  method: 'put',
  path: '/{key}',
  tags: ['Admin Config'],
  summary: 'Set a config value',
  description: 'Set a configuration value (stores in database, overrides env)',
  operationId: 'adminSetConfig',
  request: {
    params: z.object({
      key: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            value: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Config value updated',
      content: {
        'application/json': {
          schema: ConfigValueSchema,
        },
      },
    },
    400: {
      description: 'Invalid config key or value',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminConfigRoutes.openapi(setConfigRoute, async (c) => {
  const db = c.get('db');
  const { key } = c.req.valid('param');
  const { value } = c.req.valid('json');

  // Validate key exists
  if (!(key in CONFIG_KEYS)) {
    return c.json({ error: `Invalid config key: ${key}` }, 400);
  }

  const configKey = key as keyof typeof CONFIG_KEYS;
  const keyConfig = CONFIG_KEYS[configKey];

  // Validate boolean values
  if (keyConfig.type === 'boolean' && !['true', 'false', '1', '0'].includes(value)) {
    return c.json({ error: `Invalid boolean value for ${key}: ${value}` }, 400);
  }

  await configService.set(db, configKey, value);

  // Return the updated value (masked if encrypted)
  const updated = await configService.get(db, configKey);
  if (updated.encrypted && updated.value) {
    return c.json({ ...updated, value: '********' }, 200);
  }

  return c.json(updated, 200);
});

// Delete a config value (revert to env/default)
const deleteConfigRoute = createRoute({
  method: 'delete',
  path: '/{key}',
  tags: ['Admin Config'],
  summary: 'Delete a config value',
  description: 'Remove a config value from database (reverts to env/default)',
  operationId: 'adminDeleteConfig',
  request: {
    params: z.object({
      key: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Config value deleted, showing reverted value',
      content: {
        'application/json': {
          schema: ConfigValueSchema,
        },
      },
    },
    400: {
      description: 'Invalid config key',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

adminConfigRoutes.openapi(deleteConfigRoute, async (c) => {
  const db = c.get('db');
  const { key } = c.req.valid('param');

  // Validate key exists
  if (!(key in CONFIG_KEYS)) {
    return c.json({ error: `Invalid config key: ${key}` }, 400);
  }

  const configKey = key as keyof typeof CONFIG_KEYS;
  await configService.delete(db, configKey);

  // Return the reverted value
  const reverted = await configService.get(db, configKey);
  return c.json(reverted, 200);
});
