import { eq, and, isNull } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  mcpAccessKeys,
  McpAccessKey,
  InsertMcpAccessKey,
  McpPermission,
  MCP_PERMISSIONS,
} from '../db/schema/mcp-access-keys';

/**
 * Generate a cryptographically secure random string
 */
function generateSecureRandom(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes)
    .map((byte) => chars[byte % chars.length])
    .join('');
}

/**
 * Hash a string using SHA-256
 */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that a permission string is a valid MCP permission
 */
export function isValidPermission(permission: string): permission is McpPermission {
  return Object.values(MCP_PERMISSIONS).includes(permission as McpPermission);
}

/**
 * Parse permissions from JSON string to array
 */
export function parsePermissions(permissionsJson: string): McpPermission[] {
  try {
    const parsed = JSON.parse(permissionsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPermission);
  } catch {
    return [];
  }
}

/**
 * Check if a key has a specific permission
 */
export function hasPermission(key: McpAccessKey, permission: McpPermission): boolean {
  const permissions = parsePermissions(key.permissions);
  return permissions.includes(permission);
}

/**
 * Check if a key has any of the specified permissions
 */
export function hasAnyPermission(key: McpAccessKey, permissions: McpPermission[]): boolean {
  const keyPermissions = parsePermissions(key.permissions);
  return permissions.some((p) => keyPermissions.includes(p));
}

/**
 * Check if a key has all of the specified permissions
 */
export function hasAllPermissions(key: McpAccessKey, permissions: McpPermission[]): boolean {
  const keyPermissions = parsePermissions(key.permissions);
  return permissions.every((p) => keyPermissions.includes(p));
}

/**
 * Result of key validation
 */
export interface KeyValidationResult {
  valid: boolean;
  key?: McpAccessKey;
  projectId?: string;
  error?: string;
}

/**
 * Public representation of an MCP access key (for API responses)
 */
export interface PublicMcpAccessKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: McpPermission[];
  expiresAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  revoked: boolean;
}

/**
 * Convert database key to public representation
 */
export function toPublicKey(key: McpAccessKey): PublicMcpAccessKey {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    permissions: parsePermissions(key.permissions),
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    revoked: key.revokedAt !== null,
  };
}

/**
 * Service for managing MCP access keys
 */
class McpKeyService {
  /**
   * Generate a new API key for a project.
   * Returns both the full key (show once to user) and the database record.
   */
  async createKey(
    db: DatabaseInstance,
    projectId: string,
    name: string,
    permissions: McpPermission[],
    expiresAt?: number
  ): Promise<{ fullKey: string; keyRecord: McpAccessKey }> {
    // Generate the full key: iw_proj_{32 random chars}
    const randomPart = generateSecureRandom(32);
    const fullKey = `iw_proj_${randomPart}`;

    // Hash the key for storage
    const keyHash = await hashKey(fullKey);

    // Extract prefix for identification
    const keyPrefix = fullKey.substring(0, 12); // "iw_proj_xxxx"

    // Validate permissions
    const validPermissions = permissions.filter(isValidPermission);
    if (validPermissions.length === 0) {
      validPermissions.push(MCP_PERMISSIONS.READ_PROJECT);
    }

    const keyData: InsertMcpAccessKey = {
      projectId,
      name,
      keyHash,
      keyPrefix,
      permissions: JSON.stringify(validPermissions),
      expiresAt: expiresAt ?? null,
    };

    await db.insert(mcpAccessKeys).values(keyData);

    // Fetch the created record
    const [created] = await db
      .select()
      .from(mcpAccessKeys)
      .where(eq(mcpAccessKeys.keyHash, keyHash))
      .limit(1);

    return { fullKey, keyRecord: created };
  }

