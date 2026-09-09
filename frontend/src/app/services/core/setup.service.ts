import { computed, inject, Injectable, signal } from '@angular/core';
import { type User } from '@inkweld/index';
import { stripTrailingSlashes } from '@utils/string-utils';

import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';
import {
  type CloudProvider,
  isLocalOrCloudMode,
  type ServerConfig,
  type StorageConfigType,
  StorageContextService,
} from './storage-context.service';

/**
 * App config interface for convenience access.
 */
export interface AppConfig {
  mode: StorageConfigType;
  serverUrl?: string;
  cloudProvider?: CloudProvider;
  userProfile?: {
    name: string;
    username: string;
  };
}

/**
 * Service for managing app configuration and setup.
 *
 * This service acts as a higher-level interface over StorageContextService,
 * providing backward-compatible methods for configuring server/local mode
 * and accessing configuration state.
 *
 * For new code requiring multi-server support, use StorageContextService directly.
 */
@Injectable({
  providedIn: 'root',
})
export class SetupService {
  private readonly storageContext = inject(StorageContextService);
  private readonly logger = inject(LoggerService);

  /** Whether the app is configured (has at least one config) */
  readonly isConfigured = computed(() => this.storageContext.isConfigured());

  /** Current app config (derived from active config for backward compatibility) */
  readonly appConfig = computed<AppConfig | null>(() => {
    const config = this.storageContext.getActiveConfig();
    if (!config) return null;

    return {
      mode: config.type,
      serverUrl: config.serverUrl,
      cloudProvider: config.cloudProvider,
      userProfile: config.userProfile
        ? {
            name: config.userProfile.name,
            username: config.userProfile.username,
          }
        : undefined,
    };
  });

  readonly isLoading = signal(false);

  constructor() {
    // Check for auto-configuration on hosted deployments
    this.autoConfigureIfNeeded();
  }

  /**
   * Check if the environment has a pre-configured API URL
   * (non-localhost URL, indicating a Cloudflare or hosted deployment)
   */
  private hasPreConfiguredApiUrl(): boolean {
    const apiUrl = environment.apiUrl;
    if (!apiUrl) return false;
    // Check if it's NOT a localhost URL
    return !apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1');
  }

  /**
   * The Inkweld server this build was deployed alongside, or null for a
   * local/dev build. Its connection is re-created on every load, so the UI
   * treats it as built in rather than removable.
   */
  getHostedServerUrl(): string | null {
    return this.hasPreConfiguredApiUrl()
      ? stripTrailingSlashes(environment.apiUrl)
      : null;
  }

  /** True for the connection that points at the hosted server of this build */
  isHostedServerConfig(config: ServerConfig): boolean {
    const hosted = this.getHostedServerUrl();
    return (
      !!hosted &&
      config.type === 'server' &&
      stripTrailingSlashes(config.serverUrl ?? '') === hosted
    );
  }

  /**
   * Auto-configure for hosted deployments with pre-set API URLs
   * This allows Cloudflare/hosted deployments to skip manual setup
   */
  private autoConfigureIfNeeded(): void {
    // Builds can opt out (environment.autoConfigure === false) so the setup
    // screen offers a choice of modes even with a hosted apiUrl baked in.
    // Read with a cast like cloudSync: the base environment does not declare
    // every field that replaced environment files may carry.
    const autoConfigure = (environment as { autoConfigure?: boolean })
      .autoConfigure;
    if (autoConfigure === false) return;

    const preConfiguredUrl = environment.apiUrl;
    if (!this.hasPreConfiguredApiUrl()) return;

    const activeConfig = this.storageContext.getActiveConfig();

    // A user who deliberately chose Browser or Cloud Sync mode on a hosted
    // deployment keeps that choice; the hosted server stays available as a
    // profile they can switch to. Only server configs are auto-managed.
    if (activeConfig && activeConfig.type !== 'server') {
      if (!this.storageContext.hasServerConfig(preConfiguredUrl)) {
        this.storageContext.addServerConfig(preConfiguredUrl, 'Hosted Server');
      }
      return;
    }

    // If we have a pre-configured URL, and it's different from the stored one,
    // we should update it. This ensures that if a user moves between preview/prod
    // or if the worker URL changes, the app stays in sync with its build.
    if (activeConfig?.serverUrl !== preConfiguredUrl) {
      this.logger.debug(
        'SetupService',
        'Auto-configuring for hosted deployment:',
        preConfiguredUrl
      );

      // Add or update the server config and switch to it
      const serverConfig = this.storageContext.addServerConfig(
        preConfiguredUrl,
        'Hosted Server'
      );
      this.storageContext.switchToConfig(serverConfig.id);
    }
  }

  /**
   * Check if the app has been configured
   */
  checkConfiguration(): boolean {
    return this.isConfigured();
  }

