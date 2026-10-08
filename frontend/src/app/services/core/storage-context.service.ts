import { computed, Injectable, signal } from '@angular/core';
import { forEachSequential } from '@inkweld/async';
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
 * Each provider has its own connect flow (OAuth, or a server address plus
 * app password for self-hosted Nextcloud) and file API adapter.
 */
export type CloudProvider =
  'dropbox' | 'nextcloud' | 'google-drive' | 'onedrive';

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

  /**
   * Set on a connection whose projects were copied to another connection
   * (e.g. Browser upgraded to a server), so the history stays visible.
   */
  migratedTo?: MigrationRecord;

  /** Set on a connection that received projects from another connection */
  migratedFrom?: MigrationRecord;

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

/** Display name for a Browser-mode connection */
export function getLocalConfigDisplayName(config: ServerConfig): string {
  return config.displayName?.trim() || 'Browser';
}

/** Human-readable provider names for display */
export function getCloudProviderDisplayName(provider: CloudProvider): string {
  switch (provider) {
    case 'dropbox':
      return 'Dropbox';
    case 'nextcloud':
      return 'Nextcloud';
    case 'google-drive':
      return 'Google Drive';
    case 'onedrive':
      return 'OneDrive';
  }
}

/** One hop in a connection's history: where projects came from or went */
export interface MigrationRecord {
  /** The other connection's id (it may since have been removed) */
  configId: string;
  /** Display name of the other connection at the time */
  displayName?: string;
  /** Username on the *destination* connection the projects were written under */
  username?: string;
  projectCount: number;
  /** ISO timestamp */
  at: string;
}

/** Outcome of {@link StorageContextService.renameProjectInContext} */
export interface ProjectRenameResult {
  /** Yjs databases copied to the new slug */
  databasesMoved: number;
  /** Databases that could not be copied; their originals are kept */
  errors: string[];
}

/** What one connection (or an orphaned prefix) has stored on this device */
export interface ContextDataSummary {
  prefix: string;
  databases: string[];
  localStorageKeys: string[];
}

/**
 * Pull the context prefix off a storage name: "local:", "srv:<hash>:" or
 * "cloud-<provider>-<hash>:". Returns null for unprefixed app-wide keys.
 */
export function extractContextPrefix(name: string): string | null {
  const match =
    /^(local:|local-[0-9a-f]+:|srv:[0-9a-f-]+:|cloud-[a-z0-9-]+?-[0-9a-f]+:)/.exec(
      name
    );
  return match ? match[1] : null;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB error'));
  });
}

interface StoreShape {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: {
    name: string;
    keyPath: string | string[];
    unique: boolean;
    multiEntry: boolean;
  }[];
}

/** Open `name` only if it already exists; never creates an empty shell */
function openExistingDatabase(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let created = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      // Only a database that did not exist gets here without a version bump
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = event => {
      if (created) {
        event.preventDefault();
        resolve(null);
      } else {
        reject(request.error ?? new Error(`Failed to open ${name}`));
      }
    };
  });
}

function createStores(db: IDBDatabase, shapes: StoreShape[]): void {
  for (const shape of shapes) {
    if (db.objectStoreNames.contains(shape.name)) continue;
    const store = db.createObjectStore(shape.name, {
      keyPath: shape.keyPath ?? undefined,
      autoIncrement: shape.autoIncrement,
    });
    for (const index of shape.indexes) {
      store.createIndex(index.name, index.keyPath, {
        unique: index.unique,
        multiEntry: index.multiEntry,
      });
    }
  }
}

/**
 * Copy an IndexedDB database to a new name: same version, same object stores
 * and indexes, every record. Records in stores with out-of-line keys keep
 * their original keys.
 *
 * If the target already exists it is merged into, never overwritten:
 * records of out-of-line autoIncrement stores (y-indexeddb's `updates` log)
 * are appended under fresh keys, which is lossless for Yjs updates, and in
 * every other store a record is only added when its key is not taken.
 */
