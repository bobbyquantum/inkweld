import { Injectable, signal } from '@angular/core';
import { User } from '@inkweld/index';

import { environment } from '../../../environments/environment';

export interface AppConfig {
  mode: 'server' | 'offline';
  serverUrl?: string;
  userProfile?: {
    name: string;
    username: string;
  };
}

const SETUP_STORAGE_KEY = 'inkweld-app-config';

@Injectable({
  providedIn: 'root',
})
export class SetupService {
  readonly isConfigured = signal(false);
  readonly appConfig = signal<AppConfig | null>(null);
  readonly isLoading = signal(false);

  constructor() {
    this.loadConfig();
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

    const storedConfig = this.getStoredConfig();

    // If we have a pre-configured URL, and it's different from the stored one,
    // we should update it. This ensures that if a user moves between staging/prod
    // or if the worker URL changes, the app stays in sync with its build.
    if (
      !storedConfig ||
      storedConfig.mode !== 'server' ||
      storedConfig.serverUrl !== preConfiguredUrl
    ) {
      console.log(
        '[SetupService] Auto-configuring for hosted deployment:',
        preConfiguredUrl
      );

      const config: AppConfig = {
        mode: 'server',
        serverUrl: preConfiguredUrl,
      };

      this.saveConfig(config);
      this.appConfig.set(config);
      this.isConfigured.set(true);
    }
  }

  /**
   * Check if the app has been configured
   */
  checkConfiguration(): boolean {
    const config = this.getStoredConfig();
    const configured = !!config;
    this.isConfigured.set(configured);
    if (configured) {
      this.appConfig.set(config);
    }
    return configured;
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

      const config: AppConfig = {
        mode: 'server',
        serverUrl: serverUrl,
      };

      this.saveConfig(config);
      this.appConfig.set(config);
      this.isConfigured.set(true);
    } catch (error) {
      console.error('Failed to configure server mode:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Configure the app for offline mode
   */
  configureOfflineMode(userProfile: { name: string; username: string }): void {
    this.isLoading.set(true);
    try {
      const config: AppConfig = {
        mode: 'offline',
        userProfile: userProfile,
      };

      this.saveConfig(config);
      this.appConfig.set(config);
      this.isConfigured.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Reset the app configuration
   */
  resetConfiguration(): void {
    localStorage.removeItem(SETUP_STORAGE_KEY);
    this.appConfig.set(null);
    this.isConfigured.set(false);
  }

  /**
   * Get the current configuration mode
   */
  getMode(): 'server' | 'offline' | null {
    return this.appConfig()?.mode || null;
  }

  /**
   * Get the server URL if in server mode
   */
  getServerUrl(): string | null {
    const config = this.appConfig();
    return config?.mode === 'server' ? config.serverUrl || null : null;
  }

  /**
   * Get the offline user profile if in offline mode
   */
  getOfflineUserProfile(): User | null {
    const config = this.appConfig();
    if (config?.mode === 'offline' && config.userProfile) {
      return {
        id: '',
        ...config.userProfile,
        enabled: true,
      };
    }
    return null;
  }

  /**
   * Get the WebSocket URL based on current mode
   * In server mode, converts the server URL to WebSocket URL
   * In offline mode or when no server URL is set, uses environment wssUrl
   */
  getWebSocketUrl(): string | null {
    const config = this.appConfig();

    if (config?.mode === 'server' && config.serverUrl) {
      // Convert HTTP(S) URL to WebSocket URL
      try {
        const url = new URL(config.serverUrl);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${url.host}`;
      } catch (error) {
        console.error('Failed to parse server URL for WebSocket:', error);
        return null;
      }
    }

    // Fallback to environment wssUrl (for offline mode or when server URL is not set)
    // This will be empty in production unless specifically configured
    return null;
  }

  private loadConfig(): void {
    const config = this.getStoredConfig();

    if (config) {
      this.appConfig.set(config);
      this.isConfigured.set(true);
    }

    // Always check if we should auto-configure (it will return early if already correct)
    // This ensures that if the environment URL changes (e.g. staging to prod),
    // the app updates its configuration automatically.
    this.autoConfigureIfNeeded();
  }

  private getStoredConfig(): AppConfig | null {
    try {
      const stored = localStorage.getItem(SETUP_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as AppConfig) : null;
    } catch (error) {
      console.error('Failed to load stored config:', error);
      return null;
    }
  }

  private saveConfig(config: AppConfig): void {
    try {
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }
}
