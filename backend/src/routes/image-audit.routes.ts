/**
 * Image Audit Admin Routes
 *
 * Admin routes for viewing image generation audit records.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../middleware/auth';
import { imageAuditService } from '../services/image-audit.service';
import type { AppContext } from '../types/context';
import { ErrorResponseSchema } from '../schemas/common.schemas';

// ============================================
// Schemas
// ============================================

const AuditRecordSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    username: z.string().nullable(),
    profileId: z.string().nullable(),
    profileName: z.string(),
    prompt: z.string(),
    referenceImageUrls: z.array(z.string()).nullable(),
    outputImageUrls: z.array(z.string()).nullable(),
    creditCost: z.number(),
    status: z.enum(['success', 'moderated']),
    message: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('ImageGenerationAudit');

const PaginatedAuditsSchema = z
  .object({
    audits: z.array(AuditRecordSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  })
  .openapi('PaginatedImageAudits');

const AuditStatsSchema = z
  .object({
    totalRequests: z.number(),
    totalCredits: z.number(),
    successCount: z.number(),
    moderatedCount: z.number(),
    byProfile: z.array(
      z.object({
        profileName: z.string(),
        count: z.number(),
        credits: z.number(),
      })
    ),
    byUser: z.array(
      z.object({
        userId: z.string(),
        username: z.string().nullable(),
        count: z.number(),
        credits: z.number(),
      })
    ),
  })
  .openapi('ImageAuditStats');

const ListAuditsQuerySchema = z.object({
  userId: z.string().optional().openapi({ description: 'Filter by user ID' }),
  profileId: z.string().optional().openapi({ description: 'Filter by profile ID' }),
  status: z.enum(['success', 'moderated']).optional().openapi({ description: 'Filter by status' }),
  startDate: z
    .string()
    .optional()
    .openapi({ description: 'Filter by start date (ISO 8601)', example: '2025-01-01T00:00:00Z' }),
  endDate: z
    .string()
    .optional()
    .openapi({ description: 'Filter by end date (ISO 8601)', example: '2025-12-31T23:59:59Z' }),
  search: z.string().optional().openapi({ description: 'Search in prompt text' }),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .openapi({ description: 'Page number' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .openapi({ description: 'Items per page' }),
});

const StatsQuerySchema = z.object({
  startDate: z.string().optional().openapi({ description: 'Start date for stats (ISO 8601)' }),
  endDate: z.string().optional().openapi({ description: 'End date for stats (ISO 8601)' }),
});

// ============================================
// Routes
// ============================================

export const imageAuditAdminRoutes = new OpenAPIHono<AppContext>();

imageAuditAdminRoutes.use('*', requireAdmin);

// List audits with filtering and pagination
const listAuditsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin - Image Audits'],
  summary: 'List image generation audits',
  description: 'Get a paginated list of image generation audit records (admin only)',
  operationId: 'adminListImageAudits',
  request: {
    query: ListAuditsQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated list of audits',
      content: {
        'application/json': {
          schema: PaginatedAuditsSchema,
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

imageAuditAdminRoutes.openapi(listAuditsRoute, async (c) => {
  const db = c.get('db');
  const query = c.req.valid('query');

  const result = await imageAuditService.list(db, {
    userId: query.userId,
    profileId: query.profileId,
    status: query.status,
    startDate: query.startDate ? new Date(query.startDate) : undefined,
    endDate: query.endDate ? new Date(query.endDate) : undefined,
    search: query.search,
    page: query.page,
    limit: query.limit,
  });

  return c.json(
    {
      audits: result.audits.map((audit) => ({
        id: audit.id,
        userId: audit.userId,
        username: audit.username,
        profileId: audit.profileId,
        profileName: audit.profileName,
        prompt: audit.prompt,
        referenceImageUrls: audit.referenceImageUrls,
        outputImageUrls: audit.outputImageUrls,
        creditCost: audit.creditCost,
        status: audit.status,
        message: audit.message,
        createdAt: audit.createdAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
    200
  );
});

// Get audit by ID
const getAuditRoute = createRoute({
  method: 'get',
  path: '/:auditId',
  tags: ['Admin - Image Audits'],
  summary: 'Get audit by ID',
  description: 'Get a single image generation audit record by ID (admin only)',
  operationId: 'adminGetImageAudit',
  request: {
    params: z.object({
      auditId: z.string().openapi({ description: 'Audit ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Audit record',
      content: {
        'application/json': {
          schema: AuditRecordSchema,
        },
      },
    },
    404: {
      description: 'Audit not found',
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

imageAuditAdminRoutes.openapi(getAuditRoute, async (c) => {
  const db = c.get('db');
  const { auditId } = c.req.valid('param');

  const audit = await imageAuditService.getById(db, auditId);
  if (!audit) {
    return c.json({ error: 'Audit not found' }, 404);
  }

  return c.json(
    {
      id: audit.id,
      userId: audit.userId,
      username: audit.username,
      profileId: audit.profileId,
      profileName: audit.profileName,
      prompt: audit.prompt,
      referenceImageUrls: audit.referenceImageUrls,
      outputImageUrls: audit.outputImageUrls,
      creditCost: audit.creditCost,
      status: audit.status,
      message: audit.message,
      createdAt: audit.createdAt.toISOString(),
    },
    200
  );
});

// Get usage statistics
const getStatsRoute = createRoute({
  method: 'get',
  path: '/stats/summary',
  tags: ['Admin - Image Audits'],
  summary: 'Get usage statistics',
  description: 'Get aggregated usage statistics for image generation (admin only)',
  operationId: 'adminGetImageAuditStats',
  request: {
    query: StatsQuerySchema,
  },
  responses: {
    200: {
      description: 'Usage statistics',
      content: {
        'application/json': {
          schema: AuditStatsSchema,
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

imageAuditAdminRoutes.openapi(getStatsRoute, async (c) => {
  const db = c.get('db');
  const query = c.req.valid('query');

  const stats = await imageAuditService.getStats(db, {
    startDate: query.startDate ? new Date(query.startDate) : undefined,
    endDate: query.endDate ? new Date(query.endDate) : undefined,
  });

  return c.json(stats, 200);
});
