import { eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { config as envConfig } from '../config/env';
import { config, CONFIG_KEYS, type ConfigKey, type ConfigCategory } from '../db/schema/config';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';

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

  /**
   * Derive encryption key from the database key using scrypt
   */
  private deriveKey(salt: Buffer): Buffer {
    const databaseKey = envConfig.databaseKey;
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
   * Decrypt a stored value
   */
  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted value format');
    }

    const [saltB64, ivB64, authTagB64, encryptedB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');

    const key = this.deriveKey(salt);

    const decipher = createDecipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength,
    });
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted) + decipher.final('utf8');
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
      default:
        return undefined;
    }
  }

  /**
   * Get a single config value by key
   */
  async get(db: DatabaseInstance, key: ConfigKey): Promise<ConfigValue> {
    const keyConfig = CONFIG_KEYS[key];

    // Try database first
    const dbValue = await db.select().from(config).where(eq(config.key, key)).get();

    if (dbValue) {
      let value = dbValue.value;
      if (dbValue.encrypted) {
        try {
          value = this.decrypt(value);
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
  async getAll(db: DatabaseInstance): Promise<ConfigValues> {
    const result: ConfigValues = {};

    for (const key of Object.keys(CONFIG_KEYS) as ConfigKey[]) {
      result[key] = await this.get(db, key);
    }

    return result;
  }

  /**
   * Get all config values for a category
   */
  async getByCategory(db: DatabaseInstance, category: ConfigCategory): Promise<ConfigValues> {
    const result: ConfigValues = {};

    for (const [key, keyConfig] of Object.entries(CONFIG_KEYS) as [
      ConfigKey,
      (typeof CONFIG_KEYS)[ConfigKey],
    ][]) {
      if (keyConfig.category === category) {
        result[key] = await this.get(db, key as ConfigKey);
      }
    }

    return result;
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
   * Check if a feature is enabled (helper for common checks)
   */
  async isFeatureEnabled(
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
