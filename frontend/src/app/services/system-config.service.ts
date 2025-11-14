import { computed, inject, Injectable, signal } from '@angular/core';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { ConfigurationService } from '../../api-client/api/configuration.service';
import { GetApiV1ConfigFeatures200Response, GetApiV1ConfigFeatures200ResponseAppMode } from '../../api-client/model/get-api-v1-config-features200-response';

// ExtendedSystemFeatures is the same as the API response now
type ExtendedSystemFeatures = GetApiV1ConfigFeatures200Response;

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
    appMode: GetApiV1ConfigFeatures200ResponseAppMode.Both,
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
      .getApiV1ConfigFeatures()
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
            appMode: GetApiV1ConfigFeatures200ResponseAppMode.Both,
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
