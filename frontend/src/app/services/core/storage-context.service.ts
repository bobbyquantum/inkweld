import { computed, Injectable, signal } from '@angular/core';
import { djb2Hex } from '@utils/schema-hash';
import { stripTrailingSlashes } from '@utils/string-utils';

import { environment } from '../../../environments/environment';

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
 * Cloud storage providers supported by Cloud Sync mode.
 * Each provider has its own OAuth flow and file API adapter.
 */
export type CloudProvider = 'dropbox' | 'google-drive' | 'onedrive';

/**
 * How the app stores and syncs data for a configuration:
 * - `local`: browser storage only (Browser mode)
 * - `cloud`: browser storage mirrored to the user's own cloud storage
 *   (Cloud Sync mode). No Inkweld server, no Inkweld account.
 * - `server`: connected to an Inkweld server (Realtime Sync mode)
 */
export type StorageConfigType = 'local' | 'cloud' | 'server';

/**
 * Server/mode configuration for storage isolation
 */
export interface ServerConfig {
  /**
   * Unique ID: "local", first 8 chars of hash(serverUrl) for servers, or
   * "cloud-{provider}-{accountHash}" for cloud sync configs
   */
  id: string;

  /** Configuration type */
  type: StorageConfigType;

  /** Server URL (undefined for local and cloud modes) */
  serverUrl?: string;

  /** Cloud storage provider (cloud mode only) */
  cloudProvider?: CloudProvider;

  /**
   * Provider account identifier (cloud mode only). Opaque provider account id,
   * used to keep two accounts on the same provider in separate storage
   * contexts. Not the user's email.
   */
  cloudAccountId?: string;

  /** Human-readable account label shown in the UI, e.g. the account email */
  cloudAccountLabel?: string;

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

/**
 * True for modes with no Inkweld server behind them: local (Browser) mode and
 * cloud sync mode. Most call sites only care about this distinction, because
 * both store everything in the browser and never talk to an Inkweld API.
 */
export function isLocalOrCloudMode(
  mode: StorageConfigType | null | undefined
): boolean {
  return mode === 'local' || mode === 'cloud';
}

/** Human-readable provider names for display */
export function getCloudProviderDisplayName(provider: CloudProvider): string {
  switch (provider) {
    case 'dropbox':
      return 'Dropbox';
    case 'google-drive':
      return 'Google Drive';
    case 'onedrive':
      return 'OneDrive';
  }
}

/** Storage key for app configuration */
export const APP_CONFIG_STORAGE_KEY = 'inkweld-app-config';

/** The local mode config ID is always "local" */
export const LOCAL_CONFIG_ID = 'local';

/** Prefix shared by all cloud sync config IDs */
export const CLOUD_CONFIG_ID_PREFIX = 'cloud-';

/**
 * Build the config ID for a cloud sync configuration.
 * Stable for a given provider + account so reconnecting the same account
 * lands back in the same storage context.
 */
export function buildCloudConfigId(
  provider: CloudProvider,
  accountId: string
): string {
  return `${CLOUD_CONFIG_ID_PREFIX}${provider}-${djb2Hex(accountId)}`;
}

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
 * - "cloud-{provider}-{hash}:" for cloud sync mode (hash of provider account id)
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

  /**
   * Computed: true when there is no Inkweld server behind the active config,
   * i.e. local (Browser) mode or cloud sync mode. Most callers use this to
   * decide between HTTP/WebSocket and browser storage, and cloud sync behaves
   * like local storage for that purpose.
   */
  readonly isLocalMode = computed<boolean>(() => {
    return isLocalOrCloudMode(this.activeConfig()?.type);
  });

  /** Computed: is in cloud sync mode */
  readonly isCloudMode = computed<boolean>(() => {
    return this.activeConfig()?.type === 'cloud';
  });

