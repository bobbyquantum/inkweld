import { computed, inject, Injectable, signal } from '@angular/core';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { ConfigurationService } from '../../api-client/api/configuration.service';
import { GetApiV1ConfigFeatures200Response } from '../../api-client/model/config-controller-get-system-features200-response';

interface CaptchaConfig {
  enabled?: boolean;
  siteKey?: string;
}

interface ExtendedSystemFeatures
  extends GetApiV1ConfigFeatures200Response {
  captcha?: CaptchaConfig;
  userApprovalRequired?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class SystemConfigService {
  private readonly configApiService = inject(ConfigurationService);

  private readonly systemFeaturesSignal = signal<ExtendedSystemFeatures>({
    aiLinting: false,
    aiImageGeneration: false,
    captcha: { enabled: false },
    userApprovalRequired: true,
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
      .getApiV1Config()
      .pipe(
        tap(features => {
          console.log('[SystemConfig] Loaded system features:', features);
          this.systemFeaturesSignal.set(features as ExtendedSystemFeatures);
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
            captcha: { enabled: false },
            userApprovalRequired: true,
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
