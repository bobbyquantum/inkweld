import { computed, inject, Injectable, signal } from '@angular/core';
import {
  ConfigurationService,
  SystemFeatures,
  SystemFeaturesAppMode,
  SystemFeaturesPasswordPolicy,
} from '@inkweld/index';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { DocumentSyncState } from '../../models/document-sync-state';
import { SetupService } from './setup.service';

/**
 * Status for AI image generation availability.
 * - hidden: Button should not be shown (local mode or AI not configured)
 * - disabled: Button should be shown but disabled with tooltip (no server connection)
 * - enabled: Button is fully functional
 */
export interface AiImageGenerationStatus {
  status: 'hidden' | 'disabled' | 'enabled';
  tooltip?: string;
}

/** Default password policy */
const DEFAULT_PASSWORD_POLICY: SystemFeaturesPasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

/** Default system features when user explicitly chooses local mode */
const LOCAL_DEFAULTS: SystemFeatures = {
  aiKillSwitch: true, // Kill switch ON = AI disabled in local mode
  aiKillSwitchLockedByEnv: false,
  aiLinting: false,
  aiImageGeneration: false,
  userApprovalRequired: false, // No approval needed in local mode
  appMode: SystemFeaturesAppMode.Local,
  emailEnabled: false,
  requireEmail: false,
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
};

/** Default system features when server is unavailable (degraded mode) */
const SERVER_UNAVAILABLE_DEFAULTS: SystemFeatures = {
  aiKillSwitch: true, // Assume kill switch ON when server unavailable
  aiKillSwitchLockedByEnv: false,
  aiLinting: false,
  aiImageGeneration: false,
  userApprovalRequired: true, // Keep strict in server mode
  appMode: SystemFeaturesAppMode.Local, // Treat as local when server is down
  emailEnabled: false,
  requireEmail: false,
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
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
    emailEnabled: false,
    requireEmail: false,
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
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
  public readonly isEmailEnabled = computed(
    () => this.systemFeaturesSignal().emailEnabled ?? false
  );
  public readonly isRequireEmailEnabled = computed(
    () => this.systemFeaturesSignal().requireEmail ?? false
  );
  public readonly passwordPolicy = computed(
    () => this.systemFeaturesSignal().passwordPolicy ?? DEFAULT_PASSWORD_POLICY
  );
  public readonly isConfigLoaded = this.isLoaded.asReadonly();

  constructor() {
    this.loadSystemFeatures();
  }

  /**
   * Load system features configuration from the backend.
   * In local mode, use sensible defaults without making any API calls.
   */
  private loadSystemFeatures(): void {
    // Check if we're in local mode - don't call API in local mode
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      console.log(
        '[SystemConfig] Local mode - using default features without API call'
      );
      this.systemFeaturesSignal.set(LOCAL_DEFAULTS);
      this.configLoadedSuccessfully.set(true); // Intentional local mode
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
            '[SystemConfig] Failed to load system features, using local defaults:',
            error
          );
          // Use server unavailable defaults - operates in degraded local mode
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
   * 1. True local mode (user chose local) → hidden (AI features are never available)
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
    // Check 1: Are we in true local mode? (user explicitly chose local-only)
    const mode = this.setupService.getMode();
    if (mode === 'local') {
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
        syncState === DocumentSyncState.Local ||
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
   * Check if we're in pure local mode (explicitly chosen local, not just disconnected)
   */
  public readonly isLocalMode = computed(
    () => this.setupService.getMode() === 'local'
  );
}
