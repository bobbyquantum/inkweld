import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  BACKGROUND_PRESETS,
  findBackgroundPreset,
} from '../../config/background-presets';
import { LoggerService } from './logger.service';
import { SetupService } from './setup.service';
import { StorageContextService } from './storage-context.service';

/** Which family of surfaces is currently on screen. */
export type BackgroundSurface = 'login' | 'app';

/** How a user has chosen to personalise their post-auth background. */
export interface BackgroundPreference {
  kind: 'default' | 'preset' | 'upload';
  presetId?: string;
}

/** One resolved surface from the server's appearance config. */
export interface SurfaceBackground {
  source: 'default' | 'asset' | 'url';
  value: string | null;
}

/** Mirror of the backend's `GET /api/v1/appearance/config` payload. */
export interface AppearanceConfig {
  login: SurfaceBackground;
  home: SurfaceBackground;
  overlayOpacity: number | null;
  blur: number;
  userBackgroundEnabled: boolean;
  userBackgroundUploadEnabled: boolean;
}

interface PreferenceResponse {
  background: BackgroundPreference;
  hasUpload: boolean;
}

/** What gets written to localStorage so the next boot can paint immediately. */
interface CachedBackground {
  image: string;
  color: string;
  blur: number;
  overlayOpacity: number | null;
}

const CACHE_BASE_KEY = 'appearance.background';
const PREFERENCE_CACHE_BASE_KEY = 'appearance.background-preference';

/**
 * The bundled fallback. Matches the `--app-bg-image` default in theme.scss;
 * both exist because the stylesheet has to work before any JS runs.
 */
const BUNDLED_IMAGE = "url('/home_background.png')";