export async function cloneDatabase(
  sourceName: string,
  targetName: string
): Promise<void> {
  const source = await requestToPromise(indexedDB.open(sourceName));
  try {
    const shapes: StoreShape[] = Array.from(source.objectStoreNames).map(
      storeName => {
        const store = source
          .transaction(storeName, 'readonly')
          .objectStore(storeName);
        return {
          name: storeName,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: Array.from(store.indexNames).map(indexName => {
            const index = store.index(indexName);
            return {
              name: indexName,
              keyPath: index.keyPath,
              unique: index.unique,
              multiEntry: index.multiEntry,
            };
          }),
        };
      }
    );

    const existing = await openExistingDatabase(targetName);
    const merge = existing !== null;
    let version = source.version;
    if (existing) {
      const missing = shapes.some(
        shape => !existing.objectStoreNames.contains(shape.name)
      );
      version = missing ? existing.version + 1 : existing.version;
      existing.close();
    }

    const openTarget = indexedDB.open(targetName, version);
    openTarget.onupgradeneeded = () => createStores(openTarget.result, shapes);
    const target = await requestToPromise(openTarget);
    try {
      // Sequential: one readwrite transaction per store on the target database.
      await forEachSequential(shapes, async shape => {
        const records = await readAll(source, shape.name);
        if (records.length === 0) return;
        await new Promise<void>((resolve, reject) => {
          const tx = target.transaction(shape.name, 'readwrite');
          const store = tx.objectStore(shape.name);
          for (const { key, value } of records) {
            if (!merge) {
              if (shape.keyPath) store.put(value);
              else store.put(value, key);
            } else if (!shape.keyPath && shape.autoIncrement) {
              store.add(value);
            } else {
              const request = shape.keyPath
                ? store.add(value)
                : store.add(value, key);
              // Key already taken: the target's own record wins
              request.onerror = event => {
                if (request.error?.name !== 'ConstraintError') return;
                event.preventDefault();
                event.stopPropagation();
              };
            }
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(tx.error ?? new Error('IndexedDB write failed'));
          tx.onabort = () =>
            reject(tx.error ?? new Error('IndexedDB write aborted'));
        });
      });
    } finally {
      target.close();
    }
  } finally {
    source.close();
  }
}

/**
 * In every object store of `dbName`, move records whose string primary key is
 * `oldKey` or starts with `oldKey:` or `oldKey/` to the corresponding `newKey`
 * form, and rewrite any string field equal to `oldKey`. A missing database is
 * skipped.
 */
async function rekeyProjectRecords(
  dbName: string,
  oldKey: string,
  newKey: string
): Promise<void> {
  const names = await (async () => {
    if (!('databases' in indexedDB)) return [];
    try {
      return (await indexedDB.databases()).map(d => d.name ?? '');
    } catch {
      return [];
    }
  })();
  if (!names.includes(dbName)) return;
  const db = await requestToPromise(indexedDB.open(dbName));
  try {
    // Sequential: one transaction per store on the same database.
    await forEachSequential(
      Array.from(db.objectStoreNames),
      async storeName => {
        const records = await readAll(db, storeName);
        const moves = records.filter(
          r =>
            typeof r.key === 'string' &&
            (r.key === oldKey ||
              r.key.startsWith(`${oldKey}:`) ||
              r.key.startsWith(`${oldKey}/`))
        );
        if (moves.length === 0) return;
        const keyPath = db
          .transaction(storeName, 'readonly')
          .objectStore(storeName).keyPath;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const { key, value } of moves) {
            const nextKey = `${newKey}${(key as string).slice(oldKey.length)}`;
            const nextValue = rewriteKeyFields(
              value,
              oldKey,
              newKey,
              keyPath,
              nextKey
            );
            store.delete(key);
            if (keyPath) store.put(nextValue);
            else store.put(nextValue, nextKey);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(tx.error ?? new Error('IndexedDB rekey failed'));
          tx.onabort = () =>
            reject(tx.error ?? new Error('IndexedDB rekey aborted'));
        });
      }
    );
  } finally {
    db.close();
  }
}

/**
 * Move the cached project record (ProjectService's `projects` store, keyed by
 * `username/slug`) to its new key with the new slug. A missing database or
 * record is skipped; a record already under the new key is kept.
 */
