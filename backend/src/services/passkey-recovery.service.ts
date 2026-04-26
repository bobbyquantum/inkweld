import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, and, lt, isNotNull, isNull, or } from 'drizzle-orm';
import { passkeyRecoveryTokens, type PasskeyRecoveryToken, userPasskeys } from '../db/schema';
import { userService } from './user.service';
import { emailService } from './email.service';
import { configService } from './config.service';
import { passkeyService } from './passkey.service';
import { passkeyRecoveryEmail } from './email-templates';
import { logger } from './logger.service';
import { getBaseUrl } from './url.service';
import type { DatabaseInstance } from '../types/context';
import type { PasskeyRpConfig } from './passkey.service';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

/**
 * Token validity in seconds. Recovery tokens are intentionally short-lived
 * (15 min) — long enough to receive an email and click through, short
 * enough to limit blast radius if the email is intercepted. Compare with
 * password-reset tokens (1h): there the user has to choose+confirm a new
 * password, here they only have to tap a fingerprint, so 15min suffices.
 */
const TOKEN_EXPIRY_SECONDS = 900;
const TOKEN_EXPIRY_MINUTES = TOKEN_EXPIRY_SECONDS / 60;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function safeCompareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Validate a raw recovery token and return the underlying record + user.
 * Does NOT mark the token as used — that happens only after the WebAuthn
 * registration verifies (so a network failure mid-ceremony doesn't burn
 * the token). Returns `null` for any failure (expired, used, unknown,
 * email mismatch) without leaking which.
 */
async function loadValidToken(
  db: DatabaseInstance,
  rawToken: string
): Promise<PasskeyRecoveryToken | null> {
  const tokenHash = hashToken(rawToken);
  const now = Math.floor(Date.now() / 1000);

  const records = await db
    .select()
    .from(passkeyRecoveryTokens)
    .where(eq(passkeyRecoveryTokens.tokenHash, tokenHash))
    .limit(1);

  const record = records[0];
  if (!record) return null;
  if (!safeCompareHashes(record.tokenHash, tokenHash)) return null;
  if (record.expiresAt < now) return null;
  if (record.usedAt !== null) return null;

  return record;
}

