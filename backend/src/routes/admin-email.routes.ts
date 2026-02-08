import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { requireAdmin } from '../middleware/auth';
import { emailService } from '../services/email.service';
import { ErrorResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';

const adminEmailRoutes = new OpenAPIHono<AppContext>();

// Require admin for all routes
adminEmailRoutes.use('*', requireAdmin);

// ---------------------------------------------------------------------------
// POST /test — send a test email to the logged-in admin
// ---------------------------------------------------------------------------
const sendTestEmailRoute = createRoute({
  method: 'post',
  path: '/test',
  tags: ['Admin'],
  operationId: 'adminSendTestEmail',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.boolean(),
              message: z.string(),
            })
            .openapi('TestEmailResponse'),
        },
      },
      description: 'Test email result',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Email not configured or user has no email',
    },
  },
});

adminEmailRoutes.openapi(sendTestEmailRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user?.email) {
    return c.json({ error: 'Your account does not have an email address configured' }, 400);
  }

  // Invalidate transporter to pick up any recent config changes
  emailService.invalidateTransporter();

  const result = await emailService.sendTestEmail(db, user.email);

  if (result.success) {
    return c.json({ success: true, message: `Test email sent to ${user.email}` }, 200);
  } else {
    return c.json({ success: false, message: `Failed to send test email: ${result.error}` }, 200);
  }
});

export { adminEmailRoutes };
