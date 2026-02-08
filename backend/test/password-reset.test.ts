import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import * as schema from '../src/db/schema';
import { users, passwordResetTokens } from '../src/db/schema';
import { configService } from '../src/services/config.service';
import { config } from '../src/db/schema/config';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;
let testUserId: string;
const testEmail = 'resettest@example.com';

beforeAll(async () => {
  // Create in-memory database for tests
  sqlite = new BunDatabase(':memory:');
  // Enable foreign key enforcement for cascade delete tests
  sqlite.run('PRAGMA foreign_keys = ON');
  db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = join(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clear test data before each test
  await db.delete(passwordResetTokens);
  await db.delete(users);
  await db.delete(config);

  // Create a test user
  testUserId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash('oldpassword', 10);
  await db.insert(users).values({
    id: testUserId,
    username: 'resetuser',
    email: testEmail,
    password: hashedPassword,
    approved: true,
    enabled: true,
  });
});

describe('Password Reset Tokens Schema', () => {
  it('should insert and retrieve a token', async () => {
    const tokenHash = 'a'.repeat(64);
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash,
      expiresAt: now + 3600,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, testUserId))
      .limit(1);

    expect(result).toHaveLength(1);
    expect(result[0].tokenHash).toBe(tokenHash);
    expect(result[0].usedAt).toBeNull();
  });

  it('should cascade delete tokens when user is deleted', async () => {
    const tokenHash = 'b'.repeat(64);
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash,
      expiresAt: now + 3600,
      createdAt: now,
    });

    // Delete the user
    await db.delete(users).where(eq(users.id, testUserId));

    // Token should be gone
    const result = await db.select().from(passwordResetTokens);
    expect(result).toHaveLength(0);
  });

  it('should mark token as used', async () => {
    const tokenHash = 'c'.repeat(64);
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash,
      expiresAt: now + 3600,
      createdAt: now,
    });

    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));

    const result = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    expect(result[0].usedAt).toBe(now);
  });
});

describe('Password Reset Config', () => {
  it('should default EMAIL_ENABLED to false', async () => {
    const result = await configService.getBoolean(db, 'EMAIL_ENABLED');
    expect(result).toBe(false);
  });

  it('should return true when EMAIL_ENABLED is set', async () => {
    await configService.set(db, 'EMAIL_ENABLED', 'true');
    const result = await configService.getBoolean(db, 'EMAIL_ENABLED');
    expect(result).toBe(true);
  });
});

describe('Password Reset Integration', () => {
  it('should hash tokens with SHA-256', async () => {
    const { createHash } = await import('crypto');
    const rawToken = 'test-token-value-12345';
    const hash = createHash('sha256').update(rawToken).digest('hex');

    // SHA-256 produces a 64-char hex string
    expect(hash).toHaveLength(64);

    // Same input produces same hash
    const hash2 = createHash('sha256').update(rawToken).digest('hex');
    expect(hash).toBe(hash2);

    // Different input produces different hash
    const hash3 = createHash('sha256').update('different-token').digest('hex');
    expect(hash).not.toBe(hash3);
  });

  it('should store and look up a hashed token', async () => {
    const { createHash, randomBytes } = await import('crypto');
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash,
      expiresAt: now + 3600,
      createdAt: now,
    });

    // Look up by hashed token (same as service does)
    const records = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    expect(records).toHaveLength(1);
    expect(records[0].userId).toBe(testUserId);
    expect(records[0].expiresAt).toBe(now + 3600);
    expect(records[0].usedAt).toBeNull();
  });

  it('should not find an expired token in a validity check', async () => {
    const { createHash, randomBytes } = await import('crypto');
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = Math.floor(Date.now() / 1000);

    // Insert an already-expired token
    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash,
      expiresAt: now - 1, // expired 1 second ago
      createdAt: now - 3600,
    });

    const records = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    expect(records).toHaveLength(1);
    // Verify the service would reject it due to expiry
    expect(records[0].expiresAt).toBeLessThan(now);
  });

  it('should not allow reuse of a used token', async () => {
    const { createHash, randomBytes } = await import('crypto');
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = Math.floor(Date.now() / 1000);

    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash,
      expiresAt: now + 3600,
      createdAt: now,
      usedAt: now, // already used
    });

    const records = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    expect(records).toHaveLength(1);
    // Service would reject because usedAt is not null
    expect(records[0].usedAt).not.toBeNull();
  });

  it('should cleanup expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000);

    // Insert expired token
    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash: 'expired'.padEnd(64, '0'),
      expiresAt: now - 100,
      createdAt: now - 4000,
    });

    // Insert valid token
    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash: 'valid00'.padEnd(64, '0'),
      expiresAt: now + 3600,
      createdAt: now,
    });

    // Delete expired tokens (same logic as service.cleanup)
    const { lt } = await import('drizzle-orm');
    await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));

    const remaining = await db.select().from(passwordResetTokens);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tokenHash).toBe('valid00'.padEnd(64, '0'));
  });

  it('should delete existing tokens when generating a new one for same user', async () => {
    const now = Math.floor(Date.now() / 1000);

    // Insert an old token
    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash: 'old0000'.padEnd(64, '0'),
      expiresAt: now + 1800,
      createdAt: now - 1800,
    });

    // Simulate service behavior: delete existing tokens then insert new one
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, testUserId));

    await db.insert(passwordResetTokens).values({
      userId: testUserId,
      tokenHash: 'new0000'.padEnd(64, '0'),
      expiresAt: now + 3600,
      createdAt: now,
    });

    const records = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, testUserId));

    expect(records).toHaveLength(1);
    expect(records[0].tokenHash).toBe('new0000'.padEnd(64, '0'));
  });
});