  /**
   * Configure the app for server mode
   */
  async configureServerMode(
    serverUrl: string,
    options: { username?: string } = {}
  ): Promise<void> {
    this.isLoading.set(true);
    try {
      // Strip trailing slashes to prevent double-slash URLs
      const normalizedUrl = stripTrailingSlashes(serverUrl);

      // Validate server connection
      const response = await fetch(`${normalizedUrl}/api/v1/health`);
      if (!response.ok) {
        throw new Error('Server is not reachable');
      }

      // Add (or find) the server profile and switch to it. Passing the
      // username the user is about to log in with keeps a second author on
      // the same server in a separate profile.
      const serverConfig = this.storageContext.addServerConfig(
        normalizedUrl,
        undefined,
        undefined,
        options
      );
      this.storageContext.switchToConfig(serverConfig.id);
    } catch (error) {
      console.error('Failed to configure server mode:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Configure the app for local mode
   */
  configureLocalMode(userProfile: { name: string; username: string }): void {
    this.isLoading.set(true);
    try {
      // Add (or find) the Browser profile for this username and switch to it
      const config = this.storageContext.addLocalConfig(userProfile);
      this.storageContext.switchToConfig(config.id);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Configure the app for cloud sync mode with the given provider account.
   * The caller has already completed the provider OAuth flow; this only
   * records the configuration and switches the storage context to it.
   */
  configureCloudMode(options: {
    provider: CloudProvider;
    accountId: string;
    accountLabel?: string;
    userProfile: { name: string; username: string; avatarUrl?: string };
  }): ServerConfig {
    this.isLoading.set(true);
    try {
      const config = this.storageContext.addCloudConfig(options);
      this.storageContext.switchToConfig(config.id);
      return config;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Reset the app configuration (removes all server configs)
   */
  resetConfiguration(): void {
    this.storageContext.clearConfig();
  }

  /**
   * Get the current configuration mode.
   *
   * Prefer {@link isServerMode} / {@link isLocalMode} / {@link isCloudMode}
   * for branching: most code only cares whether an Inkweld server is
   * involved, and cloud sync mode must take the local path there.
   */
  getMode(): StorageConfigType | null {
    const config = this.storageContext.getActiveConfig();
    return config?.type ?? null;
  }

  /** True when connected to an Inkweld server (Realtime Sync mode) */
  isServerMode(): boolean {
    return this.getMode() === 'server';
  }

  /**
   * True when there is no Inkweld server: Browser mode or Cloud Sync mode.
   * Both store everything in the browser; cloud sync additionally mirrors to
   * the user's cloud storage, which is transparent to callers of this method.
   */
  isLocalMode(): boolean {
    return isLocalOrCloudMode(this.getMode());
  }

  /** True when in Cloud Sync mode */
  isCloudMode(): boolean {
    return this.getMode() === 'cloud';
  }

  /** The active cloud provider, or null outside cloud sync mode */
  getCloudProvider(): CloudProvider | null {
    return this.storageContext.getActiveConfig()?.cloudProvider ?? null;
  }

  /**
   * Get the server URL if in server mode
   */
  getServerUrl(): string | null {
    return this.storageContext.getServerUrl() ?? null;
  }

  /**
   * Get the locally stored user profile (local and cloud sync modes)
   */
  getLocalUserProfile(): User | null {
    const config = this.storageContext.getActiveConfig();
    if (config?.type !== 'server' && config?.userProfile) {
      return {
        id: '',
        name: config.userProfile.name,
        username: config.userProfile.username,
        enabled: true,
      };
    }
    return null;
  }

  /**
   * Get the WebSocket URL based on current mode
   * In server mode, converts the server URL to WebSocket URL
   * In local mode or when no server URL is set, returns null
   */
  getWebSocketUrl(): string | null {
    return this.storageContext.getWebSocketUrl() ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-SERVER MANAGEMENT (NEW API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the active server configuration
   */
  getActiveConfig(): ServerConfig | null {
    return this.storageContext.getActiveConfig();
  }

  /**
   * Get all configured servers/modes
   */
  getConfigurations(): ServerConfig[] {
    return this.storageContext.getConfigurations();
  }

  /**
   * Get a configuration by ID
   */
  getConfigById(configId: string): ServerConfig | undefined {
    return this.storageContext.getConfigById(configId);
  }

  /**
   * Check if a server URL is already configured
   */
  hasServerConfig(serverUrl: string): boolean {
    return this.storageContext.hasServerConfig(serverUrl);
  }

  /**
   * Add a new server configuration (doesn't switch to it)
   */
  async addServerConfig(
    serverUrl: string,
    displayName?: string
  ): Promise<ServerConfig> {
    // Validate server connection
    const response = await fetch(`${serverUrl}/api/v1/health`);
    if (!response.ok) {
      throw new Error('Server is not reachable');
    }

    return this.storageContext.addServerConfig(serverUrl, displayName);
  }

  /**
   * Remove a server configuration
   */
  removeConfig(configId: string): void {
    this.storageContext.removeConfig(configId);
  }

  /**
   * Switch to a different configuration (server or local)
   */
  switchToConfig(configId: string): void {
    this.storageContext.switchToConfig(configId);
  }

  /**
   * Update the display name of a configuration
   */
  updateConfigDisplayName(configId: string, displayName: string): void {
    this.storageContext.updateConfigDisplayName(configId, displayName);
  }

  /**
   * Update the user profile for a configuration
   */
  updateConfigUserProfile(
    configId: string,
    userProfile: { name: string; username: string; avatarUrl?: string }
  ): void {
    this.storageContext.updateConfigUserProfile(configId, userProfile);
  }

  /**
   * Get the storage prefix for the current context
   */
  getStoragePrefix(): string {
    return this.storageContext.getPrefix();
  }

  /**
   * Get the StorageContextService for advanced operations
   */
  getStorageContext(): StorageContextService {
    return this.storageContext;
  }
}