  /**
   * Validate an API key and return the key record if valid.
   * Also updates lastUsedAt timestamp.
   */
  async validateKey(
    db: DatabaseInstance,
    fullKey: string,
    clientIp?: string
  ): Promise<KeyValidationResult> {
    // Check format
    if (!fullKey.startsWith('iw_proj_')) {
      return { valid: false, error: 'Invalid key format' };
    }

    // Hash the provided key
    const keyHash = await hashKey(fullKey);

    // Look up by hash
    const [key] = await db
      .select()
      .from(mcpAccessKeys)
      .where(eq(mcpAccessKeys.keyHash, keyHash))
      .limit(1);

    if (!key) {
      return { valid: false, error: 'Key not found' };
    }

    // Check if revoked
    if (key.revokedAt !== null) {
      return { valid: false, error: 'Key has been revoked' };
    }

    // Check if expired
    if (key.expiresAt !== null && key.expiresAt < Date.now()) {
      return { valid: false, error: 'Key has expired' };
    }

    // Update last used timestamp (fire and forget)
    db.update(mcpAccessKeys)
      .set({
        lastUsedAt: Date.now(),
        lastUsedIp: clientIp ?? null,
      })
      .where(eq(mcpAccessKeys.id, key.id))
      .catch((err) => console.error('Failed to update key lastUsedAt:', err));

    return {
      valid: true,
      key,
      projectId: key.projectId,
    };
  }

  /**
   * Get all keys for a project (for management UI)
   */
  async getKeysForProject(db: DatabaseInstance, projectId: string): Promise<PublicMcpAccessKey[]> {
    const keys = await db
      .select()
      .from(mcpAccessKeys)
      .where(eq(mcpAccessKeys.projectId, projectId));

    return keys.map(toPublicKey);
  }

  /**
   * Get active (non-revoked) keys for a project
   */
  async getActiveKeysForProject(
    db: DatabaseInstance,
    projectId: string
  ): Promise<PublicMcpAccessKey[]> {
    const keys = await db
      .select()
      .from(mcpAccessKeys)
      .where(and(eq(mcpAccessKeys.projectId, projectId), isNull(mcpAccessKeys.revokedAt)));

    return keys.map(toPublicKey);
  }

  /**
   * Get a specific key by ID
   */
  async getKeyById(db: DatabaseInstance, keyId: string): Promise<McpAccessKey | null> {
    const [key] = await db.select().from(mcpAccessKeys).where(eq(mcpAccessKeys.id, keyId)).limit(1);

    return key ?? null;
  }

  /**
   * Update key name or permissions
   */
  async updateKey(
    db: DatabaseInstance,
    keyId: string,
    updates: { name?: string; permissions?: McpPermission[]; expiresAt?: number | null }
  ): Promise<McpAccessKey | null> {
    const updateData: Partial<InsertMcpAccessKey> = {};

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    if (updates.permissions !== undefined) {
      const validPermissions = updates.permissions.filter(isValidPermission);
      updateData.permissions = JSON.stringify(validPermissions);
    }

    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getKeyById(db, keyId);
    }

    await db.update(mcpAccessKeys).set(updateData).where(eq(mcpAccessKeys.id, keyId));

    return this.getKeyById(db, keyId);
  }

  /**
   * Revoke a key
   */
  async revokeKey(db: DatabaseInstance, keyId: string, reason?: string): Promise<void> {
    await db
      .update(mcpAccessKeys)
      .set({
        revokedAt: Date.now(),
        revokedReason: reason ?? null,
      })
      .where(eq(mcpAccessKeys.id, keyId));
  }

  /**
   * Permanently delete a key
   */
  async deleteKey(db: DatabaseInstance, keyId: string): Promise<void> {
    await db.delete(mcpAccessKeys).where(eq(mcpAccessKeys.id, keyId));
  }

  /**
   * Delete all keys for a project (called when project is deleted)
   */
  async deleteKeysForProject(db: DatabaseInstance, projectId: string): Promise<void> {
    await db.delete(mcpAccessKeys).where(eq(mcpAccessKeys.projectId, projectId));
  }

  /**
   * Count active keys for a project
   */
  async countActiveKeys(db: DatabaseInstance, projectId: string): Promise<number> {
    const keys = await db
      .select()
      .from(mcpAccessKeys)
      .where(and(eq(mcpAccessKeys.projectId, projectId), isNull(mcpAccessKeys.revokedAt)));

    return keys.length;
  }
}

export const mcpKeyService = new McpKeyService();
