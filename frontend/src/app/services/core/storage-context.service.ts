import { computed, Injectable, signal } from '@angular/core';

/**
 * Server version information for compatibility checking
 */
export interface ServerVersionInfo {
  /** Server version string (e.g., "0.1.0") */
  serverVersion: string;

  /** API protocol version number */
  protocolVersion: number;

  /** Minimum client version required by the server */
  minClientVersion: string;

  /** When this version info was last checked */
  lastCheckedAt: string;
}

/**
 * Server/mode configuration for storage isolation
 */
export interface ServerConfig {
  /** Unique ID: "local" or first 8 chars of SHA-256(serverUrl) */
  id: string;

  /** Configuration type */
  type: 'local' | 'server';

  /** Server URL (undefined for local mode) */
  serverUrl?: string;

  /** User-friendly display name, e.g., "My Writing Server" or "Work Instance" */
  displayName?: string;

  /** Cached user profile for this server/mode */
  userProfile?: {
    name: string;
    username: string;
    avatarUrl?: string;
  };

  /** Cached server version information for compatibility checking */
  versionInfo?: ServerVersionInfo;

  /** When this configuration was added */
  addedAt: string;

  /** Last time this configuration was used */
  lastUsedAt: string;
}

/**
 * App configuration with multi-server support
 */
export interface AppConfigV2 {
  /** Schema version for future migrations */
  version: 2;

  /** ID of the currently active configuration */
  activeConfigId: string;

  /** All known server/local configurations */
  configurations: ServerConfig[];
}

/** Storage key for app configuration */
export const APP_CONFIG_STORAGE_KEY = 'inkweld-app-config';

/** The local mode config ID is always "local" */
export const LOCAL_CONFIG_ID = 'local';

