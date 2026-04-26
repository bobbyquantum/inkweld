import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { passwordResetService } from '../services/password-reset.service';
import { configService } from '../services/config.service';
import { getPasswordPolicy, validatePassword } from '../services/password-validation.service';
import { errorResponse, MessageResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';

const passwordResetRoutes = new OpenAPIHono<AppContext>();

/**
 * Both routes in this file are gated on PASSWORD_LOGIN_ENABLED. A fully
 * passwordless deployment has no password to reset, so we 404 these endpoints
 * rather than expose a misleading "no account with that email" response. The
 * frontend already hides the "forgot password" link when passwords are off,
 * but defence-in-depth lives here.
 */

// ---------------------------------------------------------------------------
// POST /forgot-password — request a password reset
// ---------------------------------------------------------------------------
const forgotPasswordRoute = createRoute({
  method: 'post',
  path: '/forgot-password',
  tags: ['Authentication'],
  operationId: 'forgotPassword',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              email: z.email().openapi({
                description: 'Email address associated with the account',
                example: 'user@example.com',
              }),
            })
            .openapi('ForgotPasswordRequest'),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
      description: 'If an account with this email exists, a password reset link has been sent.',
    },
    400: errorResponse('Invalid request'),
    404: errorResponse('Password login is disabled on this server'),
  },
});

passwordResetRoutes.openapi(forgotPasswordRoute, async (c) => {
  const db = c.get('db');
  const { email } = c.req.valid('json');

  // Defence-in-depth gate: see file-level comment.
  if (!(await configService.getBoolean(db, 'PASSWORD_LOGIN_ENABLED'))) {
    return c.json({ error: 'Password login is disabled on this server' }, 404);
  }

  // Always return the same response regardless of outcome (prevent enumeration)
  await passwordResetService.requestReset(db, email);

  return c.json(
    {
      message: 'If an account with this email exists, a password reset link has been sent.',
    },
    200
  );
});

// ---------------------------------------------------------------------------
// POST /reset-password — reset password with token
// ---------------------------------------------------------------------------
const resetPasswordRoute = createRoute({
  method: 'post',
  path: '/reset-password',
  tags: ['Authentication'],
  operationId: 'resetPassword',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              token: z.string().min(1).openapi({
                description: 'Password reset token from the emailed link',
                example: 'abc123...',
              }),
              newPassword: z.string().min(1).openapi({
                description: 'New password (must meet configured password policy)',
                example: 'newSecurePassword',
              }),
            })
            .openapi('ResetPasswordRequest'),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
      description: 'Password has been reset successfully',
    },
    400: errorResponse('Invalid or expired reset token'),
    404: errorResponse('Password login is disabled on this server'),
  },
});

passwordResetRoutes.openapi(resetPasswordRoute, async (c) => {
  const db = c.get('db');
  const { token, newPassword } = c.req.valid('json');

  // Defence-in-depth gate: see file-level comment.
  if (!(await configService.getBoolean(db, 'PASSWORD_LOGIN_ENABLED'))) {
    return c.json({ error: 'Password login is disabled on this server' }, 404);
  }

  // Validate password against configured policy
  const passwordPolicy = await getPasswordPolicy(db);
  const passwordErrors = validatePassword(newPassword, passwordPolicy);
  if (passwordErrors.length > 0) {
    return c.json({ error: passwordErrors[0] }, 400);
  }

  const result = await passwordResetService.resetPassword(db, token, newPassword);

  if (!result.success) {
    return c.json({ error: result.error || 'Invalid or expired reset link' }, 400);
  }

  return c.json({ message: 'Password has been reset successfully' }, 200);
});

export default passwordResetRoutes;
