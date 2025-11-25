import { computed, inject, Injectable, signal } from '@angular/core';
import { ConfigurationService } from '@inkweld/index';
import { SystemFeatures, SystemFeaturesAppMode } from '@inkweld/index';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

// ExtendedSystemFeatures is the same as the API response now
type ExtendedSystemFeatures = SystemFeatures;

@Injectable({
  providedIn: 'root',
})
export class SystemConfigService {
  private readonly configApiService = inject(ConfigurationService);

  private readonly systemFeaturesSignal = signal<ExtendedSystemFeatures>({
    aiLinting: false,
    aiImageGeneration: false,
    captcha: { enabled: false, siteKey: undefined },
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
  public readonly isCaptchaEnabled = computed(
    () => this.systemFeaturesSignal().captcha?.enabled ?? false
  );
  public readonly captchaSiteKey = computed(
    () => this.systemFeaturesSignal().captcha?.siteKey ?? ''
  );
  public readonly isUserApprovalRequired = computed(
    () => this.systemFeaturesSignal().userApprovalRequired ?? true
  );
  public readonly isConfigLoaded = this.isLoaded.asReadonly();

  constructor() {
    this.loadSystemFeatures();
  }

  /**
   * Load system features configuration from the backend
   */
  private loadSystemFeatures(): void {
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
            '[SystemConfig] Failed to load system features, using defaults:',
            error
          );
          this.systemFeaturesSignal.set({
            aiLinting: false,
            aiImageGeneration: false,
            captcha: { enabled: false, siteKey: undefined },
            userApprovalRequired: true,
            appMode: SystemFeaturesAppMode.Both,
          });
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
