import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { passwordResetTokens, users } from '../src/db/schema/index';
import { configService } from '../src/services/config.service';
import { passwordResetService } from '../src/services/password-reset.service';
import type { DatabaseInstance } from '../src/types/context';
import { startTestServer, stopTestServer } from './server-test-helper';

/**
 * Anyone can ask for a reset link for any address. Without a per-account
 * cooldown that mails the owner over and over, and each request invalidates
 * the link sent before it.
 */
describe('password reset resend cooldown', () => {
  let db: DatabaseInstance;
  const userId = crypto.randomUUID();
  const email = 'reset-cooldown@example.com';

  beforeAll(async () => {
    await startTestServer();
    db = getDatabase() as unknown as DatabaseInstance;
    await db.insert(users).values({
      id: userId,
      username: 'reset-cooldown',
      email,
      approved: true,
      enabled: true,
    });
    await configService.set(db, 'EMAIL_ENABLED', 'true');
  });

  afterAll(async () => {
    await configService.delete(db, 'EMAIL_ENABLED');
    await db.delete(users).where(eq(users.id, userId));
    await stopTestServer();
  });

  async function plantToken(ageSeconds: number): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    const now = Math.floor(Date.now() / 1000);
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: 'planted'.padEnd(64, '0'),
      expiresAt: now + 3600,
      createdAt: now - ageSeconds,
    });
  }

  async function tokenHashes(): Promise<string[]> {
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    return rows.map((row) => row.tokenHash);
  }

  it('sends nothing and keeps the last link within a minute of it', async () => {
    await plantToken(5);
    expect(await passwordResetService.requestReset(db, email)).toEqual({
      success: true,
      emailSent: false,
    });
    expect(await tokenHashes()).toEqual(['planted'.padEnd(64, '0')]);
  });

  it('issues a new link once the cooldown has passed', async () => {
    await plantToken(120);
    await passwordResetService.requestReset(db, email);
    const hashes = await tokenHashes();
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).not.toBe('planted'.padEnd(64, '0'));
  });
});
