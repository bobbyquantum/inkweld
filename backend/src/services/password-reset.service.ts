import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { eq, and, lt, isNotNull, or } from 'drizzle-orm';
import { passwordResetTokens } from '../db/schema';
import { userService } from './user.service';
import { emailService } from './email.service';
import { passwordResetRequestEmail, passwordResetConfirmEmail } from './email-templates';
import { logger } from './logger.service';
import { getBaseUrl } from './url.service';
import type { DatabaseInstance } from '../types/context';

/** Token validity in seconds (1 hour) */
const TOKEN_EXPIRY_SECONDS = 3600;
const TOKEN_EXPIRY_MINUTES = TOKEN_EXPIRY_SECONDS / 60;

/**
 * Hash a raw token using SHA-256.
 */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Constant-time comparison of two hex token hashes.
 */
function safeCompareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

class PasswordResetService {
  /**
   * Request a password reset.
   *
   * Always returns the same shape regardless of whether the user exists,
   * to prevent user enumeration.
   */
  async requestReset(
    db: DatabaseInstance,
    email: string
  ): Promise<{ success: boolean; emailSent: boolean; error?: string }> {
    // Look up user by email
    const user = await userService.findByEmail(db, email);

    if (!user) {
      // Don't reveal that the user doesn't exist
      logger.info('PasswordReset', 'Reset requested for unknown email', { email });
      return { success: true, emailSent: false };
    }

    // Check email is enabled
    const emailEnabled = await emailService.isEnabled(db);
    if (!emailEnabled) {
      logger.warn('PasswordReset', 'Reset requested but email is disabled', {
        userId: user.id,
      });
      return { success: true, emailSent: false };
    }

    // Delete any existing unused tokens for this user
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    // Generate a new token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: now + TOKEN_EXPIRY_SECONDS,
      createdAt: now,
    });

    // Build reset URL
    const baseUrl = await getBaseUrl(db);
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    // Send email
    const emailResult = await emailService.sendEmail(db, {
      ...passwordResetRequestEmail({
        userName: user.name || user.username || 'User',
        resetUrl,
        expiresInMinutes: TOKEN_EXPIRY_MINUTES,
      }),
      to: user.email || email,
    });

    if (!emailResult.success) {
      logger.error('PasswordReset', 'Failed to send reset email', undefined, {
        userId: user.id,
        error: emailResult.error || 'unknown',
      });
    }

    return { success: true, emailSent: emailResult.success, error: emailResult.error };
  }

  /**
   * Reset a user's password given a valid token.
   */
  async resetPassword(
    db: DatabaseInstance,
    rawToken: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    const tokenHash = hashToken(rawToken);
    const now = Math.floor(Date.now() / 1000);

    // Find the token
    const records = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    const record = records[0];
    if (!record) {
      logger.warn('PasswordReset', 'Reset attempted with invalid token');
      return { success: false, error: 'Invalid or expired reset link' };
    }

    // Constant-time comparison
    if (!safeCompareHashes(record.tokenHash, tokenHash)) {
      return { success: false, error: 'Invalid or expired reset link' };
    }

    // Check expiry
    if (record.expiresAt < now) {
      logger.info('PasswordReset', 'Reset attempted with expired token', { userId: record.userId });
      return { success: false, error: 'Invalid or expired reset link' };
    }

    // Check if already used
    if (record.usedAt !== null) {
      logger.info('PasswordReset', 'Reset attempted with already-used token', {
        userId: record.userId,
      });
      return { success: false, error: 'Invalid or expired reset link' };
    }

    // Mark token as used BEFORE updating password (single use)
    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, record.id));

    // Update the user's password
    await userService.updatePassword(db, record.userId, newPassword);

    logger.info('PasswordReset', 'Password reset successful', { userId: record.userId });

    // Send confirmation email (best-effort)
    const user = await userService.findById(db, record.userId);
    if (user?.email) {
      const baseUrl = await getBaseUrl(db);
      await emailService.sendEmail(db, {
        ...passwordResetConfirmEmail({
          userName: user.name || user.username || 'User',
          loginUrl: baseUrl,
        }),
        to: user.email,
      });
    }

    return { success: true };
  }

  /**
   * Clean up expired and used tokens.
   * Called on server start and periodically.
   */
  async cleanup(db: DatabaseInstance): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const result = await db.delete(passwordResetTokens).where(
      or(
        // Expired tokens
        lt(passwordResetTokens.expiresAt, now),
        // Used tokens older than 24 hours
        and(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.usedAt, oneDayAgo))
      )
    );

    // Drizzle returns { changes } on SQLite
    const deleted = (result as unknown as { changes?: number })?.changes ?? 0;
    if (deleted > 0) {
      logger.info('PasswordReset', `Cleaned up ${deleted} expired/used tokens`);
    }
    return deleted;
  }
}

export const passwordResetService = new PasswordResetService();
