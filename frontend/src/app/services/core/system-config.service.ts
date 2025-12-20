import { computed, inject, Injectable, signal } from '@angular/core';
import { ConfigurationService } from '@inkweld/index';
import { SystemFeatures, SystemFeaturesAppMode } from '@inkweld/index';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { SetupService } from './setup.service';

/** Default system features when user explicitly chooses offline mode */
const OFFLINE_DEFAULTS: SystemFeatures = {
  aiLinting: false,
  aiImageGeneration: false,
  userApprovalRequired: false, // No approval needed in offline mode
  appMode: SystemFeaturesAppMode.Offline,
};

/** Default system features when server is unavailable (degraded online mode) */
const SERVER_UNAVAILABLE_DEFAULTS: SystemFeatures = {
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
    aiLinting: false,
    aiImageGeneration: false,
    userApprovalRequired: true,
    appMode: SystemFeaturesAppMode.Both,
  });

  private isLoaded = signal(false);

  // Public readonly signals
  public readonly systemFeatures = this.systemFeaturesSignal.asReadonly();
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
      this.isLoaded.set(true);
      return;
    }

    this.configApiService
      .getSystemFeatures()
      .pipe(
        tap(features => {
          console.log('[SystemConfig] Loaded system features:', features);
          this.systemFeaturesSignal.set(features);
          this.isLoaded.set(true);
        }),
        catchError(error => {
          console.warn(
            '[SystemConfig] Failed to load system features, using offline defaults:',
            error
          );
          // Use server unavailable defaults - operates in degraded offline mode
          this.systemFeaturesSignal.set(SERVER_UNAVAILABLE_DEFAULTS);
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
}
