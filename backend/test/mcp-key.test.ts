import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'path';
import * as schema from '../src/db/schema';
import {
  mcpKeyService,
  isValidPermission,
  parsePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  toPublicKey,
} from '../src/services/mcp-key.service';
import {
  mcpAccessKeys,
  MCP_PERMISSIONS,
  type McpAccessKey,
} from '../src/db/schema/mcp-access-keys';
import { projects } from '../src/db/schema/projects';
import { users } from '../src/db/schema/users';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;
let testProjectId: string;
let testUserId: string;

beforeAll(async () => {
  // Create in-memory database for tests
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = join(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });

  // Create test user
  testUserId = crypto.randomUUID();
  await db.insert(users).values({
    id: testUserId,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hash',
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  // Create test project
  testProjectId = crypto.randomUUID();
  const now = Date.now();
  await db.insert(projects).values({
    id: testProjectId,
    title: 'Test Project',
    slug: 'test-project',
    userId: testUserId,
    createdDate: now,
    updatedDate: now,
  });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clear MCP access keys before each test
  await db.delete(mcpAccessKeys);
});

describe('MCP Key Service - Utility Functions', () => {
  describe('isValidPermission', () => {
    it('should return true for valid permissions', () => {
      expect(isValidPermission(MCP_PERMISSIONS.READ_PROJECT)).toBe(true);
      expect(isValidPermission(MCP_PERMISSIONS.READ_ELEMENTS)).toBe(true);
      expect(isValidPermission(MCP_PERMISSIONS.WRITE_ELEMENTS)).toBe(true);
    });

    it('should return false for invalid permissions', () => {
      expect(isValidPermission('invalid')).toBe(false);
      expect(isValidPermission('')).toBe(false);
      expect(isValidPermission('READ_PROJECT_INVALID')).toBe(false);
    });
  });

  describe('parsePermissions', () => {
    it('should parse valid JSON permission array', () => {
      const json = JSON.stringify([MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.READ_ELEMENTS]);
      const result = parsePermissions(json);

      expect(result).toEqual([MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.READ_ELEMENTS]);
    });

    it('should filter out invalid permissions', () => {
      const json = JSON.stringify([
        MCP_PERMISSIONS.READ_PROJECT,
        'invalid',
        MCP_PERMISSIONS.WRITE_ELEMENTS,
      ]);
      const result = parsePermissions(json);

      expect(result).toEqual([MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.WRITE_ELEMENTS]);
    });

    it('should return empty array for invalid JSON', () => {
      expect(parsePermissions('not-json')).toEqual([]);
      expect(parsePermissions('')).toEqual([]);
    });

    it('should return empty array for non-array JSON', () => {
      expect(parsePermissions('{"permission": "read"}')).toEqual([]);
      expect(parsePermissions('"string"')).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    const mockKey: McpAccessKey = {
      id: 'test-id',
      projectId: 'project-id',
      name: 'Test Key',
      keyHash: 'hash',
      keyPrefix: 'iw_proj_xxx',
      permissions: JSON.stringify([MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.READ_ELEMENTS]),
      expiresAt: null,
      lastUsedAt: null,
      lastUsedIp: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: Date.now(),
    };

    it('should return true if key has the permission', () => {
      expect(hasPermission(mockKey, MCP_PERMISSIONS.READ_PROJECT)).toBe(true);
      expect(hasPermission(mockKey, MCP_PERMISSIONS.READ_ELEMENTS)).toBe(true);
    });

    it('should return false if key does not have the permission', () => {
      expect(hasPermission(mockKey, MCP_PERMISSIONS.WRITE_ELEMENTS)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    const mockKey: McpAccessKey = {
      id: 'test-id',
      projectId: 'project-id',
      name: 'Test Key',
      keyHash: 'hash',
      keyPrefix: 'iw_proj_xxx',
      permissions: JSON.stringify([MCP_PERMISSIONS.READ_PROJECT]),
      expiresAt: null,
      lastUsedAt: null,
      lastUsedIp: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: Date.now(),
    };

    it('should return true if key has any of the permissions', () => {
      expect(
        hasAnyPermission(mockKey, [MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.WRITE_ELEMENTS])
      ).toBe(true);
    });

    it('should return false if key has none of the permissions', () => {
      expect(
        hasAnyPermission(mockKey, [MCP_PERMISSIONS.WRITE_ELEMENTS, MCP_PERMISSIONS.GENERATE_IMAGES])
      ).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    const mockKey: McpAccessKey = {
      id: 'test-id',
      projectId: 'project-id',
      name: 'Test Key',
      keyHash: 'hash',
      keyPrefix: 'iw_proj_xxx',
      permissions: JSON.stringify([
        MCP_PERMISSIONS.READ_PROJECT,
        MCP_PERMISSIONS.READ_ELEMENTS,
        MCP_PERMISSIONS.WRITE_ELEMENTS,
      ]),
      expiresAt: null,
      lastUsedAt: null,
      lastUsedIp: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: Date.now(),
    };

    it('should return true if key has all the permissions', () => {
      expect(
        hasAllPermissions(mockKey, [MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.READ_ELEMENTS])
      ).toBe(true);
    });

    it('should return false if key is missing any permission', () => {
      expect(
        hasAllPermissions(mockKey, [MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.GENERATE_IMAGES])
      ).toBe(false);
    });
  });

  describe('toPublicKey', () => {
    it('should convert database key to public representation', () => {
      const mockKey: McpAccessKey = {
        id: 'test-id',
        projectId: 'project-id',
        name: 'Test Key',
        keyHash: 'should-not-be-exposed',
        keyPrefix: 'iw_proj_xxxx',
        permissions: JSON.stringify([MCP_PERMISSIONS.READ_PROJECT]),
        expiresAt: 1234567890,
        lastUsedAt: 1234567880,
        lastUsedIp: '127.0.0.1',
        revokedAt: null,
        revokedReason: null,
        createdAt: 1234567800,
      };

      const publicKey = toPublicKey(mockKey);

      expect(publicKey.id).toBe('test-id');
      expect(publicKey.name).toBe('Test Key');
      expect(publicKey.keyPrefix).toBe('iw_proj_xxxx');
      expect(publicKey.permissions).toEqual([MCP_PERMISSIONS.READ_PROJECT]);
      expect(publicKey.expiresAt).toBe(1234567890);
      expect(publicKey.lastUsedAt).toBe(1234567880);
      expect(publicKey.createdAt).toBe(1234567800);
      expect(publicKey.revoked).toBe(false);
      // Should not expose keyHash
      expect((publicKey as unknown as { keyHash: string }).keyHash).toBeUndefined();
    });

    it('should mark revoked keys correctly', () => {
      const revokedKey: McpAccessKey = {
        id: 'test-id',
        projectId: 'project-id',
        name: 'Revoked Key',
        keyHash: 'hash',
        keyPrefix: 'iw_proj_xxxx',
        permissions: JSON.stringify([]),
        expiresAt: null,
        lastUsedAt: null,
        lastUsedIp: null,
        revokedAt: Date.now(),
        revokedReason: 'Security concern',
        createdAt: Date.now(),
      };

      const publicKey = toPublicKey(revokedKey);
      expect(publicKey.revoked).toBe(true);
    });
  });
});

describe('MCP Key Service - Database Operations', () => {
  describe('createKey', () => {
    it('should create a new key with valid format', async () => {
      const { fullKey, keyRecord } = await mcpKeyService.createKey(
        db,
        testProjectId,
        'Test API Key',
        [MCP_PERMISSIONS.READ_PROJECT]
      );

      expect(fullKey).toMatch(/^iw_proj_[a-zA-Z0-9]{32}$/);
      expect(keyRecord.name).toBe('Test API Key');
      expect(keyRecord.projectId).toBe(testProjectId);
      expect(keyRecord.keyPrefix).toBe(fullKey.substring(0, 12));
    });

    it('should add default permission if none provided', async () => {
      const { keyRecord } = await mcpKeyService.createKey(
        db,
        testProjectId,
        'No Permissions Key',
        []
      );

      const permissions = parsePermissions(keyRecord.permissions);
      expect(permissions).toContain(MCP_PERMISSIONS.READ_PROJECT);
    });

    it('should store expiration time', async () => {
      const expiresAt = Date.now() + 86400000; // 1 day from now
      const { keyRecord } = await mcpKeyService.createKey(
        db,
        testProjectId,
        'Expiring Key',
        [MCP_PERMISSIONS.READ_PROJECT],
        expiresAt
      );

      expect(keyRecord.expiresAt).toBe(expiresAt);
    });
  });

  describe('validateKey', () => {
    it('should validate a correct key', async () => {
      const { fullKey, keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Valid Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      const result = await mcpKeyService.validateKey(db, fullKey);

      expect(result.valid).toBe(true);
      expect(result.key?.id).toBe(keyRecord.id);
      expect(result.projectId).toBe(testProjectId);
    });

    it('should reject invalid key format', async () => {
      const result = await mcpKeyService.validateKey(db, 'invalid_key_format');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid key format');
    });

    it('should reject non-existent key', async () => {
      const result = await mcpKeyService.validateKey(db, 'iw_proj_nonexistentkey1234567890ab');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key not found');
    });

    it('should reject revoked key', async () => {
      const { fullKey, keyRecord } = await mcpKeyService.createKey(
        db,
        testProjectId,
        'Revoked Key',
        [MCP_PERMISSIONS.READ_PROJECT]
      );

      await mcpKeyService.revokeKey(db, keyRecord.id, 'Test revocation');

      const result = await mcpKeyService.validateKey(db, fullKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key has been revoked');
    });

    it('should reject expired key', async () => {
      const expiredTime = Date.now() - 1000; // Already expired
      const { fullKey } = await mcpKeyService.createKey(
        db,
        testProjectId,
        'Expired Key',
        [MCP_PERMISSIONS.READ_PROJECT],
        expiredTime
      );

      const result = await mcpKeyService.validateKey(db, fullKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key has expired');
    });
  });

  describe('getKeysForProject', () => {
    it('should return all keys for a project', async () => {
      await mcpKeyService.createKey(db, testProjectId, 'Key 1', [MCP_PERMISSIONS.READ_PROJECT]);
      await mcpKeyService.createKey(db, testProjectId, 'Key 2', [MCP_PERMISSIONS.WRITE_ELEMENTS]);

      const keys = await mcpKeyService.getKeysForProject(db, testProjectId);

      expect(keys.length).toBe(2);
      expect(keys.map((k) => k.name).sort()).toEqual(['Key 1', 'Key 2']);
    });
  });

  describe('getActiveKeysForProject', () => {
    it('should return only non-revoked keys', async () => {
      const { keyRecord: key1 } = await mcpKeyService.createKey(db, testProjectId, 'Active Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);
      const { keyRecord: key2 } = await mcpKeyService.createKey(db, testProjectId, 'Revoked Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      await mcpKeyService.revokeKey(db, key2.id);

      const activeKeys = await mcpKeyService.getActiveKeysForProject(db, testProjectId);

      expect(activeKeys.length).toBe(1);
      expect(activeKeys[0].id).toBe(key1.id);
    });
  });

  describe('getKeyById', () => {
    it('should return key by ID', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Test Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      const foundKey = await mcpKeyService.getKeyById(db, keyRecord.id);

      expect(foundKey).not.toBeNull();
      expect(foundKey?.id).toBe(keyRecord.id);
    });

    it('should return null for non-existent ID', async () => {
      const foundKey = await mcpKeyService.getKeyById(db, 'non-existent-id');
      expect(foundKey).toBeNull();
    });
  });

  describe('updateKey', () => {
    it('should update key name', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Original Name', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      const updated = await mcpKeyService.updateKey(db, keyRecord.id, { name: 'New Name' });

      expect(updated?.name).toBe('New Name');
    });

    it('should update permissions', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Test Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      const updated = await mcpKeyService.updateKey(db, keyRecord.id, {
        permissions: [MCP_PERMISSIONS.READ_PROJECT, MCP_PERMISSIONS.WRITE_ELEMENTS],
      });

      expect(updated).toBeDefined();
      const permissions = parsePermissions(updated?.permissions ?? '');
      expect(permissions).toContain(MCP_PERMISSIONS.READ_PROJECT);
      expect(permissions).toContain(MCP_PERMISSIONS.WRITE_ELEMENTS);
    });

    it('should update expiration', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Test Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);
      const newExpiry = Date.now() + 999999;

      const updated = await mcpKeyService.updateKey(db, keyRecord.id, { expiresAt: newExpiry });

      expect(updated?.expiresAt).toBe(newExpiry);
    });

    it('should return unchanged key if no updates provided', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Test Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      const updated = await mcpKeyService.updateKey(db, keyRecord.id, {});

      expect(updated?.id).toBe(keyRecord.id);
    });
  });

  describe('revokeKey', () => {
    it('should revoke a key with reason', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Test Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      await mcpKeyService.revokeKey(db, keyRecord.id, 'Security concern');

      const revokedKey = await mcpKeyService.getKeyById(db, keyRecord.id);
      expect(revokedKey?.revokedAt).not.toBeNull();
      expect(revokedKey?.revokedReason).toBe('Security concern');
    });
  });

  describe('deleteKey', () => {
    it('should permanently delete a key', async () => {
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Test Key', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      await mcpKeyService.deleteKey(db, keyRecord.id);

      const deleted = await mcpKeyService.getKeyById(db, keyRecord.id);
      expect(deleted).toBeNull();
    });
  });

  describe('deleteKeysForProject', () => {
    it('should delete all keys for a project', async () => {
      await mcpKeyService.createKey(db, testProjectId, 'Key 1', [MCP_PERMISSIONS.READ_PROJECT]);
      await mcpKeyService.createKey(db, testProjectId, 'Key 2', [MCP_PERMISSIONS.READ_PROJECT]);

      await mcpKeyService.deleteKeysForProject(db, testProjectId);

      const keys = await mcpKeyService.getKeysForProject(db, testProjectId);
      expect(keys.length).toBe(0);
    });
  });

  describe('countActiveKeys', () => {
    it('should count only active keys', async () => {
      await mcpKeyService.createKey(db, testProjectId, 'Active 1', [MCP_PERMISSIONS.READ_PROJECT]);
      await mcpKeyService.createKey(db, testProjectId, 'Active 2', [MCP_PERMISSIONS.READ_PROJECT]);
      const { keyRecord } = await mcpKeyService.createKey(db, testProjectId, 'Revoked', [
        MCP_PERMISSIONS.READ_PROJECT,
      ]);

      await mcpKeyService.revokeKey(db, keyRecord.id);

      const count = await mcpKeyService.countActiveKeys(db, testProjectId);
      expect(count).toBe(2);
    });
  });
});