async function moveCachedProject(
  dbName: string,
  oldKey: string,
  newKey: string,
  newSlug: string
): Promise<void> {
  const db = await openExistingDatabase(dbName);
  if (!db) return;
  try {
    if (!db.objectStoreNames.contains('projects')) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const read = store.get(oldKey);
      read.onsuccess = () => {
        const cached = read.result as Record<string, unknown> | undefined;
        if (!cached) return;
        store.delete(oldKey);
        const write = store.add({ ...cached, slug: newSlug }, newKey);
        write.onerror = event => {
          if (write.error?.name !== 'ConstraintError') return;
          event.preventDefault();
          event.stopPropagation();
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Project cache move failed'));
      tx.onabort = () =>
        reject(tx.error ?? new Error('Project cache move aborted'));
    });
  } finally {
    db.close();
  }
}

function rewriteKeyFields(
  value: unknown,
  oldKey: string,
  newKey: string,
  keyPath: string | string[] | null,
  nextKey: string
): unknown {
  // Arrays (e.g. the saved tab list) hold no project key fields; spreading
  // one into an object would turn it into {0: …, 1: …}.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return value;
  const out: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
  };
  for (const [field, v] of Object.entries(out)) {
    if (typeof v !== 'string') continue;
    if (v === oldKey) out[field] = newKey;
    else if (v.startsWith(`${oldKey}:`))
      out[field] = `${newKey}${v.slice(oldKey.length)}`;
  }
  if (typeof keyPath === 'string') out[keyPath] = nextKey;
  return out;
}

function readAll(
  db: IDBDatabase,
  storeName: string
): Promise<{ key: IDBValidKey; value: unknown }[]> {
  return new Promise((resolve, reject) => {
    const records: { key: IDBValidKey; value: unknown }[] = [];
    const request = db
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(records);
        return;
      }
      records.push({ key: cursor.primaryKey, value: cursor.value });
      cursor.continue();
    };
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB read failed'));
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.warn(`[StorageContext] Failed to delete database ${name}`);
      resolve();
    };
    request.onblocked = () => {
      // Another tab holds it open; the delete completes once it closes
      console.warn(`[StorageContext] Delete of ${name} blocked by an open tab`);
      resolve();
    };
  });
}

/** Storage key for app configuration */
export const APP_CONFIG_STORAGE_KEY = 'inkweld-app-config';

/**
 * Base localStorage key (before the profile prefix) for a project's tree UI
 * state on this device: expanded folders and scroll position.
 */
export function projectTreeStateKey(username: string, slug: string): string {
  return `inkweld-tree-state:${username}/${slug}`;
}

/**
 * Id of the first Browser profile. Further Browser profiles use
 * `local-<usernameHash>` (see {@link buildLocalConfigId}).
 */
export const LOCAL_CONFIG_ID = 'local';

/** Prefix shared by additional Browser profile ids */
export const LOCAL_CONFIG_ID_PREFIX = 'local-';

/** Id for a Browser profile with the given username */
export function buildLocalConfigId(username: string): string {
  return `${LOCAL_CONFIG_ID_PREFIX}${djb2Hex(username.trim().toLowerCase())}`;
}

/**
 * Id for a server profile. The first profile on a server uses the
 * `hash(serverUrl)` id; further author profiles on the same server append a
 * hash of the username so each gets its own storage prefix and login token.
 */
export function buildServerConfigId(
  serverUrlHash: string,
  username?: string
): string {
  return username
    ? `${serverUrlHash}-${djb2Hex(username.trim().toLowerCase())}`
    : serverUrlHash;
}

/** Prefix shared by all cloud sync config IDs */
export const CLOUD_CONFIG_ID_PREFIX = 'cloud-';

/**
 * Build the config ID for a cloud sync configuration.
 * Stable for a given provider + account so reconnecting the same account
 * lands back in the same storage context.
 */
