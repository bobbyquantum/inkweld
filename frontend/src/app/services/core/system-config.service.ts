import { computed, inject, Injectable, signal } from '@angular/core';
import {
  ConfigurationService,
  SystemFeatures,
  SystemFeaturesAppMode,
} from '@inkweld/index';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { DocumentSyncState } from '../../models/document-sync-state';
import { SetupService } from './setup.service';

/**
 * Status for AI image generation availability.
 * - hidden: Button should not be shown (offline mode or AI not configured)
 * - disabled: Button should be shown but disabled with tooltip (no server connection)
 * - enabled: Button is fully functional
 */
export interface AiImageGenerationStatus {
  status: 'hidden' | 'disabled' | 'enabled';
  tooltip?: string;
}

/** Default system features when user explicitly chooses offline mode */
const OFFLINE_DEFAULTS: SystemFeatures = {
  aiKillSwitch: true, // Kill switch ON = AI disabled in offline mode
  aiKillSwitchLockedByEnv: false,
  aiLinting: false,
  aiImageGeneration: false,
  userApprovalRequired: false, // No approval needed in offline mode
  appMode: SystemFeaturesAppMode.Offline,
};

/** Default system features when server is unavailable (degraded online mode) */
const SERVER_UNAVAILABLE_DEFAULTS: SystemFeatures = {
  aiKillSwitch: true, // Assume kill switch ON when server unavailable
  aiKillSwitchLockedByEnv: false,
  aiLinting: false,
  aiImageGeneration: false,
  userApprovalRequired: true, // Keep strict in server mode
  appMode: SystemFeaturesAppMode.Offline, // Treat as offline when server is down
};

@Injectable({
  providedIn: 'root',
})
export class SystemConfigService {
  private readonly configApiService = inject(ConfigurationService);
  private readonly setupService = inject(SetupService);

  private readonly systemFeaturesSignal = signal<SystemFeatures>({
    aiKillSwitch: true, // Default to ON (AI disabled) for safety
    aiKillSwitchLockedByEnv: false,
    aiLinting: false,
    aiImageGeneration: false,
    userApprovalRequired: true,
    appMode: SystemFeaturesAppMode.Both,
  });

  /** Tracks if the config was loaded successfully (true) or failed/using defaults (false) */
  private readonly configLoadedSuccessfully = signal<boolean>(false);

  private isLoaded = signal(false);

  // Public readonly signals
  public readonly systemFeatures = this.systemFeaturesSignal.asReadonly();

  // AI Kill Switch signals
  public readonly isAiKillSwitchEnabled = computed(
    () => this.systemFeaturesSignal().aiKillSwitch ?? true
  );
  public readonly isAiKillSwitchLockedByEnv = computed(
    () => this.systemFeaturesSignal().aiKillSwitchLockedByEnv ?? false
  );

  public readonly isAiLintingEnabled = computed(
    () => this.systemFeaturesSignal().aiLinting ?? false
  );
  public readonly isAiImageGenerationEnabled = computed(
    () => this.systemFeaturesSignal().aiImageGeneration ?? false
  );
  public readonly isUserApprovalRequired = computed(
    () => this.systemFeaturesSignal().userApprovalRequired ?? true
  );
  public readonly isConfigLoaded = this.isLoaded.asReadonly();

  constructor() {
    this.loadSystemFeatures();
  }

  /**
   * Load system features configuration from the backend.
   * In offline mode, use sensible defaults without making any API calls.
   */
  private loadSystemFeatures(): void {
    // Check if we're in offline mode - don't call API in offline mode
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      console.log(
        '[SystemConfig] Offline mode - using default features without API call'
      );
      this.systemFeaturesSignal.set(OFFLINE_DEFAULTS);
      this.configLoadedSuccessfully.set(true); // Intentional offline mode
      this.isLoaded.set(true);
      return;
    }

    this.configApiService
      .getSystemFeatures()
      .pipe(
        tap(features => {
          console.log('[SystemConfig] Loaded system features:', features);
          this.systemFeaturesSignal.set(features);
          this.configLoadedSuccessfully.set(true); // HTTP API worked
          this.isLoaded.set(true);
        }),
        catchError(error => {
          console.warn(
            '[SystemConfig] Failed to load system features, using offline defaults:',
            error
          );
          // Use server unavailable defaults - operates in degraded offline mode
          this.systemFeaturesSignal.set(SERVER_UNAVAILABLE_DEFAULTS);
          this.configLoadedSuccessfully.set(false); // HTTP API failed
          this.isLoaded.set(true);
          return of(null);
        })
      )
      .subscribe();
  }

  /**
   * Refresh system features configuration
   */
  public refreshSystemFeatures(): void {
    this.isLoaded.set(false);
    this.loadSystemFeatures();
  }

  /**
   * Determine the AI image generation button status based on mode, config, and connection.
   *
   * @param syncState - The current project sync state (optional, for connection check)
   * @returns Status object indicating if button should be hidden, disabled, or enabled
   *
   * Logic:
   * 1. True offline mode (user chose offline) → hidden (AI features are never available)
   * 2. Config not loaded yet → disabled with "Loading..." tooltip
   * 3. Config loaded successfully with AI enabled → enabled (HTTP API works)
   * 4. Config loaded successfully with AI disabled → hidden
   * 5. Config failed to load AND sync state is disconnected → disabled with tooltip
   *
   * Note: We prioritize the config API response over WebSocket sync state because
   * AI image generation uses HTTP, not WebSocket. If the config loaded successfully
   * with aiImageGeneration: true, the server is available for AI requests.
   */
  public getAiImageGenerationStatus(
    syncState?: DocumentSyncState
  ): AiImageGenerationStatus {
    // Check 1: Are we in true offline mode? (user explicitly chose local-only)
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return { status: 'hidden' };
    }

    // Check 2: Is the config loaded?
    if (!this.isLoaded()) {
      return {
        status: 'disabled',
        tooltip: 'Loading server configuration...',
      };
    }

    // Check 3: Did the config load successfully indicate AI is enabled?
    // If so, enable the button - HTTP API is working, so AI will work too.
    if (this.configLoadedSuccessfully() && this.isAiImageGenerationEnabled()) {
      return { status: 'enabled' };
    }

    // Check 4: Config loaded successfully but AI is disabled on server
    if (this.configLoadedSuccessfully() && !this.isAiImageGenerationEnabled()) {
      return { status: 'hidden' };
    }

    // Check 5: Config failed to load (server unavailable)
    // Show disabled button if we're trying to connect (gives hope it might work)
    if (
      syncState !== undefined &&
      (syncState === DocumentSyncState.Syncing ||
        syncState === DocumentSyncState.Offline ||
        syncState === DocumentSyncState.Unavailable)
    ) {
      return {
        status: 'disabled',
        tooltip: 'Not connected to server. AI image generation is unavailable.',
      };
    }

    // Fallback: hide the button
    return { status: 'hidden' };
  }

  /**
   * Check if we're in pure offline mode (explicitly chosen offline, not just disconnected)
   */
  public readonly isOfflineMode = computed(
    () => this.setupService.getMode() === 'offline'
  );
}