/**
 * Service for managing storage context prefixes across different servers/modes.
 *
 * This service provides:
 * - Storage key prefixes based on current server context
 * - Multi-server configuration management
 *
 * Storage prefixes:
 * - "local:" for local mode
 * - "srv:{hash}:" for server mode (hash = first 8 chars of SHA-256 of server URL)
 *
 * @example
 * ```typescript
 * // Get prefix for current context
 * const prefix = storageContext.getPrefix(); // "local:" or "srv:a1b2c3d4:"
 *
 * // Prefix a storage key
 * const key = storageContext.prefixKey('inkweld-media'); // "local:inkweld-media"
 *
 * // Prefix a database name
 * const dbName = storageContext.prefixDbName('inkweld-snapshots');
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class StorageContextService {
  /** Current app configuration */
  private readonly configSignal = signal<AppConfigV2 | null>(null);

  /** Computed: active server config */
  readonly activeConfig = computed<ServerConfig | null>(() => {
    const config = this.configSignal();
    if (!config) return null;
    return (
      config.configurations.find(c => c.id === config.activeConfigId) ?? null
    );
  });

  /** Computed: all configurations */
  readonly configurations = computed<ServerConfig[]>(() => {
    return this.configSignal()?.configurations ?? [];
  });

  /** Computed: current storage prefix */
  readonly prefix = computed<string>(() => {
    const config = this.activeConfig();
    if (!config) return 'local:';
    return this.getPrefixForConfig(config.id);
  });

  /** Computed: is in local mode */
  readonly isLocalMode = computed<boolean>(() => {
    return this.activeConfig()?.type === 'local';
  });

  /** Computed: is configured (has at least one config) */
  readonly isConfigured = computed<boolean>(() => {
    return (this.configSignal()?.configurations.length ?? 0) > 0;
  });

  constructor() {
    this.loadConfig();
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(APP_CONFIG_STORAGE_KEY);
      if (!stored) {
        this.configSignal.set(null);
        return;
      }

      const parsed: unknown = JSON.parse(stored);

      // Validate this is a v2 config
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'version' in parsed &&
        (parsed as { version: unknown }).version === 2
      ) {
        this.configSignal.set(parsed as AppConfigV2);
        return;
      }

      // Unknown config format, reset
      console.warn('[StorageContext] Unknown config format, resetting');
      this.configSignal.set(null);
    } catch (error) {
      console.error('[StorageContext] Failed to load config:', error);
      this.configSignal.set(null);
    }
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfig(config: AppConfigV2): void {
    localStorage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  /**
   * Generate a stable hash for a server URL (first 8 chars of SHA-256)
   * Uses a simple hash for synchronous operation; SHA-256 would require async
   */
  hashServerUrl(url: string): string {
    const normalized = this.normalizeUrl(url);
    // Simple djb2 hash for synchronous operation
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash << 5) + hash + normalized.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive hex string and take first 8 chars
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return hex.substring(0, 8);
  }

  /**
   * Normalize a URL for consistent hashing
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash, lowercase, remove default ports
      let normalized = `${parsed.protocol}//${parsed.hostname}`;
      if (
        parsed.port &&
        !(
          (parsed.protocol === 'https:' && parsed.port === '443') ||
          (parsed.protocol === 'http:' && parsed.port === '80')
        )
      ) {
        normalized += `:${parsed.port}`;
      }
      return normalized.toLowerCase();
    } catch {
      // If URL parsing fails, just lowercase and trim
      return url.toLowerCase().replace(/\/+$/, '');
    }
  }

  /**
   * Get a default display name from a server URL
   */
  private getDefaultDisplayName(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PREFIX METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current storage prefix based on active configuration
   */
  getPrefix(): string {
    return this.prefix();
  }

  /**
   * Get storage prefix for a specific config ID
   */
  getPrefixForConfig(configId: string): string {
    if (configId === LOCAL_CONFIG_ID) return 'local:';
    return `srv:${configId}:`;
  }

  /**
   * Prefix a storage key with current context
   */
  prefixKey(key: string): string {
    return `${this.getPrefix()}${key}`;
  }

  /**
   * Prefix a database name with current context
   */
  prefixDbName(dbName: string): string {
    return `${this.getPrefix()}${dbName}`;
  }

  /**
   * Prefix a Yjs document ID for IndexedDB storage
   * Note: This is only for storage keys, not WebSocket document IDs
   */
  prefixDocumentId(documentId: string): string {
    return `${this.getPrefix()}${documentId}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current app configuration
   */
  getConfig(): AppConfigV2 | null {
    return this.configSignal();
  }

  /**
   * Get the active configuration
   */
  getActiveConfig(): ServerConfig | null {
    return this.activeConfig();
  }

  /**
   * Get all configurations
   */
  getConfigurations(): ServerConfig[] {
    return this.configurations();
  }

  /**
   * Get a configuration by ID
   */
  getConfigById(configId: string): ServerConfig | undefined {
    return this.configurations().find(c => c.id === configId);
  }

  /**
   * Check if a server URL is already configured
   */
  hasServerConfig(serverUrl: string): boolean {
    const hash = this.hashServerUrl(serverUrl);
    return this.configurations().some(c => c.id === hash);
  }

  /**
   * Add local mode configuration
   */
  addLocalConfig(userProfile?: {
    name: string;
    username: string;
  }): ServerConfig {
    const now = new Date().toISOString();
    const config: ServerConfig = {
      id: LOCAL_CONFIG_ID,
      type: 'local',
      displayName: 'Local Mode',
      userProfile: userProfile
        ? { name: userProfile.name, username: userProfile.username }
        : undefined,
      addedAt: now,
      lastUsedAt: now,
    };

    const currentConfig = this.configSignal();
    if (currentConfig) {
      // Check if local already exists
      const existingIndex = currentConfig.configurations.findIndex(
        c => c.id === LOCAL_CONFIG_ID
      );
      if (existingIndex >= 0) {
        // Update existing
        const updated = { ...currentConfig };
        updated.configurations = [...updated.configurations];
        updated.configurations[existingIndex] = config;
        this.saveConfig(updated);
        this.configSignal.set(updated);
        return config;
      }

      // Add new
      const updated: AppConfigV2 = {
        ...currentConfig,
        configurations: [...currentConfig.configurations, config],
      };
      this.saveConfig(updated);
      this.configSignal.set(updated);
    } else {
      // First config
      const newConfig: AppConfigV2 = {
        version: 2,
        activeConfigId: LOCAL_CONFIG_ID,
        configurations: [config],
      };
      this.saveConfig(newConfig);
      this.configSignal.set(newConfig);
    }

    return config;
  }

  /**
   * Add a server configuration
   */
  addServerConfig(
    serverUrl: string,
    displayName?: string,
    userProfile?: { name: string; username: string }
  ): ServerConfig {
    const now = new Date().toISOString();
    const id = this.hashServerUrl(serverUrl);
    const config: ServerConfig = {
      id,
      type: 'server',
      serverUrl,
      displayName: displayName ?? this.getDefaultDisplayName(serverUrl),
      userProfile: userProfile
        ? { name: userProfile.name, username: userProfile.username }
        : undefined,
      addedAt: now,
      lastUsedAt: now,
    };

    const currentConfig = this.configSignal();
    if (currentConfig) {
      // Check if server already exists
      const existingIndex = currentConfig.configurations.findIndex(
        c => c.id === id
      );
      if (existingIndex >= 0) {
        // Update existing
        const updated = { ...currentConfig };
        updated.configurations = [...updated.configurations];
        updated.configurations[existingIndex] = {
          ...updated.configurations[existingIndex],
          serverUrl,
          displayName: displayName ?? config.displayName,
          userProfile:
            userProfile ?? updated.configurations[existingIndex].userProfile,
          lastUsedAt: now,
        };
        this.saveConfig(updated);
        this.configSignal.set(updated);
        return updated.configurations[existingIndex];
      }

      // Add new
      const updated: AppConfigV2 = {
        ...currentConfig,
        configurations: [...currentConfig.configurations, config],
      };
      this.saveConfig(updated);
      this.configSignal.set(updated);
    } else {
      // First config
      const newConfig: AppConfigV2 = {
        version: 2,
        activeConfigId: id,
        configurations: [config],
      };
      this.saveConfig(newConfig);
      this.configSignal.set(newConfig);
    }

    return config;
  }

  /**
   * Remove a configuration
   */
  removeConfig(configId: string): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;

    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: currentConfig.configurations.filter(
        c => c.id !== configId
      ),
    };

    // If we removed the active config, switch to another one
    if (currentConfig.activeConfigId === configId) {
      updated.activeConfigId = updated.configurations[0]?.id ?? LOCAL_CONFIG_ID;
    }

    this.saveConfig(updated);
    this.configSignal.set(updated);
  }

  /**
   * Switch to a different configuration
   */
  switchToConfig(configId: string): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;

    const config = currentConfig.configurations.find(c => c.id === configId);
    if (!config) {
      console.warn(`[StorageContext] Config not found: ${configId}`);
      return;
    }

    const now = new Date().toISOString();
    const updated: AppConfigV2 = {
      ...currentConfig,
      activeConfigId: configId,
      configurations: currentConfig.configurations.map(c =>
        c.id === configId ? { ...c, lastUsedAt: now } : c
      ),
    };

    this.saveConfig(updated);
    this.configSignal.set(updated);
  }

  /**
   * Update the display name of a configuration
   */
  updateConfigDisplayName(configId: string, displayName: string): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;

    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: currentConfig.configurations.map(c =>
        c.id === configId ? { ...c, displayName } : c
      ),
    };

    this.saveConfig(updated);
    this.configSignal.set(updated);
  }

  /**
   * Update the user profile for a configuration
   */
  updateConfigUserProfile(
    configId: string,
    userProfile: { name: string; username: string; avatarUrl?: string }
  ): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;

    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: currentConfig.configurations.map(c =>
        c.id === configId ? { ...c, userProfile } : c
      ),
    };

    this.saveConfig(updated);
    this.configSignal.set(updated);
  }

  /**
   * Update the server version info for a configuration
   */
  updateConfigVersionInfo(
    configId: string,
    versionInfo: ServerVersionInfo
  ): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;

    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: currentConfig.configurations.map(c =>
        c.id === configId ? { ...c, versionInfo } : c
      ),
    };

    this.saveConfig(updated);
    this.configSignal.set(updated);
  }

  /**
   * Clear all configuration (for testing or reset)
   */
  clearConfig(): void {
    localStorage.removeItem(APP_CONFIG_STORAGE_KEY);
    this.configSignal.set(null);
  }

  /**
   * Force reload config from localStorage
   */
  reloadConfig(): void {
    this.loadConfig();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current mode (server or local)
   */
  getMode(): 'server' | 'local' {
    return this.activeConfig()?.type ?? 'local';
  }

  /**
   * Get the current server URL (undefined for local mode)
   */
  getServerUrl(): string | undefined {
    return this.activeConfig()?.serverUrl;
  }

  /**
   * Get WebSocket URL from current server URL
   */
  getWebSocketUrl(): string | undefined {
    const serverUrl = this.getServerUrl();
    if (!serverUrl) return undefined;

    try {
      const url = new URL(serverUrl);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${url.host}`;
    } catch {
      return undefined;
    }
  }

  /**
   * List all IndexedDB databases for a given context prefix
   */
  async listDatabasesForContext(configId: string): Promise<string[]> {
    const prefix = this.getPrefixForConfig(configId);
    const databases: string[] = [];

    if ('databases' in indexedDB) {
      try {
        const allDbs = await indexedDB.databases();
        for (const db of allDbs) {
          if (db.name?.startsWith(prefix)) {
            databases.push(db.name);
          }
        }
      } catch (error) {
        console.warn('[StorageContext] Failed to list databases:', error);
      }
    }

    return databases;
  }

  /**
   * List all localStorage keys for a given context prefix
   */
  listLocalStorageKeysForContext(configId: string): string[] {
    const prefix = this.getPrefixForConfig(configId);
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }
}
