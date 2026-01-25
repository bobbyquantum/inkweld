import { computed, inject, Injectable, signal } from '@angular/core';
import { User } from '@inkweld/index';

import { environment } from '../../../environments/environment';
import {
  LOCAL_CONFIG_ID,
  ServerConfig,
  StorageContextService,
} from './storage-context.service';

/**
 * App config interface for convenience access.
 */
export interface AppConfig {
  mode: 'server' | 'local';
  serverUrl?: string;
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
  private storageContext = inject(StorageContextService);

  /** Whether the app is configured (has at least one config) */
  readonly isConfigured = computed(() => this.storageContext.isConfigured());

  /** Current app config (derived from active config for backward compatibility) */
  readonly appConfig = computed<AppConfig | null>(() => {
    const config = this.storageContext.getActiveConfig();
    if (!config) return null;

    return {
      mode: config.type,
      serverUrl: config.serverUrl,
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
   * Auto-configure for hosted deployments with pre-set API URLs
   * This allows Cloudflare/hosted deployments to skip manual setup
   */
  private autoConfigureIfNeeded(): void {
    const preConfiguredUrl = environment.apiUrl;
    if (!this.hasPreConfiguredApiUrl()) return;

    const activeConfig = this.storageContext.getActiveConfig();

    // If we have a pre-configured URL, and it's different from the stored one,
    // we should update it. This ensures that if a user moves between preview/prod
    // or if the worker URL changes, the app stays in sync with its build.
    if (
      !activeConfig ||
      activeConfig.type !== 'server' ||
      activeConfig.serverUrl !== preConfiguredUrl
    ) {
      console.log(
        '[SetupService] Auto-configuring for hosted deployment:',
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
  async configureServerMode(serverUrl: string): Promise<void> {
    this.isLoading.set(true);
    try {
      // Validate server connection
      const response = await fetch(`${serverUrl}/api/v1/health`);
      if (!response.ok) {
        throw new Error('Server is not reachable');
      }

      // Add server config and switch to it
      const serverConfig = this.storageContext.addServerConfig(serverUrl);
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
      // Add local config and switch to it
      this.storageContext.addLocalConfig(userProfile);
      this.storageContext.switchToConfig(LOCAL_CONFIG_ID);
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
   * Get the current configuration mode
   */
  getMode(): 'server' | 'local' | null {
    const config = this.storageContext.getActiveConfig();
    return config?.type ?? null;
  }

  /**
   * Get the server URL if in server mode
   */
  getServerUrl(): string | null {
    return this.storageContext.getServerUrl() ?? null;
  }

  /**
   * Get the local user profile if in local mode
   */
  getLocalUserProfile(): User | null {
    const config = this.storageContext.getActiveConfig();
    if (config?.type === 'local' && config.userProfile) {
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
