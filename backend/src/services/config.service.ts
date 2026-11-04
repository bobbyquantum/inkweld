import { and, eq, inArray, sql } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config as envConfig, PUBLISHED_KEYS } from '../config/env';
import { config, CONFIG_KEYS, type ConfigKey, type ConfigCategory } from '../db/schema/config';
import type { DatabaseInstance } from '../types/context';
import { DEFAULT_SYNC_QUOTA_BYTES } from '../utils/sync-quota';
import { logger } from './logger.service';

/** A stored `salt:iv:authTag:encrypted` value, decoded. */
interface EncryptedParts {
  salt: Buffer;
  iv: Buffer;
  authTag: Buffer;
  encrypted: Buffer;
}

/** An encrypted value read with a published key, to store again under the active key. */
interface StoredRead {
  key: ConfigKey;
  ciphertext: string;
  value: string;
}

/** A database row as `resolve` reads it. */
type StoredRow = {
  value: string;
  encrypted: boolean;
  category: string;
  description: string | null;
};

/**
 * Configuration value with metadata
 */
export interface ConfigValue {
  key: string;
  value: string;
  category: ConfigCategory;
  description?: string;
  encrypted: boolean;
  source: 'database' | 'environment' | 'default';
}

/**
 * All config values grouped by category
 */
export interface ConfigValues {
  [key: string]: ConfigValue;
}

export class ConfigValidationError extends Error {}

/**
 * Config service for managing application settings.
 *
 * Settings can come from three sources (in priority order):
 * 1. Database (admin-configurable via UI)
 * 2. Environment variables
 * 3. Default values
 *
 * Sensitive values (like API keys) are stored encrypted in the database.
 */
