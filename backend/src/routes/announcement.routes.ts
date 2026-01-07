import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  announcementService,
  type AnnouncementWithReadStatus,
} from '../services/announcement.service';
import type { Announcement } from '../db/schema';
import type { AppContext } from '../types/context';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';
import { UnauthorizedError } from '../errors';

// Schemas
const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  type: z.enum(['announcement', 'update', 'maintenance']),
  priority: z.enum(['low', 'normal', 'high']),
  isPublic: z.boolean(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
});

const AnnouncementWithReadStatusSchema = AnnouncementSchema.extend({
  isRead: z.boolean(),
  readAt: z.string().nullable(),
});

const AnnouncementListSchema = z.array(AnnouncementSchema);
const AnnouncementWithReadStatusListSchema = z.array(AnnouncementWithReadStatusSchema);

const AnnouncementIdParamsSchema = z.object({
  announcementId: z.string().openapi({ example: 'abc-123', description: 'Announcement ID' }),
});

const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  type: z.enum(['announcement', 'update', 'maintenance']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  isPublic: z.boolean().optional(),
  publishedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

const UpdateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(['announcement', 'update', 'maintenance']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  isPublic: z.boolean().optional(),
  publishedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

const UnreadCountSchema = z.object({
  count: z.number(),
});

// Helper to format announcement response
function formatAnnouncementResponse(announcement: Announcement | AnnouncementWithReadStatus) {
  const isRead =
    'isRead' in announcement ? (announcement as AnnouncementWithReadStatus).isRead : false;
  const readAt =
    'readAt' in announcement ? (announcement as AnnouncementWithReadStatus).readAt : null;

  return {
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    type: announcement.type,
    priority: announcement.priority,
    isPublic: announcement.isPublic,
    publishedAt:
      announcement.publishedAt instanceof Date
        ? announcement.publishedAt.toISOString()
        : announcement.publishedAt || null,
    expiresAt:
      announcement.expiresAt instanceof Date
        ? announcement.expiresAt.toISOString()
        : announcement.expiresAt || null,
    createdAt:
      announcement.createdAt instanceof Date
        ? (announcement.createdAt as Date).toISOString()
        : (announcement.createdAt as string),
    updatedAt:
      announcement.updatedAt instanceof Date
        ? (announcement.updatedAt as Date).toISOString()
        : (announcement.updatedAt as string),
    createdBy: announcement.createdBy,
    isRead,
    readAt: readAt instanceof Date ? readAt.toISOString() : null,
  };
}

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

export const publicAnnouncementRoutes = new OpenAPIHono<AppContext>();

const listPublicAnnouncementsRoute = createRoute({
  method: 'get',
  path: '/public',
  tags: ['Announcements'],
  summary: 'List public announcements',
  description: 'Get a list of published public announcements (no authentication required)',
  operationId: 'listPublicAnnouncements',
  responses: {
    200: {
      description: 'List of public announcements',
      content: {
        'application/json': {
          schema: AnnouncementListSchema,
        },
      },
    },
  },
});

publicAnnouncementRoutes.openapi(listPublicAnnouncementsRoute, async (c) => {
  const db = c.get('db');
  const announcements = await announcementService.listPublished(db, { publicOnly: true });
  return c.json(announcements.map(formatAnnouncementResponse), 200);
});

// ============================================
// AUTHENTICATED USER ROUTES
// ============================================

export const announcementRoutes = new OpenAPIHono<AppContext>();
announcementRoutes.use('*', requireAuth);

const listAnnouncementsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Announcements'],
  summary: 'List announcements',
  description: 'Get a list of published announcements with read status for the current user',
  operationId: 'listAnnouncements',
  responses: {
    200: {
      description: 'List of announcements with read status',
      content: {
        'application/json': {
          schema: AnnouncementWithReadStatusListSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getUnreadCountRoute = createRoute({
  method: 'get',
  path: '/unread-count',
  tags: ['Announcements'],
  summary: 'Get unread count',
  description: 'Get the count of unread announcements for the current user',
  operationId: 'getUnreadAnnouncementCount',
  responses: {
    200: {
      description: 'Unread count',
      content: {
        'application/json': {
          schema: UnreadCountSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const markAsReadRoute = createRoute({
  method: 'post',
  path: '/{announcementId}/read',
  tags: ['Announcements'],
  summary: 'Mark as read',
  description: 'Mark an announcement as read for the current user',
  operationId: 'markAnnouncementAsRead',
  request: {
    params: AnnouncementIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Announcement marked as read',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Announcement not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const markAllAsReadRoute = createRoute({
  method: 'post',
  path: '/read-all',
  tags: ['Announcements'],
  summary: 'Mark all as read',
  description: 'Mark all announcements as read for the current user',
  operationId: 'markAllAnnouncementsAsRead',
  responses: {
    200: {
      description: 'All announcements marked as read',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Authenticated route handlers
announcementRoutes.openapi(listAnnouncementsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated');

  const announcements = await announcementService.listPublishedWithReadStatus(db, user.id);
  return c.json(announcements.map(formatAnnouncementResponse), 200);
});

announcementRoutes.openapi(getUnreadCountRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated');

  const count = await announcementService.getUnreadCount(db, user.id);
  return c.json({ count }, 200);
});

announcementRoutes.openapi(markAsReadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated');

  const { announcementId } = c.req.valid('param');

  const announcement = await announcementService.findById(db, announcementId);
  if (!announcement) {
    return c.json({ error: 'Announcement not found' }, 404);
  }

  await announcementService.markAsRead(db, announcementId, user.id);
  return c.json({ message: 'Announcement marked as read' }, 200);
});

announcementRoutes.openapi(markAllAsReadRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated');

  await announcementService.markAllAsRead(db, user.id);
  return c.json({ message: 'All announcements marked as read' }, 200);
});

// ============================================
// ADMIN ROUTES
// ============================================

export const adminAnnouncementRoutes = new OpenAPIHono<AppContext>();
adminAnnouncementRoutes.use('*', requireAdmin);

const adminListAnnouncementsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin'],
  summary: 'List all announcements',
  description: 'Get a list of all announcements including drafts (admin only)',
  operationId: 'adminListAnnouncements',
  responses: {
    200: {
      description: 'List of all announcements',
      content: {
        'application/json': {
          schema: AnnouncementListSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const adminCreateAnnouncementRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Admin'],
  summary: 'Create announcement',
  description: 'Create a new announcement (admin only)',
  operationId: 'adminCreateAnnouncement',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAnnouncementSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Announcement created',
      content: {
        'application/json': {
          schema: AnnouncementSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const adminGetAnnouncementRoute = createRoute({
  method: 'get',
  path: '/{announcementId}',
  tags: ['Admin'],
  summary: 'Get announcement',
  description: 'Get a single announcement by ID (admin only)',
  operationId: 'adminGetAnnouncement',
  request: {
    params: AnnouncementIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Announcement details',
      content: {
        'application/json': {
          schema: AnnouncementSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Announcement not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const adminUpdateAnnouncementRoute = createRoute({
  method: 'put',
  path: '/{announcementId}',
  tags: ['Admin'],
  summary: 'Update announcement',
  description: 'Update an existing announcement (admin only)',
  operationId: 'adminUpdateAnnouncement',
  request: {
    params: AnnouncementIdParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateAnnouncementSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Announcement updated',
      content: {
        'application/json': {
          schema: AnnouncementSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Announcement not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const adminDeleteAnnouncementRoute = createRoute({
  method: 'delete',
  path: '/{announcementId}',
  tags: ['Admin'],
  summary: 'Delete announcement',
  description: 'Delete an announcement (admin only)',
  operationId: 'adminDeleteAnnouncement',
  request: {
    params: AnnouncementIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Announcement deleted',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Announcement not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const adminPublishAnnouncementRoute = createRoute({
  method: 'post',
  path: '/{announcementId}/publish',
  tags: ['Admin'],
  summary: 'Publish announcement',
  description: 'Publish a draft announcement (admin only)',
  operationId: 'adminPublishAnnouncement',
  request: {
    params: AnnouncementIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Announcement published',
      content: {
        'application/json': {
          schema: AnnouncementSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Announcement not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const adminUnpublishAnnouncementRoute = createRoute({
  method: 'post',
  path: '/{announcementId}/unpublish',
  tags: ['Admin'],
  summary: 'Unpublish announcement',
  description: 'Unpublish an announcement (convert to draft) (admin only)',
  operationId: 'adminUnpublishAnnouncement',
  request: {
    params: AnnouncementIdParamsSchema,
  },
  responses: {
    200: {
      description: 'Announcement unpublished',
      content: {
        'application/json': {
          schema: AnnouncementSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Announcement not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Admin route handlers
adminAnnouncementRoutes.openapi(adminListAnnouncementsRoute, async (c) => {
  const db = c.get('db');
  const announcements = await announcementService.listAll(db);
  return c.json(announcements.map(formatAnnouncementResponse), 200);
});

adminAnnouncementRoutes.openapi(adminCreateAnnouncementRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated');
  const data = c.req.valid('json');

  const announcement = await announcementService.create(
    db,
    {
      ...data,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
    user.id
  );
  return c.json(formatAnnouncementResponse(announcement), 201);
});

adminAnnouncementRoutes.openapi(adminGetAnnouncementRoute, async (c) => {
  const db = c.get('db');
  const { announcementId } = c.req.valid('param');

  const announcement = await announcementService.findById(db, announcementId);
  if (!announcement) {
    return c.json({ error: 'Announcement not found' }, 404);
  }

  return c.json(formatAnnouncementResponse(announcement), 200);
});

adminAnnouncementRoutes.openapi(adminUpdateAnnouncementRoute, async (c) => {
  const db = c.get('db');
  const { announcementId } = c.req.valid('param');
  const data = c.req.valid('json');

  const existing = await announcementService.findById(db, announcementId);
  if (!existing) {
    return c.json({ error: 'Announcement not found' }, 404);
  }

  const announcement = await announcementService.update(db, announcementId, {
    ...data,
    publishedAt:
      data.publishedAt !== undefined
        ? data.publishedAt
          ? new Date(data.publishedAt)
          : null
        : undefined,
    expiresAt:
      data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : undefined,
  });
  return c.json(formatAnnouncementResponse(announcement), 200);
});

adminAnnouncementRoutes.openapi(adminDeleteAnnouncementRoute, async (c) => {
  const db = c.get('db');
  const { announcementId } = c.req.valid('param');

  const existing = await announcementService.findById(db, announcementId);
  if (!existing) {
    return c.json({ error: 'Announcement not found' }, 404);
  }

  await announcementService.delete(db, announcementId);
  return c.json({ message: 'Announcement deleted' }, 200);
});

adminAnnouncementRoutes.openapi(adminPublishAnnouncementRoute, async (c) => {
  const db = c.get('db');
  const { announcementId } = c.req.valid('param');

  const existing = await announcementService.findById(db, announcementId);
  if (!existing) {
    return c.json({ error: 'Announcement not found' }, 404);
  }

  const announcement = await announcementService.publish(db, announcementId);
  return c.json(formatAnnouncementResponse(announcement), 200);
});

adminAnnouncementRoutes.openapi(adminUnpublishAnnouncementRoute, async (c) => {
  const db = c.get('db');
  const { announcementId } = c.req.valid('param');

  const existing = await announcementService.findById(db, announcementId);
  if (!existing) {
    return c.json({ error: 'Announcement not found' }, 404);
  }

  const announcement = await announcementService.unpublish(db, announcementId);
  return c.json(formatAnnouncementResponse(announcement), 200);
});
