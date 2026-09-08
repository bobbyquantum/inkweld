import { computed, Injectable, signal } from '@angular/core';
import { type CloudProvider } from '@services/core/storage-context.service';

import { environment } from '../../../environments/environment';

/** localStorage key for runtime app-key overrides (self-hosters) */
export const CLOUD_SYNC_APP_KEYS_STORAGE_KEY = 'inkweld-cloud-sync-app-keys';

/** Providers that have an adapter today. Extend as adapters land. */
export const IMPLEMENTED_CLOUD_PROVIDERS: readonly CloudProvider[] = [
  'dropbox',
];

type AppKeyOverrides = Partial<Record<CloudProvider, string>>;

/**
 * Resolves which Cloud Sync providers are available in this build and the
 * OAuth app key to use for each.
 *
 * Resolution order per provider:
 * 1. Runtime override stored in localStorage (a self-hoster pasting their own
 *    app key into connection settings)
 * 2. Build-time key from the environment file
 *
 * App keys are public client identifiers; the OAuth flow is PKCE so there is
 * never a secret in the browser.
 */
@Injectable({
  providedIn: 'root',
})
export class CloudSyncConfigService {
  private readonly overrides = signal<AppKeyOverrides>(this.loadOverrides());

  /** Providers with both an adapter and a non-empty app key */
  readonly availableProviders = computed<CloudProvider[]>(() =>
    IMPLEMENTED_CLOUD_PROVIDERS.filter(p => !!this.resolveAppKey(p))
  );

  /** True when at least one provider can be offered in setup */
  readonly isCloudSyncAvailable = computed(
    () => this.availableProviders().length > 0
  );

  /** The app key for a provider, or empty string when not configured */
  getAppKey(provider: CloudProvider): string {
    return this.resolveAppKey(provider);
  }

  /** Whether a provider can be offered to the user */
  isProviderAvailable(provider: CloudProvider): boolean {
    return this.availableProviders().includes(provider);
  }

  /** Store a runtime override; empty string removes it */
  setAppKeyOverride(provider: CloudProvider, appKey: string): void {
    const next: AppKeyOverrides = { ...this.overrides() };
    const trimmed = appKey.trim();
    if (trimmed) {
      next[provider] = trimmed;
    } else {
      delete next[provider];
    }
    this.overrides.set(next);
    try {
      if (Object.keys(next).length === 0) {
        localStorage.removeItem(CLOUD_SYNC_APP_KEYS_STORAGE_KEY);
      } else {
        localStorage.setItem(
          CLOUD_SYNC_APP_KEYS_STORAGE_KEY,
          JSON.stringify(next)
        );
      }
    } catch {
      // localStorage unavailable: override lives for this session only
    }
  }

  /** The runtime override for a provider, if any */
  getAppKeyOverride(provider: CloudProvider): string | undefined {
    return this.overrides()[provider];
  }

  /** The build-time key for a provider, if any */
  getBuildAppKey(provider: CloudProvider): string {
    const keys = environment.cloudSync as
      Partial<Record<CloudProvider, { appKey?: string }>> | undefined;
    return keys?.[provider]?.appKey?.trim() ?? '';
  }

  private resolveAppKey(provider: CloudProvider): string {
    // Read the signal so computed() tracks override changes
    const override = this.overrides()[provider];
    if (override) return override;
    return this.getBuildAppKey(provider);
  }

  private loadOverrides(): AppKeyOverrides {
    try {
      const raw = localStorage.getItem(CLOUD_SYNC_APP_KEYS_STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      const result: AppKeyOverrides = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.trim()) {
          result[key as CloudProvider] = value.trim();
        }
      }
      return result;
    } catch {
      return {};
    }
  }
}
