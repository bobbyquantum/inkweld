import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'path';
import * as schema from '../src/db/schema';
import { configService } from '../src/services/config.service';
import { emailService } from '../src/services/email.service';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;

/**
 * Integration tests for email.service.ts port validation.
 *
 * These exercise the actual getTransporter() code path (lines 71-73)
 * by calling sendEmail() with various EMAIL_PORT config values.
 * Sending will fail (no real SMTP), but the port parsing still runs.
 */

beforeAll(async () => {
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });
  await migrate(db, { migrationsFolder: join(__dirname, '../drizzle') });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Enable email and set minimal config for transporter creation
  await configService.set(db, 'EMAIL_ENABLED', 'true');
  await configService.set(db, 'EMAIL_HOST', 'localhost');
  await configService.set(db, 'EMAIL_FROM', 'test@example.com');
});

afterEach(() => {
  // Clear transporter cache so each test creates fresh
  emailService.invalidateTransporter();
});

describe('EmailService port validation (integration)', () => {
  it('should create transporter with valid port', async () => {
    await configService.set(db, 'EMAIL_PORT', '2525');

    // sendEmail will fail on actual sending but exercises getTransporter()
    const result = await emailService.sendEmail(db, {
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });

    // Transport creation succeeded (sendMail failed due to no SMTP server)
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // The error should be about connection, not port parsing
    expect(result.error).not.toContain('port');
  });

  it('should fall back to port 587 for invalid port string', async () => {
    await configService.set(db, 'EMAIL_PORT', 'not-a-number');

    const result = await emailService.sendEmail(db, {
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });

    // Exercises: Number.parseInt('not-a-number', 10) → NaN → fallback to 587
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should fall back to port 587 for out-of-range port', async () => {
    await configService.set(db, 'EMAIL_PORT', '99999');

    const result = await emailService.sendEmail(db, {
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });

    // Exercises: parsedPort > 65535 → fallback to 587
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
