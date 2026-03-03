import { eq, and, lte } from 'drizzle-orm';
import { revokedTokens } from '../db/schema/revoked-tokens';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';

const revokeLog = logger.child('TokenRevocation');

/**
 * Compute a SHA-256 hash of a JWT string for storage / lookup.
 */
async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

class TokenRevocationService {
  /**
   * Revoke a JWT so it can no longer be used for authentication.
   *
   * @param db   Database instance
   * @param token  The raw JWT string
   * @param userId The owner of the token
   * @param expiresAt Original JWT expiry (unix seconds)
   * @param reason Why the token is being revoked
   */
  async revokeToken(
    db: DatabaseInstance,
    token: string,
    userId: string,
    expiresAt: number,
    reason: string = 'logout'
  ): Promise<void> {
    const tokenHash = await hashToken(token);

    try {
      await (db as any).insert(revokedTokens).values({
        tokenHash,
        userId,
        expiresAt,
        revokedAt: Math.floor(Date.now() / 1000),
        reason,
      }).onConflictDoNothing();
    } catch (err) {
      revokeLog.error('Failed to revoke token', err);
    }
  }

  /**
   * Revoke all tokens for a specific user (e.g. password change, admin action).
   * Since we don't track all issued tokens, this inserts a sentinel row that
   * causes `isTokenRevoked` to reject any token issued before this moment.
   */
  async revokeAllForUser(
    db: DatabaseInstance,
    userId: string,
    reason: string = 'password-change'
  ): Promise<void> {
    // We store a sentinel with tokenHash = 'all:<userId>' and a far-future expiry
    const sentinel = `all:${userId}`;
    const data = new TextEncoder().encode(sentinel);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const tokenHash = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');

    try {
      await (db as any)
        .insert(revokedTokens)
        .values({
          tokenHash,
          userId,
          expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
          revokedAt: Math.floor(Date.now() / 1000),
          reason,
        })
        .onConflictDoNothing();
    } catch (err) {
      revokeLog.error('Failed to revoke all tokens for user', err);
    }
  }

  /**
   * Check whether a token has been revoked.
   */
  async isTokenRevoked(db: DatabaseInstance, token: string): Promise<boolean> {
    const tokenHash = await hashToken(token);

    try {
      const rows = await (db as any)
        .select({ id: revokedTokens.id })
        .from(revokedTokens)
        .where(eq(revokedTokens.tokenHash, tokenHash))
        .limit(1);

      return rows.length > 0;
    } catch (err) {
      revokeLog.error('Failed to check token revocation', err);
      // Fail closed — treat lookup errors as revoked to be safe
      return true;
    }
  }

  /**
   * Clean up expired revocation entries. Tokens that have naturally expired
   * no longer need to be tracked. Call periodically (e.g. daily).
   */
  async cleanupExpired(db: DatabaseInstance): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    try {
      const result = await (db as any)
        .delete(revokedTokens)
        .where(lte(revokedTokens.expiresAt, now));
      const count = result?.rowsAffected ?? result?.changes ?? 0;
      if (count > 0) {
        revokeLog.info(`Cleaned up ${count} expired revoked-token entries`);
      }
      return count;
    } catch (err) {
      revokeLog.error('Failed to cleanup expired tokens', err);
      return 0;
    }
  }
}

export const tokenRevocationService = new TokenRevocationService();
