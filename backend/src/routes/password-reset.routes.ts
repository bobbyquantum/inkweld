import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { passwordResetService } from '../services/password-reset.service';
import { getPasswordPolicy, validatePassword } from '../services/password-validation.service';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';
import type { AppContext } from '../types/context';

const passwordResetRoutes = new OpenAPIHono<AppContext>();

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
              email: z.string().email().openapi({
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
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid request',
    },
  },
});

passwordResetRoutes.openapi(forgotPasswordRoute, async (c) => {
  const db = c.get('db');
  const { email } = c.req.valid('json');

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
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid or expired reset token',
    },
  },
});

passwordResetRoutes.openapi(resetPasswordRoute, async (c) => {
  const db = c.get('db');
  const { token, newPassword } = c.req.valid('json');

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