/**
 * Resolves the app background and applies it as CSS custom properties.
 *
 * Precedence, highest first:
 *   1. the signed-in user's own preference (post-auth surfaces only, and only
 *      while the admin allows personalisation)
 *   2. the admin's configured background for the surface
 *   3. the bundled default
 *
 * The login surface can only ever reach rungs 2 and 3 — nobody is signed in
 * when it renders.
 *
 * Everything degrades to the bundled default: LOCAL mode never calls the API at
 * all, and a failed call leaves the stylesheet defaults in place. A resolved
 * value is cached in localStorage and re-applied synchronously on the next
 * boot, because otherwise a custom login background would pop in visibly after
 * bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);
  private readonly storageContext = inject(StorageContextService);
  private readonly logger = inject(LoggerService);
  private readonly document = inject(DOCUMENT);

  /** Live appearance config, or null in local mode / before the first fetch. */
  readonly appearance = signal<AppearanceConfig | null>(null);

  /** The signed-in user's preference, as last read or written. */
  readonly preference = signal<BackgroundPreference>({ kind: 'default' });

  /** Whether the user has an uploaded background image stored server-side. */
  readonly hasUpload = signal(false);

  /** Whether the admin permits users to choose their own background. */
  readonly userBackgroundEnabled = signal(false);

  /** Whether the admin permits users to upload their own image. */
  readonly userBackgroundUploadEnabled = signal(false);

  private surface: BackgroundSurface = 'login';

  /**
   * Whether the signed-in user's preference has been read from the server for
   * the current session. Reset whenever the login surface shows, because that
   * means nobody is signed in any more — the next sign-in may be someone else.
   */
  private preferenceLoaded = false;

  /** In-flight preference request, so concurrent callers share it. */
  private preferenceRequest: Promise<void> | null = null;

  /**
   * Cache-buster for the user's own uploaded image. The URL is stable, so a
   * re-upload needs an explicit nudge to be re-fetched.
   */
  private uploadVersion = 0;

  /**
   * One cache entry per surface. Replaying an `app`-surface resolution (say, a
   * user's gradient preset) on the login page would be wrong, and at first
   * paint the login surface is the only one we can be sure of.
   */
  private cacheKey(surface: BackgroundSurface): string {
    return this.storageContext.prefixKey(`${CACHE_BASE_KEY}.${surface}`);
  }

  private get preferenceCacheKey(): string {
    return this.storageContext.prefixKey(PREFERENCE_CACHE_BASE_KEY);
  }

  /** LOCAL mode has no server, so there is no admin to allow or forbid things. */
  private get isLocalMode(): boolean {
    return this.setupService.getMode() === 'local';
  }

  private get serverBase(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  /**
   * Apply the cached background, then refresh from the server.
   *
   * Safe to call before the user is known; call {@link refresh} again once
   * authentication settles so a personal preference is picked up.
   */
  initialize(): void {
    const cachedPreference = this.readPreferenceCache();
    if (cachedPreference) {
      this.preference.set(cachedPreference);
    }
    this.applyCached('login');
    void this.refresh();
  }

  /**
   * Switch surfaces. Called by the home page as authentication resolves, since
   * the same element hosts both the welcome/login view and the project grid.
   *
   * Entering the `app` surface is also what triggers reading the signed-in
   * user's preference; entering `login` forgets it, so a later sign-in as a
   * different user cannot inherit the previous one's choice.
   */
  setSurface(surface: BackgroundSurface): void {
    if (this.surface === surface) {
      return;
    }
    this.surface = surface;

    if (surface === 'login') {
      this.preferenceLoaded = false;
      this.preference.set({ kind: 'default' });
      this.hasUpload.set(false);
    }

    // Until the config has arrived, the best available answer for this surface
    // is whatever it resolved to last time.
    if (this.appearance() === null && !this.isLocalMode) {
      if (!this.applyCached(surface)) {
        this.apply();
      }
    } else {
      this.apply();
    }

    if (surface === 'app' && !this.preferenceLoaded && !this.isLocalMode) {
      void this.loadPreference().then(() => this.apply());
    }
  }

  /** Re-read the appearance config (and preference, when signed in). */
  async refresh(options?: { authenticated?: boolean }): Promise<void> {
    // LOCAL mode has no server to ask. Presets still work — they are pure CSS
    // and the choice lives in localStorage — but uploads cannot.
    if (this.isLocalMode) {
      this.userBackgroundEnabled.set(true);
      this.userBackgroundUploadEnabled.set(false);
      this.apply();
      return;
    }

    try {
      const config = await firstValueFrom(
        this.http.get<AppearanceConfig>(
          `${this.serverBase}/api/v1/appearance/config`,
          { withCredentials: true }
        )
      );
      this.appearance.set(config);
      this.userBackgroundEnabled.set(config.userBackgroundEnabled);
      this.userBackgroundUploadEnabled.set(config.userBackgroundUploadEnabled);
    } catch (error) {
      // A server that cannot be reached should not blank the page.
      this.logger.debug(
        'BackgroundService',
        'Failed to load appearance config; keeping defaults',
        error
      );
    }

    // Callers that know a user is signed in (settings UI, admin page) ask for
    // the preference explicitly; otherwise only fetch it when the app surface
    // is showing and nothing has fetched it yet.
    const wantsPreference =
      options?.authenticated ??
      (this.surface === 'app' && !this.preferenceLoaded);
    if (wantsPreference) {
      await this.loadPreference();
    }

    this.apply();
  }

  /**
   * Read the signed-in user's stored preference.
   *
   * Concurrent callers share one request: at boot, `setSurface('app')` and the
   * initial `refresh()` can both want it within the same tick.
   */
  loadPreference(): Promise<void> {
    if (this.isLocalMode) {
      return Promise.resolve();
    }
    this.preferenceRequest ??= this.fetchPreference().finally(() => {
      this.preferenceRequest = null;
    });
    return this.preferenceRequest;
  }

  private async fetchPreference(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<PreferenceResponse>(
          `${this.serverBase}/api/v1/appearance/preference`,
          { withCredentials: true }
        )
      );
      const preference = response.background ?? { kind: 'default' };
      this.preference.set(preference);
      this.hasUpload.set(response.hasUpload);
      this.writePreferenceCache(preference);
      this.preferenceLoaded = true;
    } catch {
      // Anonymous or offline — the admin default applies.
      this.preference.set({ kind: 'default' });
      this.hasUpload.set(false);
    }
  }

  /** Persist a new preference and apply it immediately. */
  async setPreference(preference: BackgroundPreference): Promise<void> {
    // Apply first: the user should see the change land, not wait on a round
    // trip, and a failed save is reported separately by the caller.
    this.preference.set(preference);
    this.writePreferenceCache(preference);
    this.apply();

    if (this.isLocalMode) {
      return;
    }

    const saved = await firstValueFrom(
      this.http.put<BackgroundPreference>(
        `${this.serverBase}/api/v1/appearance/preference`,
        preference,
        { withCredentials: true }
      )
    );
    this.preference.set(saved);
    this.writePreferenceCache(saved);
    this.apply();
  }

  /** Upload a personal background image, then switch to it. */
  async uploadUserBackground(file: Blob, filename: string): Promise<void> {
    const form = new FormData();
    form.append('background', file, filename);

    await firstValueFrom(
      this.http.post(
        `${this.serverBase}/api/v1/appearance/user-background`,
        form,
        { withCredentials: true }
      )
    );

    // The URL does not change between uploads, so force a re-fetch.
    this.uploadVersion += 1;
    this.hasUpload.set(true);
    // The backend switches the preference to `upload` on a successful upload.
    this.preference.set({ kind: 'upload' });
    this.writePreferenceCache({ kind: 'upload' });
    this.apply();
  }

  /** Delete the personal background image and fall back to the admin default. */
  async deleteUserBackground(): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.serverBase}/api/v1/appearance/user-background`, {
        withCredentials: true,
      })
    );

    this.hasUpload.set(false);
    this.preference.set({ kind: 'default' });
    this.writePreferenceCache({ kind: 'default' });
    this.apply();
  }

  /**
   * The CSS `background-image` value a preset id maps to, for rendering
   * swatches in the settings UI.
   */
  presetImage(presetId: string): string {
    return findBackgroundPreset(presetId)?.image ?? BUNDLED_IMAGE;
  }

  /** URL of the user's uploaded image, cache-busted per upload. */
  userBackgroundUrl(): string {
    const base = `${this.serverBase}/api/v1/appearance/user-background`;
    return this.uploadVersion > 0 ? `${base}?v=${this.uploadVersion}` : base;
  }

  // ─── Resolution ────────────────────────────────────────────────────────────

  /**
   * Turn a config/preference pair into concrete CSS values and write them to
   * the root element.
   */
  private apply(): void {
    const resolved = this.resolve();
    const root = this.document.documentElement;

    root.style.setProperty('--app-bg-image', resolved.image);
    root.style.setProperty('--app-bg-color', resolved.color);

    if (resolved.blur > 0) {
      root.style.setProperty('--app-bg-filter', `blur(${resolved.blur}px)`);
      root.style.setProperty('--app-bg-blur-fn', `blur(${resolved.blur}px)`);
    } else {
      root.style.setProperty('--app-bg-filter', 'none');
      // Removing rather than blanking keeps `var(--app-bg-blur-fn, )` resolving
      // to nothing instead of an empty (invalid) filter list.
      root.style.removeProperty('--app-bg-blur-fn');
    }

    if (resolved.overlayOpacity === null) {
      root.style.removeProperty('--app-bg-scrim-override');
    } else {
      root.style.setProperty(
        '--app-bg-scrim-override',
        String(resolved.overlayOpacity)
      );
    }

    this.writeCache(this.surface, resolved);
  }

  private resolve(): CachedBackground {
    const config = this.appearance();
    const blur = config?.blur ?? 0;
    const overlayOpacity = config?.overlayOpacity ?? null;

    // Post-auth only: the login surface renders before anyone is signed in.
    const personalisationAllowed =
      this.isLocalMode || (config?.userBackgroundEnabled ?? false);

    if (this.surface === 'app' && personalisationAllowed) {
      const preference = this.preference();

      if (preference.kind === 'preset' && preference.presetId) {
        const preset = findBackgroundPreset(preference.presetId);
        if (preset) {
          return {
            image: preset.image,
            color: preset.color,
            blur,
            overlayOpacity,
          };
        }
      }

      if (
        preference.kind === 'upload' &&
        this.hasUpload() &&
        !this.isLocalMode &&
        (config?.userBackgroundUploadEnabled ?? false)
      ) {
        return {
          image: cssUrl(this.userBackgroundUrl()),
          color: 'transparent',
          blur,
          overlayOpacity,
        };
      }
    }

    const surfaceConfig =
      this.surface === 'login' ? config?.login : config?.home;

    if (surfaceConfig?.source === 'asset' && surfaceConfig.value) {
      return {
        image: cssUrl(`${this.serverBase}${surfaceConfig.value}`),
        color: 'transparent',
        blur,
        overlayOpacity,
      };
    }

    if (surfaceConfig?.source === 'url' && surfaceConfig.value) {
      return {
        image: cssUrl(surfaceConfig.value),
        color: 'transparent',
        blur,
        overlayOpacity,
      };
    }

    return {
      image: BUNDLED_IMAGE,
      color: 'transparent',
      blur,
      overlayOpacity,
    };
  }

  // ─── First-paint cache ─────────────────────────────────────────────────────

  /**
   * Re-apply the last resolved background synchronously.
   *
   * Without this a deployment with a custom login background shows the bundled
   * image for the duration of the config fetch and then swaps — the most
   * visible possible flash, on the first screen a visitor sees.
   */
  private applyCached(surface: BackgroundSurface): boolean {
    const cached = this.readCache(surface);
    if (!cached) {
      return false;
    }

    const root = this.document.documentElement;
    root.style.setProperty('--app-bg-image', cached.image);
    root.style.setProperty('--app-bg-color', cached.color);
    if (cached.blur > 0) {
      root.style.setProperty('--app-bg-filter', `blur(${cached.blur}px)`);
      root.style.setProperty('--app-bg-blur-fn', `blur(${cached.blur}px)`);
    }
    if (cached.overlayOpacity !== null) {
      root.style.setProperty(
        '--app-bg-scrim-override',
        String(cached.overlayOpacity)
      );
    }
    return true;
  }

  private readCache(surface: BackgroundSurface): CachedBackground | null {
    try {
      const raw = localStorage.getItem(this.cacheKey(surface));
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isCachedBackground(parsed)) {
        return null;
      }
      // Cached values are replayed straight into style properties, so they get
      // the same scrutiny as ones arriving from the API.
      if (!isSafeCssImageValue(parsed.image) || !isSafeCssColor(parsed.color)) {
        return null;
      }
      return parsed;
    } catch {
      // Storage unavailable (private mode, quota) — not worth reporting.
      return null;
    }
  }

  private readPreferenceCache(): BackgroundPreference | null {
    try {
      const raw = localStorage.getItem(this.preferenceCacheKey);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return isBackgroundPreference(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writePreferenceCache(preference: BackgroundPreference): void {
    try {
      localStorage.setItem(this.preferenceCacheKey, JSON.stringify(preference));
    } catch {
      // Storage unavailable; the preference still applies for this session.
    }
  }

  private writeCache(
    surface: BackgroundSurface,
    resolved: CachedBackground
  ): void {
    try {
      localStorage.setItem(this.cacheKey(surface), JSON.stringify(resolved));
    } catch {
      // Storage unavailable; the background still applies for this session.
    }
  }
}

/**
 * Wrap a URL in a CSS `url()` token.
 *
 * The value reaches a style property, so a hostile string could otherwise
 * close the token and append declarations of its own. The backend rejects such
 * values before storing them; this is the second half of that check, because
 * this function also handles cached values and any future caller.
 */
function cssUrl(url: string): string {
  if (!isSafeUrlToken(url)) {
    return BUNDLED_IMAGE;
  }
  return `url("${url}")`;
}

function isSafeUrlToken(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  // Quotes, parens, backslashes and whitespace can all break out of url("…").
  if (/["'()\\\s]/.test(trimmed)) {
    return false;
  }
  // Same-origin/relative paths, or an absolute http(s) URL. Anything else
  // (data:, javascript:, protocol-relative) is refused.
  return trimmed.startsWith('/') || /^https?:\/\//.test(trimmed);
}

/**
 * Whether a cached `background-image` value is one we are willing to replay.
 * Accepts the shapes this service produces — a `url("…")` token, a gradient, or
 * `none` — and nothing else.
 */
function isSafeCssImageValue(value: string): boolean {
  if (value === 'none') {
    return true;
  }

  const urlMatch = /^url\("([^"]*)"\)$/.exec(value);
  if (urlMatch) {
    return isSafeUrlToken(urlMatch[1]);
  }

  // Gradients only ever come from the built-in preset table, so compare
  // against it rather than trying to validate gradient syntax.
  return BACKGROUND_PRESETS.some(preset => preset.image === value);
}

/**
 * Whether a cached background colour is one we produced. Same reasoning as
 * {@link isSafeCssImageValue}: the only colours this service emits are
 * `transparent` and the preset table's, so an allowlist beats parsing.
 */
function isSafeCssColor(value: string): boolean {
  return (
    value === 'transparent' ||
    BACKGROUND_PRESETS.some(preset => preset.color === value)
  );
}

function isBackgroundPreference(value: unknown): value is BackgroundPreference {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const kind = candidate['kind'];
  if (kind !== 'default' && kind !== 'preset' && kind !== 'upload') {
    return false;
  }
  const presetId = candidate['presetId'];
  return presetId === undefined || typeof presetId === 'string';
}

function isCachedBackground(value: unknown): value is CachedBackground {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['image'] === 'string' &&
    typeof candidate['color'] === 'string' &&
    typeof candidate['blur'] === 'number' &&
    (candidate['overlayOpacity'] === null ||
      typeof candidate['overlayOpacity'] === 'number')
  );
}