class ConfigService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly authTagLength = 16;
  private readonly saltLength = 16;

  // On Cloudflare Workers, secrets are only available via c.env at request time,
  // not through process.env at module scope. This override is set by middleware
  // in worker-app.ts so that encryption/decryption uses the real secret.
  private databaseKeyOverride: string | undefined;

  // Stored values that no key could decrypt, so reading them again does not
  // repeat the attempts with the published keys (see decrypt()).
  private readonly undecryptable = new Set<string>();

  /**
   * Set the database encryption key at runtime (used by Workers middleware).
   */
  setDatabaseKey(key: string): void {
    this.databaseKeyOverride = key;
    this.undecryptable.clear();
  }

  /** The key stored values are encrypted with: DATABASE_KEY, else SESSION_SECRET. */
  private activeDatabaseKey(): string {
    return this.databaseKeyOverride || envConfig.databaseKey;
  }

  /**
   * Derive encryption key from the database key using scrypt
   */
  private deriveKey(salt: Buffer, databaseKey = this.activeDatabaseKey()): Buffer {
    return scryptSync(databaseKey, salt, this.keyLength);
  }

  /**
   * Encrypt a value for storage
   */
  private encrypt(plaintext: string): string {
    const salt = randomBytes(this.saltLength);
    const key = this.deriveKey(salt);
    const iv = randomBytes(this.ivLength);

    const cipher = createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: salt:iv:authTag:encrypted (all base64)
    return [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypt a stored value's parts with the key derived from `databaseKey`.
   * Throws when that is not the key the value was encrypted with.
   */
  private decryptWith(parts: EncryptedParts, databaseKey: string): string {
    const key = this.deriveKey(parts.salt, databaseKey);

    const decipher = createDecipheriv(this.algorithm, key, parts.iv, {
      authTagLength: this.authTagLength,
    });
    decipher.setAuthTag(parts.authTag);

    return decipher.update(parts.encrypted) + decipher.final('utf8');
  }

  /**
   * Decrypt a stored value with the active key.
   *
   * A server that ran without a key of its own, or with a sample value from
   * the docs, stored its values encrypted with one of the keys published in
   * this repository (PUBLISHED_KEYS). When the active key cannot decrypt a
   * value, those keys are tried; `reencrypt` then tells the caller to store
   * the value again under the active key.
   */
  private decrypt(ciphertext: string): { value: string; reencrypt: boolean } {
    const parts = ciphertext.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted value format');
    }

    const [salt, iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, 'base64'));
    const encryptedParts: EncryptedParts = { salt, iv, authTag, encrypted };
    const activeKey = this.activeDatabaseKey();
    try {
      return { value: this.decryptWith(encryptedParts, activeKey), reencrypt: false };
    } catch (error) {
      // Only a server running with a key of its own moves values off the
      // published keys; between those (development, test) nothing moves.
      if (PUBLISHED_KEYS.includes(activeKey) || this.undecryptable.has(ciphertext)) throw error;
      for (const publishedKey of PUBLISHED_KEYS) {
        try {
          return { value: this.decryptWith(encryptedParts, publishedKey), reencrypt: true };
        } catch {
          // Not encrypted with this one either.
        }
      }
      this.undecryptable.add(ciphertext);
      throw error;
    }
  }

  /**
   * Store values that decrypt() read with a published key again, encrypted
   * with the active key. Only a row still holding the value that was read is
   * updated, so a value an admin saved in the meantime is kept. A failure is
   * logged and leaves the row as it was; the value is still returned.
   */
  private async reencryptStored(db: DatabaseInstance, reads: readonly StoredRead[]): Promise<void> {
    await Promise.all(
      reads.map(async ({ key, ciphertext, value }) => {
        try {
          await db
            .update(config)
            .set({ value: this.encrypt(value), updatedAt: new Date() })
            .where(and(eq(config.key, key), eq(config.value, ciphertext)));
          logger.info('Config', `Re-encrypted the stored ${key} with the configured key`);
        } catch (error) {
          logger.warn('Config', `Could not re-encrypt the stored ${key}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  }

  /**
   * Get the default value for a config key from environment or hardcoded defaults
   */
  private getDefaultValue(key: ConfigKey): string | undefined {
    const keyConfig = CONFIG_KEYS[key];
    const envValue = process.env[keyConfig.envVar];

    if (envValue !== undefined) {
      return envValue;
    }

    // Hardcoded defaults for boolean values
    switch (key) {
      case 'AI_KILL_SWITCH':
        return 'true'; // Default to ON (AI disabled) for safety
      case 'USER_APPROVAL_REQUIRED':
        return 'true';
      case 'LOCAL_USERS_ENABLED':
        return 'true';
      case 'GITHUB_ENABLED':
        return 'false';
      case 'OIDC_ENABLED':
      case 'OIDC_ONLY':
        return 'false';
      case 'PASSKEYS_ENABLED':
        return 'true'; // Passkeys enabled by default
      case 'PASSWORD_LOGIN_ENABLED':
        // Default OFF — modern best practice is passwordless. Operators who
        // want password login (e.g. on first install before any passkey is
        // registered) must explicitly enable it via env var or admin UI.
        return 'false';
      case 'EMAIL_RECOVERY_ENABLED':
        // Default OFF — opting into an email-based recovery channel is a
        // deliberate trust decision because it broadens the attack surface
        // beyond the device-bound passkey credential.
        return 'false';
      case 'ALLOW_INKWELD_APP_CLIENT':
        // Default OFF — trusting a frontend this server doesn't serve is the
        // admin's call, and it ties the server to the hosted app's release
        // cadence.
        return 'false';
      case 'MCP_ENABLED':
        // Default ON — MCP is the primary way external tools connect to
        // projects. The AI kill switch still takes precedence (when ON, MCP
        // is disabled regardless of this flag).
        return 'true';
      case 'AI_LINT_ENABLED':
        return envConfig.openai.enabled ? 'true' : 'false';
      case 'AI_IMAGE_ENABLED':
        return envConfig.openai.enabled ? 'true' : 'false';
      case 'AI_IMAGE_DEFAULT_PROVIDER':
        return 'openai';
      case 'AI_IMAGE_OPENAI_ENABLED':
        return envConfig.openai.enabled ? 'true' : 'false';
      case 'AI_IMAGE_OPENROUTER_ENABLED':
        return 'false';
      case 'AI_IMAGE_SD_ENABLED':
        return 'false';
      case 'AI_IMAGE_FALAI_ENABLED':
        return 'false';
      case 'EMAIL_ENABLED':
        return 'false';
      case 'REQUIRE_EMAIL':
        return 'false';
      case 'PASSWORD_MIN_LENGTH':
        return '8';
      case 'PASSWORD_REQUIRE_UPPERCASE':
        return 'true';
      case 'PASSWORD_REQUIRE_LOWERCASE':
        return 'true';
      case 'PASSWORD_REQUIRE_NUMBER':
        return 'true';
      case 'PASSWORD_REQUIRE_SYMBOL':
        return 'true';
      case 'USER_BACKGROUND_ENABLED':
        // Default ON — letting people pick from the built-in presets costs
        // nothing (they are CSS gradients plus the bundled image) and is the
        // personalisation most users actually want.
        return 'true';
      case 'USER_BACKGROUND_UPLOAD_ENABLED':
        // Default OFF — per-user uploads consume server storage, so an admin
        // has to opt in deliberately.
        return 'false';
      case 'BACKGROUND_BLUR':
        return '0';
      case 'SYNC_QUOTA_ENABLED':
        // Default OFF — an existing instance must not start refusing uploads
        // on upgrade; an admin opts in deliberately.
        return 'false';
      case 'SYNC_QUOTA_DEFAULT_BYTES':
        // 100 MB. Generous enough that ordinary writing never notices, small
        // enough that an instance cannot be filled by one account silently.
        return String(DEFAULT_SYNC_QUOTA_BYTES);
      case 'CONTENT_SECURITY_POLICY_MODE':
        return 'enforce';
      default:
        return undefined;
    }
  }

  /**
   * Get a single config value by key
   */
  async get(db: DatabaseInstance, key: ConfigKey): Promise<ConfigValue> {
    const dbValue = await db.select().from(config).where(eq(config.key, key)).get();
    const reads: StoredRead[] = [];
    const value = this.resolve(key, dbValue, reads);
    await this.reencryptStored(db, reads);
    return value;
  }

  /**
   * Get several config values with ONE database round trip. Each key is
   * resolved with the same database → environment → default precedence as
   * `get`. Callers that need many flags at once (the public /config/features
   * endpoint read ~15 keys serially) should use this.
   */
  async getMany<K extends ConfigKey>(
    db: DatabaseInstance,
    keys: readonly K[]
  ): Promise<Record<K, ConfigValue>> {
    const rows =
      keys.length === 0
        ? []
        : await db
            .select()
            .from(config)
            .where(inArray(config.key, [...keys]));
    const byKey = new Map(rows.map((row) => [row.key, row] as const));
    const result = {} as Record<K, ConfigValue>;
    const reads: StoredRead[] = [];
    for (const key of keys) {
      result[key] = this.resolve(key, byKey.get(key), reads);
    }
    await this.reencryptStored(db, reads);
    return result;
  }

  /**
   * Apply the database → environment → default precedence for one key.
   * Encrypted values that decrypt() read with a published key are added to
   * `reads`, for the caller to store again under the active key.
   */
  private resolve(
    key: ConfigKey,
    dbValue: StoredRow | undefined,
    reads?: StoredRead[]
  ): ConfigValue {
    const keyConfig = CONFIG_KEYS[key];

    if (dbValue) {
      let value = dbValue.value;
      if (dbValue.encrypted) {
        try {
          const decrypted = this.decrypt(value);
          if (decrypted.reencrypt) {
            reads?.push({ key, ciphertext: dbValue.value, value: decrypted.value });
          }
          value = decrypted.value;
        } catch {
          // If decryption fails, fall back to env/default
          logger.warn('Config', `Failed to decrypt config value for ${key}, using default`);
        }
      }

      return {
        key,
        value,
        category: dbValue.category as ConfigCategory,
        description: dbValue.description || keyConfig.description,
        encrypted: dbValue.encrypted,
        source: 'database',
      };
    }

    // Try environment variable
    const envValue = process.env[keyConfig.envVar];
    if (envValue !== undefined) {
      return {
        key,
        value: envValue,
        category: keyConfig.category,
        description: keyConfig.description,
        encrypted: false,
        source: 'environment',
      };
    }

    // Fall back to default
    const defaultValue = this.getDefaultValue(key) || '';
    return {
      key,
      value: defaultValue,
      category: keyConfig.category,
      description: keyConfig.description,
      encrypted: false,
      source: 'default',
    };
  }

  /**
   * Get a config value as a boolean
   */
  async getBoolean(db: DatabaseInstance, key: ConfigKey): Promise<boolean> {
    const configValue = await this.get(db, key);
    return configValue.value === 'true' || configValue.value === '1';
  }

  /**
   * Get a config value as a boolean with source info.
   * Returns whether the value was explicitly set (database or environment) vs using defaults.
   */
  async getBooleanWithSource(
    db: DatabaseInstance,
    key: ConfigKey
  ): Promise<{ value: boolean; isExplicitlySet: boolean }> {
    const configValue = await this.get(db, key);
    return {
      value: configValue.value === 'true' || configValue.value === '1',
      isExplicitlySet: configValue.source === 'database' || configValue.source === 'environment',
    };
  }

  /**
   * Get all config values
   */
  getAll(db: DatabaseInstance): Promise<ConfigValues> {
    return this.getMany(db, Object.keys(CONFIG_KEYS) as ConfigKey[]);
  }

  /**
   * Get all config values for a category
   */
  getByCategory(db: DatabaseInstance, category: ConfigCategory): Promise<ConfigValues> {
    const keys = (Object.entries(CONFIG_KEYS) as [ConfigKey, (typeof CONFIG_KEYS)[ConfigKey]][])
      .filter(([, keyConfig]) => keyConfig.category === category)
      .map(([key]) => key);
    return this.getMany(db, keys);
  }

  /**
   * Set a config value in the database
   */
  async set(db: DatabaseInstance, key: ConfigKey, value: string): Promise<void> {
    const keyConfig = CONFIG_KEYS[key];
    const shouldEncrypt = keyConfig.encrypted;

    const storedValue = shouldEncrypt ? this.encrypt(value) : value;

    // Upsert the value
    const existing = await db.select().from(config).where(eq(config.key, key)).get();

    if (existing) {
      await db
        .update(config)
        .set({
          value: storedValue,
          encrypted: shouldEncrypt,
          updatedAt: new Date(),
        })
        .where(eq(config.key, key));
    } else {
      await db.insert(config).values({
        key,
        value: storedValue,
        encrypted: shouldEncrypt,
        category: keyConfig.category,
        description: keyConfig.description,
      });
    }
  }

  /**
   * Delete a config value from the database (reverts to env/default)
   */
  async delete(db: DatabaseInstance, key: ConfigKey): Promise<void> {
    await db.delete(config).where(eq(config.key, key));
  }

  /**
   * Validate a prospective settings snapshot and compare-and-swap it in one SQL
   * statement. A concurrent change to any guarded key rejects the write, including
   * across Node/Bun processes and D1 isolates. Undefined deletes an override.
   */
  async updateValidated(
    db: DatabaseInstance,
    key: ConfigKey,
    value: string | undefined,
    guardedKeys: readonly ConfigKey[],
    validate: (values: ConfigValues) => void
  ): Promise<void> {
    if (!guardedKeys.includes(key)) throw new Error('Updated key must be guarded');
    const snapshot = await db
      .select()
      .from(config)
      .where(inArray(config.key, [...guardedKeys]));
    const values: ConfigValues = {};
    for (const guardedKey of guardedKeys) {
      values[guardedKey] = this.resolve(
        guardedKey,
        snapshot.find((row) => row.key === guardedKey)
      );
    }
    values[key] = value === undefined ? this.resolve(key, undefined) : { ...values[key], value };
    validate(values);

    // Check both membership and stored values so inserts, deletes and secret
    // rotations between the snapshot read and this statement cannot slip through.
    const keys = sql.join(
      guardedKeys.map((guardedKey) => sql`${guardedKey}`),
      sql`, `
    );
    const matches = snapshot.map(
      (row) => sql`EXISTS (SELECT 1 FROM config WHERE key = ${row.key}
        AND value = ${row.value} AND encrypted = ${Number(row.encrypted)})`
    );
    const unchanged = sql.join(
      [sql`(SELECT count(*) FROM config WHERE key IN (${keys})) = ${snapshot.length}`, ...matches],
      sql` AND `
    );
    if (value === undefined) {
      const deleted = await db
        .delete(config)
        .where(sql`${config.key} = ${key} AND ${unchanged}`)
        .returning();
      if (deleted.length || !snapshot.some((row) => row.key === key)) return;
    } else {
      const definition = CONFIG_KEYS[key];
      const storedValue = definition.encrypted ? this.encrypt(value) : value;
      const now = Math.floor(Date.now() / 1000);
      const written = await db
        .insert(config)
        .select(
          sql`SELECT ${key}, ${storedValue}, ${Number(definition.encrypted)}, ${definition.category},
          ${definition.description}, ${now}, ${now}
          WHERE ${unchanged}`
        )
        .onConflictDoUpdate({
          target: config.key,
          set: { value: storedValue, encrypted: definition.encrypted, updatedAt: new Date() },
        })
        .returning();
      if (written.length) return;
    }
    throw new ConfigValidationError('OIDC configuration changed concurrently; reload and retry');
  }

  /**
   * Check if a feature is enabled (helper for common checks)
   */
  isFeatureEnabled(
    db: DatabaseInstance,
    feature: 'userApproval' | 'localUsers' | 'github' | 'aiLint' | 'aiImage'
  ): Promise<boolean> {
    switch (feature) {
      case 'userApproval':
        return this.getBoolean(db, 'USER_APPROVAL_REQUIRED');
      case 'localUsers':
        return this.getBoolean(db, 'LOCAL_USERS_ENABLED');
      case 'github':
        return this.getBoolean(db, 'GITHUB_ENABLED');
      case 'aiLint':
        return this.getBoolean(db, 'AI_LINT_ENABLED');
      case 'aiImage':
        return this.getBoolean(db, 'AI_IMAGE_ENABLED');
    }
  }
}

export const configService = new ConfigService();