class PasskeyRecoveryService {
  /**
   * Issue a recovery email to the address provided. Always returns the
   * same shape regardless of outcome (prevent enumeration). The route is
   * additionally gated on `EMAIL_RECOVERY_ENABLED` and (typically)
   * `!PASSWORD_LOGIN_ENABLED` at the route layer — this service trusts
   * its caller to have checked.
   */
  async requestRecovery(
    db: DatabaseInstance,
    email: string
  ): Promise<{ success: boolean; emailSent: boolean; error?: string }> {
    const user = await userService.findByEmail(db, email);

    if (!user) {
      // Don't log the email itself (PII / GDPR). The fact that *some*
      // unknown address was probed is enough for ops; the address itself
      // would just leak through log aggregation.
      logger.info('PasskeyRecovery', 'Recovery requested for unknown email');
      return { success: true, emailSent: false };
    }

    const emailEnabled = await emailService.isEnabled(db);
    if (!emailEnabled) {
      logger.warn('PasskeyRecovery', 'Recovery requested but email is disabled', {
        userId: user.id,
      });
      return { success: true, emailSent: false };
    }

    // Burn any pending tokens for this user — we only allow one outstanding
    // recovery link at a time, so a fresh request invalidates the previous
    // one (which limits the window of risk if a request was a typo/phish).
    await db.delete(passkeyRecoveryTokens).where(eq(passkeyRecoveryTokens.userId, user.id));

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passkeyRecoveryTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: now + TOKEN_EXPIRY_SECONDS,
      createdAt: now,
    });

    const baseUrl = await getBaseUrl(db);
    // Frontend route: /recover-passkey/redeem (request page lives at
    // /recover-passkey without a token). The redemption page parses ?token=
    // from the query string — using a query param rather than a path param
    // mirrors /reset-password and lets operators reuse log-redaction rules
    // already configured for password-reset links.
    const recoveryUrl = `${baseUrl}/recover-passkey/redeem?token=${rawToken}`;

    const emailResult = await emailService.sendEmail(db, {
      ...passkeyRecoveryEmail({
        userName: user.name || user.username || 'User',
        recoveryUrl,
        expiresInMinutes: TOKEN_EXPIRY_MINUTES,
      }),
      to: user.email || email,
    });

    if (!emailResult.success) {
      logger.error('PasskeyRecovery', 'Failed to send recovery email', undefined, {
        userId: user.id,
        error: emailResult.error || 'unknown',
      });
    }

    return { success: true, emailSent: emailResult.success, error: emailResult.error };
  }

  /**
   * Step 1 of redemption: validate the token and return WebAuthn
   * registration options. The token is NOT marked used here — only after
   * the matching `redeemFinish` completes successfully. This lets the
   * client retry the WebAuthn ceremony on transient failures (user
   * cancels biometric prompt, browser bug, etc.) without burning the
   * link prematurely.
   */
  async redeemStart(
    db: DatabaseInstance,
    rawToken: string,
    rp: PasskeyRpConfig
  ): Promise<
    | { success: true; options: PublicKeyCredentialCreationOptionsJSON }
    | { success: false; error: string }
  > {
    const record = await loadValidToken(db, rawToken);
    if (!record) {
      return { success: false, error: 'Invalid or expired recovery link' };
    }

    const user = await userService.findById(db, record.userId);
    if (!user) {
      // Token references a deleted user — should be impossible thanks to
      // FK ON DELETE CASCADE, but defend anyway.
      return { success: false, error: 'Invalid or expired recovery link' };
    }

    const options = await passkeyService.startRegistration(db, user, rp);
    return { success: true, options };
  }

  /**
   * Step 2 of redemption: verify the WebAuthn registration response,
   * persist the new passkey, and (only if everything succeeded) burn
   * the recovery token. Existing passkeys for the user are intentionally
   * preserved — this flow ADDS a credential, it does not replace them.
   */
  async redeemFinish(
    db: DatabaseInstance,
    rawToken: string,
    response: RegistrationResponseJSON,
    rp: PasskeyRpConfig,
    label?: string
  ): Promise<{
    success: boolean;
    userId?: string;
    passkey?: import('../db/schema').UserPasskey;
    error?: string;
  }> {
    const record = await loadValidToken(db, rawToken);
    if (!record) {
      return { success: false, error: 'Invalid or expired recovery link' };
    }

    const user = await userService.findById(db, record.userId);
    if (!user) {
      return { success: false, error: 'Invalid or expired recovery link' };
    }

    const result = await passkeyService.finishRegistration(db, user, response, rp, label);
    if (!result.verified || !result.passkey) {
      // Don't burn the token on WebAuthn failure — let the client retry.
      // (The token's natural expiry caps the retry window.)
      return { success: false, error: result.error || 'Passkey registration failed' };
    }

    // Burn the token now that we've successfully added a credential. The
    // `isNull(usedAt)` predicate makes the update conditional on the token
    // still being unused at the moment of the write — combined with SQLite's
    // row-level locking this gives us atomic single-use semantics even if
    // two finish requests race past `loadValidToken` simultaneously.
    const now = Math.floor(Date.now() / 1000);
    const burnResult = await db
      .update(passkeyRecoveryTokens)
      .set({ usedAt: now })
      .where(and(eq(passkeyRecoveryTokens.id, record.id), isNull(passkeyRecoveryTokens.usedAt)))
      .returning();

    if (burnResult.length === 0) {
      // Someone else burned it between our load and update. The passkey
      // was already inserted, so this is a no-op as far as the user is
      // concerned, but log it so we notice if it happens systematically.
      logger.warn('PasskeyRecovery', 'Token burn raced with concurrent redeem', {
        tokenId: record.id,
      });
    }

    logger.info('PasskeyRecovery', 'Passkey enrolment via recovery succeeded', {
      userId: user.id,
    });
    return { success: true, userId: user.id, passkey: result.passkey };
  }

  /**
   * Periodic cleanup mirroring password-reset.service.cleanup. Removes
   * expired tokens immediately and used tokens older than 24 hours
   * (keeping recently-used ones briefly aids debugging).
   */
  async cleanup(db: DatabaseInstance): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    const result = await db
      .delete(passkeyRecoveryTokens)
      .where(
        or(
          lt(passkeyRecoveryTokens.expiresAt, now),
          and(isNotNull(passkeyRecoveryTokens.usedAt), lt(passkeyRecoveryTokens.usedAt, oneDayAgo))
        )
      );

    const deleted = (result as unknown as { changes?: number })?.changes ?? 0;
    if (deleted > 0) {
      logger.info('PasskeyRecovery', `Cleaned up ${deleted} expired/used tokens`);
    }
    return deleted;
  }

  /**
   * Returns true if recovery is currently usable on this server. The
   * route layer should call this and 404 when false. We accept a "lenient"
   * mode for the password-still-on case (recovery available but redundant
   * with /forgot-password) — callers decide; this just answers "is the
   * email pipeline enabled and the flag on?".
   */
  async isAvailable(db: DatabaseInstance): Promise<boolean> {
    const enabled = await configService.getBoolean(db, 'EMAIL_RECOVERY_ENABLED');
    if (!enabled) return false;
    return await emailService.isEnabled(db);
  }

  /** Test helper: count of pending (unused, unexpired) tokens for a user. */
  async _countActiveTokensForUser(db: DatabaseInstance, userId: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const rows = await db
      .select()
      .from(passkeyRecoveryTokens)
      .where(eq(passkeyRecoveryTokens.userId, userId));
    return rows.filter((r) => r.usedAt === null && r.expiresAt >= now).length;
  }

  /** Test helper: count credentials registered for a user. */
  async _countCredentialsForUser(db: DatabaseInstance, userId: string): Promise<number> {
    const rows = await db.select().from(userPasskeys).where(eq(userPasskeys.userId, userId));
    return rows.length;
  }
}

export const passkeyRecoveryService = new PasskeyRecoveryService();