export function buildCloudConfigId(
  provider: CloudProvider,
  accountId: string,
  username?: string
): string {
  const base = `${CLOUD_CONFIG_ID_PREFIX}${provider}-${djb2Hex(accountId)}`;
  return username ? `${base}-${djb2Hex(username.trim().toLowerCase())}` : base;
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
    if (
      configId === LOCAL_CONFIG_ID ||
      configId.startsWith(LOCAL_CONFIG_ID_PREFIX)
    ) {
      return `${configId}:`;
    }
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
   * Add a Browser profile (or update the one with the same username) and
   * return it. Does not switch to it. Each username gets its own storage
   * prefix, so several authors can share one browser without mixing data.
   */
  addLocalConfig(userProfile?: {
    name: string;
    username: string;
  }): ServerConfig {
    const now = new Date().toISOString();
    const currentConfig = this.configSignal();
    const locals =
      currentConfig?.configurations.filter(c => c.type === 'local') ?? [];
    const wanted = userProfile?.username.trim().toLowerCase();
    const existing =
      locals.find(
        c => wanted && c.userProfile?.username.trim().toLowerCase() === wanted
      ) ??
      // A profile with no user yet can be claimed; the first Browser id too
      locals.find(c => !c.userProfile) ??
      (locals.length === 0 || !userProfile
        ? locals.find(c => c.id === LOCAL_CONFIG_ID)
        : undefined);
    const id =
      existing?.id ??
      (locals.length === 0 || !userProfile
        ? LOCAL_CONFIG_ID
        : buildLocalConfigId(userProfile.username));
    const config: ServerConfig = {
      id,
      type: 'local',
      displayName: existing?.displayName ?? 'Browser',
      userProfile: userProfile
        ? { name: userProfile.name, username: userProfile.username }
        : existing?.userProfile,
      addedAt: existing?.addedAt ?? now,
      lastUsedAt: now,
    };

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

    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: existing
        ? currentConfig.configurations.map(c =>
            c.id === existing.id ? { ...existing, ...config } : c
          )
        : [...currentConfig.configurations, config],
    };
    this.saveConfig(updated);
    this.configSignal.set(updated);
    return updated.configurations.find(c => c.id === id) ?? config;
  }

  /**
   * Add a server configuration
   */
  addServerConfig(
    serverUrl: string,
    displayName?: string,
    userProfile?: { name: string; username: string },
    options: { username?: string } = {}
  ): ServerConfig {
    // Normalize server URL: remove trailing slashes
    const normalizedUrl = stripTrailingSlashes(serverUrl);
    const now = new Date().toISOString();
    const id = this.resolveServerConfigId(
      normalizedUrl,
      options.username ?? userProfile?.username
    );
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
   * Pick the config id for a server profile. Without a username this is the
   * per-server id. With one: reuse the profile already bound to that
   * user, else claim a profile on that server that has no user yet, else mint
   * a user-specific id so a second author gets separate storage.
   */
  private resolveServerConfigId(
    normalizedUrl: string,
    username?: string
  ): string {
    const urlHash = this.hashServerUrl(normalizedUrl);
    if (!username) return urlHash;
    const wanted = username.trim().toLowerCase();
    const onServer = this.configurations().filter(
      c =>
        c.type === 'server' && this.hashServerUrl(c.serverUrl ?? '') === urlHash
    );
    const bound = onServer.find(
      c => c.userProfile?.username.trim().toLowerCase() === wanted
    );
    if (bound) return bound.id;
    const unclaimed = onServer.find(c => !c.userProfile);
    if (unclaimed) return unclaimed.id;
    return buildServerConfigId(urlHash, username);
  }

  /**
   * Pick the config id for a cloud profile. The first author on an account
   * uses the per-account id; a further author on the same account
   * gets a username-specific id so each has its own storage and sync state.
   */
  private resolveCloudConfigId(
    provider: CloudProvider,
    accountId: string,
    username?: string
  ): string {
    const base = buildCloudConfigId(provider, accountId);
    if (!username) return base;
    const wanted = username.trim().toLowerCase();
    const onAccount = this.configurations().filter(
      c =>
        c.type === 'cloud' &&
        c.cloudProvider === provider &&
        c.cloudAccountId === accountId
    );
    const bound = onAccount.find(
      c => c.userProfile?.username.trim().toLowerCase() === wanted
    );
    if (bound) return bound.id;
    const unclaimed = onAccount.find(c => !c.userProfile);
    if (unclaimed) return unclaimed.id;
    if (onAccount.length === 0) return base;
    return buildCloudConfigId(provider, accountId, username);
  }

  /**
   * Record who just logged in on the active server profile. If the profile
   * already belongs to a different user, the login is moved to its own
   * profile (found or created) and that profile becomes active, so two
   * authors on one server never share storage or a token. Returns the
   * profile now holding the login and, when a move happened, the id it moved
   * from so the caller can carry the auth token across.
   */
  adoptServerLogin(userProfile: { name: string; username: string }): {
    config: ServerConfig;
    forkedFrom: string | null;
  } {
    const active = this.activeConfig();
    if (active?.type !== 'server' || !active.serverUrl) {
      throw new Error('No active server profile to adopt the login');
    }
    const current = active.userProfile?.username.trim().toLowerCase();
    const wanted = userProfile.username.trim().toLowerCase();
    if (!current || current === wanted) {
      this.updateConfigUserProfile(active.id, userProfile);
      return {
        config: this.getConfigById(active.id) ?? active,
        forkedFrom: null,
      };
    }
    const config = this.addServerConfig(
      active.serverUrl,
      active.displayName,
      userProfile,
      { username: userProfile.username }
    );
    this.switchToConfig(config.id);
    return { config, forkedFrom: active.id };
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
    const id = this.resolveCloudConfigId(
      options.provider,
      options.accountId,
      options.userProfile?.username
    );
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
      updated.activeConfigId = updated.configurations[0]?.id ?? '';
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
   * Record that projects moved from one connection to another. Both ends get
   * a note so either side of the history can be read later.
   */
  recordMigration(
    fromConfigId: string,
    toConfigId: string,
    details: { username?: string; projectCount: number }
  ): void {
    const currentConfig = this.configSignal();
    if (!currentConfig) return;
    const from = currentConfig.configurations.find(c => c.id === fromConfigId);
    const to = currentConfig.configurations.find(c => c.id === toConfigId);
    if (!from || !to) return;
    const at = new Date().toISOString();
    const updated: AppConfigV2 = {
      ...currentConfig,
      configurations: currentConfig.configurations.map(c => {
        if (c.id === fromConfigId) {
          return {
            ...c,
            migratedTo: {
              configId: toConfigId,
              displayName: to.displayName,
              username: details.username,
              projectCount: details.projectCount,
              at,
            },
          };
        }
        if (c.id === toConfigId) {
          return {
            ...c,
            migratedFrom: {
              configId: fromConfigId,
              displayName: from.displayName,
              username: details.username,
              projectCount: details.projectCount,
              at,
            },
          };
        }
        return c;
      }),
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
      // Keep a path prefix (reverse proxy, Home Assistant ingress).
      const path = stripTrailingSlashes(url.pathname);
      return `${protocol}//${url.host}${path}`;
    } catch {
      return undefined;
    }
  }

  /**
   * Every storage prefix in use: one per configuration. Anything in
   * IndexedDB or localStorage that starts with a context-shaped prefix not
   * in this list belongs to a connection that no longer exists.
   */
  getKnownPrefixes(): string[] {
    return this.configurations().map(c => this.getPrefixForConfig(c.id));
  }

  /**
   * Describe what a configuration has stored on this device: the IndexedDB
   * databases and localStorage keys under its prefix. Used to tell the user
   * what disconnecting will remove.
   */
  async describeContextData(configId: string): Promise<ContextDataSummary> {
    return {
      prefix: this.getPrefixForConfig(configId),
      databases: await this.listDatabasesForContext(configId),
      localStorageKeys: this.listLocalStorageKeysForContext(configId),
    };
  }

  /**
   * Delete everything a configuration stored on this device. Does not touch
   * the configuration entry itself, remote data, or unprefixed app-wide keys.
   */
  async clearContextData(configId: string): Promise<void> {
    await this.clearPrefixedData(this.getPrefixForConfig(configId));
  }

  /**
   * Find data left behind by connections that were removed without cleanup.
   * Returns one entry per orphaned prefix.
   */
  async findOrphanedData(): Promise<ContextDataSummary[]> {
    const known = new Set(this.getKnownPrefixes());
    const byPrefix = new Map<string, ContextDataSummary>();
    const collect = (name: string, kind: 'db' | 'key'): void => {
      const prefix = extractContextPrefix(name);
      if (!prefix || known.has(prefix)) return;
      let entry = byPrefix.get(prefix);
      if (!entry) {
        entry = { prefix, databases: [], localStorageKeys: [] };
        byPrefix.set(prefix, entry);
      }
      if (kind === 'db') entry.databases.push(name);
      else entry.localStorageKeys.push(name);
    };
    const databaseNames = await this.listAllDatabaseNames();
    for (const name of databaseNames) collect(name, 'db');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) collect(key, 'key');
    }
    return Array.from(byPrefix.values()).sort((a, b) =>
      a.prefix.localeCompare(b.prefix)
    );
  }

  /**
   * Copy everything one profile stores on this device into another profile's
   * prefix: every localStorage key and every IndexedDB database, renamed.
   * Existing target entries are left alone. Used to upgrade a Browser
   * profile into a fresh cloud profile without touching the original.
   */
  async cloneContextData(
    fromConfigId: string,
    toConfigId: string
  ): Promise<{
    databases: number;
    localStorageKeys: number;
    projectCount: number;
  }> {
    const from = this.getPrefixForConfig(fromConfigId);
    const to = this.getPrefixForConfig(toConfigId);
    if (from === to)
      return { databases: 0, localStorageKeys: 0, projectCount: 0 };

    let localStorageKeys = 0;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(from)) keys.push(key);
    }
    for (const key of keys) {
      const target = `${to}${key.slice(from.length)}`;
      if (localStorage.getItem(target) !== null) continue;
      const value = localStorage.getItem(key);
      if (value !== null) {
        localStorage.setItem(target, value);
        localStorageKeys++;
      }
    }

    const existing = new Set(await this.listAllDatabaseNames());
    let databases = 0;
    // Sequential: databases are copied one at a time to bound memory use.
    await forEachSequential(existing, async name => {
      if (!name.startsWith(from)) return;
      const target = `${to}${name.slice(from.length)}`;
      if (existing.has(target)) return;
      await cloneDatabase(name, target);
      databases++;
    });

    return {
      databases,
      localStorageKeys,
      projectCount: this.countProjectsForContext(fromConfigId),
    };
  }

  /**
   * Slugs of the projects in a profile's project list, keyed by username,
   * without loading them into any service.
   */
  listProjectsForContext(
    configId: string
  ): { username: string; slug: string; title?: string }[] {
    try {
      const raw = localStorage.getItem(
        `${this.getPrefixForConfig(configId)}inkweld-local-projects`
      );
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (p): p is { username: string; slug: string; title?: string } =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as { slug?: unknown }).slug === 'string' &&
            typeof (p as { username?: unknown }).username === 'string'
        )
        .map(p => ({ username: p.username, slug: p.slug, title: p.title }));
    } catch {
      return [];
    }
  }

  /**
   * Rename a project inside one profile's storage without loading it. This is
   * the one path for moving a project's local data to a new slug; it covers:
   *
   * 1. Yjs databases: elements and prose docs (`<prefix>user:slug:id`) and
   *    worldbuilding docs (`<prefix>worldbuilding:user:slug:id`) are merged
   *    into their new name and the original deleted.
   * 2. Composite keys in the media, snapshot and activation stores, and the
   *    saved tabs in the document cache.
   * 3. The cached project record, the project list entry and the project
   *    tree's saved state.
   *
   * A database that fails to copy keeps its original and is reported in
   * `errors`; the other steps still run. Used for a rename on the server
   * (from settings, or noticed while loading) and when copying a profile into
   * a cloud account that already holds a project with the same address.
   */
  async renameProjectInContext(
    configId: string,
    username: string,
    oldSlug: string,
    newSlug: string
  ): Promise<ProjectRenameResult> {
    const result: ProjectRenameResult = { databasesMoved: 0, errors: [] };
    if (oldSlug === newSlug) return result;
    const prefix = this.getPrefixForConfig(configId);
    const oldKey = `${username}/${oldSlug}`;
    const newKey = `${username}/${newSlug}`;

    // 1. Yjs document databases: <prefix><user>:<slug>:... and the
    //    worldbuilding variant <prefix>worldbuilding:<user>:<slug>:...
    const docMarkers = (slug: string): string[] => [
      `${prefix}${username}:${slug}:`,
      `${prefix}worldbuilding:${username}:${slug}:`,
    ];
    const oldMarkers = docMarkers(oldSlug);
    const newMarkers = docMarkers(newSlug);
    // Sequential: each database is copied and then removed before the next,
    // so a failure leaves at most one database half moved.
    await forEachSequential(await this.listAllDatabaseNames(), async name => {
      const index = oldMarkers.findIndex(m => name.startsWith(m));
      if (index < 0) return;
      const target = newMarkers[index] + name.slice(oldMarkers[index].length);
      try {
        await cloneDatabase(name, target);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to copy ${name} to ${target}: ${message}`);
        return;
      }
      result.databasesMoved++;
      await deleteDatabase(name);
    });

    // 2. Composite-key stores: media, snapshots, activations, saved tabs
    // Sequential: separate stores, but one rename step at a time.
    await forEachSequential(
      [
        'inkweld-media',
        'inkweld-snapshots',
        'inkweld-activations',
        'documentCache',
      ],
      base => rekeyProjectRecords(`${prefix}${base}`, oldKey, newKey)
    );

    // 3. The cached project and the project list itself
    await moveCachedProject(`${prefix}projectCache`, oldKey, newKey, newSlug);
    const listKey = `${prefix}inkweld-local-projects`;
    try {
      const raw = localStorage.getItem(listKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        const updated = (parsed as unknown[]).map((p): unknown =>
          typeof p === 'object' &&
          p !== null &&
          (p as { username?: string }).username === username &&
          (p as { slug?: string }).slug === oldSlug
            ? { ...p, slug: newSlug }
            : p
        );
        localStorage.setItem(listKey, JSON.stringify(updated));
      }
    } catch {
      // Unparseable list: nothing to rename
    }
    try {
      const oldTreeKey = prefix + projectTreeStateKey(username, oldSlug);
      const treeState = localStorage.getItem(oldTreeKey);
      if (treeState !== null) {
        localStorage.setItem(
          prefix + projectTreeStateKey(username, newSlug),
          treeState
        );
        localStorage.removeItem(oldTreeKey);
      }
    } catch {
      // Storage unavailable: the tree just starts collapsed
    }

    return result;
  }

  /**
   * Mark every project in a profile's list as activated on this device.
   * Browser mode never records activations (everything is local), so data
   * copied into a cloud or server profile would otherwise show as "download
   * to open". Writes straight to that profile's activation store.
   */
  async activateProjectsInContext(configId: string): Promise<number> {
    const projects = this.listProjectsForContext(configId);
    if (projects.length === 0) return 0;
    const dbName = `${this.getPrefixForConfig(configId)}inkweld-activations`;
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('activations')) {
        db.createObjectStore('activations', { keyPath: 'projectKey' });
      }
    };
    const db = await requestToPromise(open);
    try {
      if (!db.objectStoreNames.contains('activations')) return 0;
      const activatedAt = new Date().toISOString();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('activations', 'readwrite');
        const store = tx.objectStore('activations');
        for (const p of projects) {
          store.put({ projectKey: `${p.username}/${p.slug}`, activatedAt });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(tx.error ?? new Error('Activation write failed'));
      });
      return projects.length;
    } finally {
      db.close();
    }
  }

  /** Number of projects in a profile's project list, without loading them */
  countProjectsForContext(configId: string): number {
    try {
      const raw = localStorage.getItem(
        `${this.getPrefixForConfig(configId)}inkweld-local-projects`
      );
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }

  /** Delete all IndexedDB databases and localStorage keys under a prefix */
  async clearPrefixedData(prefix: string): Promise<void> {
    // Sequential: one database deletion at a time.
    await forEachSequential(
      (await this.listAllDatabaseNames()).filter(name =>
        name.startsWith(prefix)
      ),
      name => deleteDatabase(name)
    );
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  }

  private async listAllDatabaseNames(): Promise<string[]> {
    if (!('databases' in indexedDB)) return [];
    try {
      const all = await indexedDB.databases();
      return all.map(db => db.name).filter((n): n is string => !!n);
    } catch (error) {
      console.warn('[StorageContext] Failed to list databases:', error);
      return [];
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