  /** Computed: is connected to an Inkweld server */
  readonly isServerMode = computed<boolean>(() => {
    return this.activeConfig()?.type === 'server';
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
        parsed.version === 2
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
    return djb2Hex(this.normalizeUrl(url));
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
      return stripTrailingSlashes(url.toLowerCase());
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
    if (configId.startsWith(CLOUD_CONFIG_ID_PREFIX)) return `${configId}:`;
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
  addLocalConfig(userProfile?: { name: string; username: string }): void {
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
        return;
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
  }

  /**
   * Add a server configuration
   */
  addServerConfig(
    serverUrl: string,
    displayName?: string,
    userProfile?: { name: string; username: string }
  ): ServerConfig {
    // Normalize server URL: remove trailing slashes
    const normalizedUrl = stripTrailingSlashes(serverUrl);
    const now = new Date().toISOString();
    const id = this.hashServerUrl(normalizedUrl);
    const config: ServerConfig = {
      id,
      type: 'server',
      serverUrl: normalizedUrl,
      displayName: displayName ?? this.getDefaultDisplayName(normalizedUrl),
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
          serverUrl: normalizedUrl,
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
   * Add a cloud sync configuration (or update it if the same provider account
   * is already configured). Does not switch to it.
   */
  addCloudConfig(options: {
    provider: CloudProvider;
    accountId: string;
    accountLabel?: string;
    displayName?: string;
    userProfile?: { name: string; username: string; avatarUrl?: string };
  }): ServerConfig {
    const now = new Date().toISOString();
    const id = buildCloudConfigId(options.provider, options.accountId);
    const config: ServerConfig = {
      id,
      type: 'cloud',
      cloudProvider: options.provider,
      cloudAccountId: options.accountId,
      cloudAccountLabel: options.accountLabel,
      displayName:
        options.displayName ?? getCloudProviderDisplayName(options.provider),
      userProfile: options.userProfile,
      addedAt: now,
      lastUsedAt: now,
    };

    const currentConfig = this.configSignal();
    if (!currentConfig) {
      const newConfig: AppConfigV2 = {
        version: 2,
        activeConfigId: id,
        configurations: [config],
      };
      this.saveConfig(newConfig);
      this.configSignal.set(newConfig);
      return config;
    }

    const existingIndex = currentConfig.configurations.findIndex(
      c => c.id === id
    );
    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: [...currentConfig.configurations],
    };
    if (existingIndex >= 0) {
      const existing = updated.configurations[existingIndex];
      updated.configurations[existingIndex] = {
        ...existing,
        cloudAccountLabel: options.accountLabel ?? existing.cloudAccountLabel,
        displayName: options.displayName ?? existing.displayName,
        userProfile: options.userProfile ?? existing.userProfile,
        lastUsedAt: now,
      };
      this.saveConfig(updated);
      this.configSignal.set(updated);
      return updated.configurations[existingIndex];
    }

    updated.configurations.push(config);
    this.saveConfig(updated);
    this.configSignal.set(updated);
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

    const configExists = currentConfig.configurations.some(
      c => c.id === configId
    );
    if (!configExists) {
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
   * Clear the cached user profile for a configuration (e.g. on logout)
   */
  clearConfigUserProfile(configId: string): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;

    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: currentConfig.configurations.map(c =>
        c.id === configId ? { ...c, userProfile: undefined } : c
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
   * Get the current mode (server, cloud or local)
   */
  getMode(): StorageConfigType {
    return this.activeConfig()?.type ?? 'local';
  }

  /**
   * Get the current server URL (undefined for local mode)
   */
  getServerUrl(): string | undefined {
    return this.activeConfig()?.serverUrl;
  }

  /**
   * Canonical API base URL: the runtime-configured server, falling back to
   * the build-time environment default (dev / electron). Services must use
   * this instead of `environment.apiUrl` directly — the environment constant
   * only matches the actual server when the app happens to be deployed
   * alongside it, and silently points at the wrong origin for any server
   * configured at runtime through the setup flow.
   */
  getApiBaseUrl(): string {
    return this.getServerUrl() ?? environment.apiUrl;
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
