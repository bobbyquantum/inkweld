import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'path';
import * as schema from '../src/db/schema';
import { configService, type ConfigValue } from '../src/services/config.service';
import { config } from '../src/db/schema/config';
import { eq } from 'drizzle-orm';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;

beforeAll(async () => {
  // Create in-memory database for tests
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = join(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clear config table before each test
  await db.delete(config);
});

describe('ConfigService', () => {
  describe('get', () => {
    it('should return default value when not set in database or environment', async () => {
      const result = await configService.get(db, 'AI_KILL_SWITCH');

      expect(result.key).toBe('AI_KILL_SWITCH');
      expect(result.value).toBe('true'); // Default is true for safety
      expect(result.source).toBe('default');
      expect(result.encrypted).toBe(false);
    });

    it('should return database value when set', async () => {
      // Set value in database
      await configService.set(db, 'AI_KILL_SWITCH', 'false');

      const result = await configService.get(db, 'AI_KILL_SWITCH');

      expect(result.key).toBe('AI_KILL_SWITCH');
      expect(result.value).toBe('false');
      expect(result.source).toBe('database');
    });
  });

  describe('getBoolean', () => {
    it('should return true for "true" string', async () => {
      await configService.set(db, 'LOCAL_USERS_ENABLED', 'true');
      const result = await configService.getBoolean(db, 'LOCAL_USERS_ENABLED');
      expect(result).toBe(true);
    });

    it('should return true for "1" string', async () => {
      await configService.set(db, 'LOCAL_USERS_ENABLED', '1');
      const result = await configService.getBoolean(db, 'LOCAL_USERS_ENABLED');
      expect(result).toBe(true);
    });

    it('should return false for "false" string', async () => {
      await configService.set(db, 'LOCAL_USERS_ENABLED', 'false');
      const result = await configService.getBoolean(db, 'LOCAL_USERS_ENABLED');
      expect(result).toBe(false);
    });

    it('should return false for other strings', async () => {
      await configService.set(db, 'LOCAL_USERS_ENABLED', 'maybe');
      const result = await configService.getBoolean(db, 'LOCAL_USERS_ENABLED');
      expect(result).toBe(false);
    });
  });

  describe('getBooleanWithSource', () => {
    it('should indicate when value is explicitly set in database', async () => {
      await configService.set(db, 'GITHUB_ENABLED', 'true');
      const result = await configService.getBooleanWithSource(db, 'GITHUB_ENABLED');

      expect(result.value).toBe(true);
      expect(result.isExplicitlySet).toBe(true);
    });

    it('should indicate when value uses default', async () => {
      // Don't set any value - use default
      // Use AI_KILL_SWITCH which defaults to true and was not set by previous test
      const result = await configService.getBooleanWithSource(db, 'AI_KILL_SWITCH');

      expect(result.value).toBe(true); // Default for AI_KILL_SWITCH is true (safety)
      expect(result.isExplicitlySet).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all config keys with their values', async () => {
      const result = await configService.getAll(db);

      // Should have all CONFIG_KEYS
      expect(result).toHaveProperty('AI_KILL_SWITCH');
      expect(result).toHaveProperty('LOCAL_USERS_ENABLED');
      expect(result).toHaveProperty('GITHUB_ENABLED');
      expect(result).toHaveProperty('AI_IMAGE_ENABLED');

      // Each value should have correct structure
      const killSwitch = result['AI_KILL_SWITCH'] as ConfigValue;
      expect(killSwitch.key).toBe('AI_KILL_SWITCH');
      expect(killSwitch.category).toBe('ai');
      expect(typeof killSwitch.value).toBe('string');
    });
  });

  describe('getByCategory', () => {
    it('should return only auth category configs', async () => {
      const result = await configService.getByCategory(db, 'auth');

      // Should have auth keys
      expect(result).toHaveProperty('USER_APPROVAL_REQUIRED');
      expect(result).toHaveProperty('LOCAL_USERS_ENABLED');

      // Should NOT have AI keys
      expect(result).not.toHaveProperty('AI_KILL_SWITCH');
      expect(result).not.toHaveProperty('AI_IMAGE_ENABLED');
    });

    it('should return only ai category configs', async () => {
      const result = await configService.getByCategory(db, 'ai');

      // Should have AI keys
      expect(result).toHaveProperty('AI_KILL_SWITCH');
      expect(result).toHaveProperty('AI_IMAGE_ENABLED');
      expect(result).toHaveProperty('AI_LINT_ENABLED');

      // Should NOT have auth keys
      expect(result).not.toHaveProperty('USER_APPROVAL_REQUIRED');
      expect(result).not.toHaveProperty('LOCAL_USERS_ENABLED');
    });

    it('should return only github category configs', async () => {
      const result = await configService.getByCategory(db, 'github');

      // Should have GitHub keys
      expect(result).toHaveProperty('GITHUB_ENABLED');
      expect(result).toHaveProperty('GITHUB_CLIENT_ID');
      expect(result).toHaveProperty('GITHUB_CLIENT_SECRET');

      // Should NOT have other keys
      expect(result).not.toHaveProperty('AI_KILL_SWITCH');
      expect(result).not.toHaveProperty('USER_APPROVAL_REQUIRED');
    });
  });

  describe('set', () => {
    it('should insert new config value', async () => {
      await configService.set(db, 'AI_IMAGE_DEFAULT_PROVIDER', 'openai');

      const result = await configService.get(db, 'AI_IMAGE_DEFAULT_PROVIDER');
      expect(result.value).toBe('openai');
      expect(result.source).toBe('database');
    });

    it('should update existing config value', async () => {
      await configService.set(db, 'AI_IMAGE_DEFAULT_PROVIDER', 'openai');
      await configService.set(db, 'AI_IMAGE_DEFAULT_PROVIDER', 'stable-diffusion');

      const result = await configService.get(db, 'AI_IMAGE_DEFAULT_PROVIDER');
      expect(result.value).toBe('stable-diffusion');
    });

    it('should encrypt sensitive values', async () => {
      await configService.set(db, 'AI_OPENAI_API_KEY', 'sk-test-key-12345');

      // Check that the value is stored encrypted in DB
      const dbValue = await db
        .select()
        .from(config)
        .where(eq(config.key, 'AI_OPENAI_API_KEY'))
        .get();
      expect(dbValue?.encrypted).toBe(true);
      expect(dbValue?.value).not.toBe('sk-test-key-12345'); // Should be encrypted

      // But get() should return decrypted value
      const result = await configService.get(db, 'AI_OPENAI_API_KEY');
      expect(result.value).toBe('sk-test-key-12345');
      expect(result.encrypted).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete config from database', async () => {
      await configService.set(db, 'LOCAL_USERS_ENABLED', 'false');
      await configService.delete(db, 'LOCAL_USERS_ENABLED');

      const result = await configService.get(db, 'LOCAL_USERS_ENABLED');
      expect(result.source).toBe('default'); // Falls back to default
    });
  });

  describe('isFeatureEnabled', () => {
    it('should check userApproval feature', async () => {
      await configService.set(db, 'USER_APPROVAL_REQUIRED', 'true');
      const result = await configService.isFeatureEnabled(db, 'userApproval');
      expect(result).toBe(true);

      await configService.set(db, 'USER_APPROVAL_REQUIRED', 'false');
      const result2 = await configService.isFeatureEnabled(db, 'userApproval');
      expect(result2).toBe(false);
    });

    it('should check localUsers feature', async () => {
      await configService.set(db, 'LOCAL_USERS_ENABLED', 'true');
      const result = await configService.isFeatureEnabled(db, 'localUsers');
      expect(result).toBe(true);
    });

    it('should check github feature', async () => {
      await configService.set(db, 'GITHUB_ENABLED', 'true');
      const result = await configService.isFeatureEnabled(db, 'github');
      expect(result).toBe(true);
    });

    it('should check aiLint feature', async () => {
      await configService.set(db, 'AI_LINT_ENABLED', 'true');
      const result = await configService.isFeatureEnabled(db, 'aiLint');
      expect(result).toBe(true);
    });

    it('should check aiImage feature', async () => {
      await configService.set(db, 'AI_IMAGE_ENABLED', 'true');
      const result = await configService.isFeatureEnabled(db, 'aiImage');
      expect(result).toBe(true);
    });
  });

  describe('encryption edge cases', () => {
    it('should handle decryption failure gracefully', async () => {
      // Insert an invalid encrypted value directly
      await db.insert(config).values({
        key: 'AI_OPENAI_API_KEY',
        value: 'invalid:encrypted:format',
        encrypted: true,
        category: 'ai',
      });

      // Should fall back to default/env without throwing
      const result = await configService.get(db, 'AI_OPENAI_API_KEY');
      expect(result).toBeDefined();
      // The value might be the malformed string or a default, but shouldn't throw
    });
  });
});
