/**
 * One-time sign-in codes for the provider OAuth callback → SPA exchange hop.
 * See db/schema/oauth-login-codes.ts for why these live in the database.
 */

import { and, eq, isNull, lt } from 'drizzle-orm';
import { oauthLoginCodes } from '../db/schema/oauth-login-codes';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';

const log = logger.child('OAuthLoginCode');

/** How long the browser has to complete the exchange after the redirect. */
export const LOGIN_CODE_TTL_MS = 60_000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class OauthLoginCodeService {
  /**
   * Issue a code for `userId`. Returns the raw code to put in the redirect;
   * only its hash is stored. Expired rows are pruned opportunistically.
   */
  async issue(db: DatabaseInstance, userId: string): Promise<string> {
    const now = Date.now();
    try {
      await db.delete(oauthLoginCodes).where(lt(oauthLoginCodes.expiresAt, now));
    } catch (error) {
      log.warn('Failed to prune expired login codes', { error });
    }
    const code = randomCode();
    await db.insert(oauthLoginCodes).values({
      userId,
      codeHash: await sha256Hex(code),
      expiresAt: now + LOGIN_CODE_TTL_MS,
      createdAt: now,
    });
    return code;
  }

  /**
   * Redeem a code exactly once. Returns the user id it was issued for, or
   * null when the code is unknown, already used or expired. Marking it used
   * is a conditional update, so two concurrent redemptions cannot both win.
   */
  async redeem(db: DatabaseInstance, code: string): Promise<string | null> {
    const now = Date.now();
    const codeHash = await sha256Hex(code);
    const claimed = await db
      .update(oauthLoginCodes)
      .set({ usedAt: now })
      .where(and(eq(oauthLoginCodes.codeHash, codeHash), isNull(oauthLoginCodes.usedAt)))
      .returning();
    const row = claimed[0];
    if (!row) return null;
    if (row.expiresAt <= now) {
      log.info('Rejected expired login code', { userId: row.userId });
      return null;
    }
    return row.userId;
  }
}

export const oauthLoginCodeService = new OauthLoginCodeService();
