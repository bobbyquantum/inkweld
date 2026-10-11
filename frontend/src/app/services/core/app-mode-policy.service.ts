import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CloudSyncConfigService } from '@services/cloud-sync/cloud-sync-config.service';
import { appOrigin, isHomeAssistantIngress } from '@utils/app-base';
import { stripTrailingSlashes } from '@utils/string-utils';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

/** The server's `APP_MODE`: which kinds of profile people may add */
export type AppMode = 'ONLINE' | 'LOCAL' | 'BOTH';

/** Where a profile's writing lives, as the profile manager names it */
export type ProfileKind = 'local' | 'cloud' | 'server';

/** localStorage key of the last mode the home server reported */
export const APP_MODE_POLICY_STORAGE_KEY = 'inkweld-app-mode-policy';

/** Give up on the features request after this long and keep what we know */
const FETCH_TIMEOUT_MS = 8000;

interface CachedPolicy {
  serverUrl: string;
  appMode: AppMode;
}

function isAppMode(value: unknown): value is AppMode {
  return value === 'ONLINE' || value === 'LOCAL' || value === 'BOTH';
}

/**
 * The Inkweld server this copy of the app belongs to, whose `APP_MODE` is
 * the policy for adding profiles. Not the active profile's server: someone
 * may have added any number of other servers, and those don't get a say in
 * what this site allows.
 *
 * - Home Assistant ingress: the server that served the page, under its prefix
 * - Electron: none, the desktop app has no server of its own
 * - A build with an apiUrl (hosted, dev): that server
 * - A build without one (Docker, native binary): the page's own origin
 */
export function resolveHomeServerUrl(
  env: { apiUrl?: string; electron?: boolean },
  doc: Document | null = globalThis.document ?? null
): string | null {
  if (isHomeAssistantIngress(doc)) return appOrigin(doc) || null;
  if (env.electron) return null;
  if (env.apiUrl) return stripTrailingSlashes(env.apiUrl);
  // Only a page served over http(s) has a server behind it
  const origin = appOrigin(doc);
  return /^https?:\/\//.test(origin) ? origin : null;
}

function readCache(serverUrl: string | null): AppMode | null {
  if (!serverUrl) return null;
  try {
    const raw = localStorage.getItem(APP_MODE_POLICY_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedPolicy>;
    return cached.serverUrl === serverUrl && isAppMode(cached.appMode)
      ? cached.appMode
      : null;
  } catch {
    return null;
  }
}

function writeCache(policy: CachedPolicy): void {
  try {
    localStorage.setItem(APP_MODE_POLICY_STORAGE_KEY, JSON.stringify(policy));
  } catch {
    // Storage unavailable (private window): the policy is refetched next load
  }
}

/**
 * The admin's `APP_MODE` policy, as reported by the home server's
 * `/config/features`:
 *
 * - `ONLINE`: only server profiles may be added (no Browser, no Cloud Sync)
 * - `LOCAL`: only profiles stored in this browser (Browser, Cloud Sync)
 * - `BOTH`: anything
 *
 * Every place that creates a profile (setup, profile manager, user menu)
 * asks this service, so the rule holds after first run too. Profiles that
 * already exist on the device are never touched: switching to them and
 * reconnecting them keeps working.
 *
 * The last mode reported is cached per server. While the server cannot be
 * reached the cached mode stands, so an outage never unlocks profile kinds
 * an `ONLINE` site forbids. With nothing cached (first visit while the
 * server is down, or no home server at all, as in Electron) nothing is
 * restricted.
 *
 * Browser and Cloud Sync profiles never contact a server on their own, so
 * nothing is fetched until {@link ready} is called: by the user menu and
 * profile manager while a server profile is active, and by anything that
 * starts adding a profile. Until then the cached mode applies.
 */
@Injectable({
  providedIn: 'root',
})
export class AppModePolicyService {
  private readonly http = inject(HttpClient);
  private readonly cloudSyncConfig = inject(CloudSyncConfigService);
  private readonly logger = inject(LoggerService);

  /** Server whose APP_MODE applies, or null when the build has none */
  readonly homeServerUrl = resolveHomeServerUrl(environment);

  private readonly mode = signal<AppMode>(
    readCache(this.homeServerUrl) ?? 'BOTH'
  );
  private readonly serverName = signal<string | null>(null);
  private readonly loaded = signal(this.homeServerUrl === null);
  private loading: Promise<void> | null = null;

  /** Effective mode: last known from the home server, BOTH when unknown */
  readonly appMode = this.mode.asReadonly();
  /** True once the home server answered (or failed to) */
  readonly isLoaded = this.loaded.asReadonly();
  /** The home server's DEFAULT_SERVER_NAME, to pre-fill the server form */
  readonly defaultServerName = this.serverName.asReadonly();

  /** Browser profiles may be added */
  readonly canAddBrowserProfiles = computed(() => this.mode() !== 'ONLINE');
  /** Cloud Sync stores in the browser too, so it follows the same rule */
  readonly canAddCloudProfiles = computed(
    () =>
      this.canAddBrowserProfiles() &&
      this.cloudSyncConfig.isCloudSyncAvailable()
  );
  /** Server profiles may be added */
  readonly canAddServerProfiles = computed(() => this.mode() !== 'LOCAL');

  /**
   * Translation key explaining the restriction, or null when there is none.
   * One wording everywhere: setup, profile manager, refusals.
   */
  readonly restrictionMessageKey = computed(() => {
    switch (this.mode()) {
      case 'ONLINE':
        return 'appModePolicy.serverOnly';
      case 'LOCAL':
        return 'appModePolicy.browserOnly';
      default:
        return null;
    }
  });

  /**
   * Fetch the home server's mode (once per page load, or again after a
   * failure) and resolve when it is known or could not be read. Call it when
   * a profile is about to be added.
   */
  ready(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  /**
   * Where a profile of this kind may move next. Browser can go to cloud
   * storage or a server, cloud can go to a server; a server profile is the
   * top of the ladder.
   */
  upgradeTargets(kind: ProfileKind | null | undefined): ('cloud' | 'server')[] {
    const targets: ('cloud' | 'server')[] = [];
    if (kind === 'local' && this.canAddCloudProfiles()) targets.push('cloud');
    if ((kind === 'local' || kind === 'cloud') && this.canAddServerProfiles()) {
      targets.push('server');
    }
    return targets;
  }

  private async load(): Promise<void> {
    const serverUrl = this.homeServerUrl;
    if (!serverUrl) return;
    try {
      const features = await firstValueFrom(
        this.http
          .get<{
            appMode?: unknown;
            defaultServerName?: unknown;
          }>(`${serverUrl}/api/v1/config/features`)
          .pipe(timeout(FETCH_TIMEOUT_MS))
      );
      if (isAppMode(features?.appMode)) {
        this.mode.set(features.appMode);
        writeCache({ serverUrl, appMode: features.appMode });
      }
      const name = features?.defaultServerName;
      if (typeof name === 'string' && name.trim()) {
        this.serverName.set(name.trim());
      }
    } catch (error) {
      // Keep the cached mode: an unreachable server must not lift its policy.
      // The next ready() (the next profile someone starts adding) tries again.
      this.loading = null;
      this.logger.warn(
        'AppModePolicy',
        `Could not read APP_MODE from ${serverUrl}; using ${this.mode()}`,
        error
      );
    } finally {
      this.loaded.set(true);
    }
  }
}
