import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AppearanceRegion,
  type BackgroundSetting,
  type BackgroundType,
  isBackgroundEmpty,
} from '@models/element-appearance';
import { StorageContextService } from '@services/core/storage-context.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ThemeService } from '@themes/theme.service';
import { firstValueFrom, map } from 'rxjs';

import {
  mediaIdFromReference,
  mediaReferenceFilename,
} from '../../utils/media-reference';

/**
 * A resolved background ready to bind as CSS custom properties.
 * `background` is the CSS value; `overlay` describes how the renderer
 * should brighten/darken an image so content stays legible.
 */
export interface ResolvedBackground {
  type: BackgroundType;
  background: string;
  overlay?: 'dark' | 'light';
}

/**
 * Resolves per-element background settings into CSS values that can be
 * applied to the worldbuilding editor's menu / content regions.
 *
 * It reacts to the active app theme (light/dark) so that auto-adjusted
 * backgrounds stay legible when the user toggles the theme. Background
 * images are also given an automatic brightness overlay in the opposite
 * theme so they remain readable in both modes.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly themeService = inject(ThemeService);

  /** Reactive signal: true when the app is currently in dark mode. */
  readonly isDarkMode = toSignal(
    this.themeService.getCurrentTheme().pipe(
      map(theme => {
        if (theme === 'system') {
          return (
            globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ??
            false
          );
        }
        return theme === 'dark-theme';
      })
    ),
    { initialValue: this.themeService.isDarkMode() }
  );

  private readonly localStorage = inject(LocalStorageService);
  private readonly http = inject(HttpClient);
  private readonly storageContext = inject(StorageContextService);

  /**
   * Resolve an image reference to a loadable URL.
   *
   * `media://` references are application-internal and cannot be loaded by the
   * browser directly, so they are resolved to a cached blob URL from IndexedDB.
   * On a cache miss the media is downloaded from the server and cached so a
   * collaborator or a fresh browser can render it. Non-`media://` references
   * (http/https/data/blob) are returned as-is when they use a safe scheme.
   * Returns `null` when the reference cannot be resolved to a renderable URL.
   */
  async resolveImageReference(
    reference: string,
    username: string,
    slug: string
  ): Promise<string | null> {
    if (!reference.startsWith('media://')) {
      return /^(https?:|blob:|data:image\/)/i.test(reference)
        ? reference
        : null;
    }

    const filename = mediaReferenceFilename(reference);
    const mediaId = mediaIdFromReference(reference);
    const projectKey = `${username}/${slug}`;

    try {
      const cachedUrl = await this.localStorage.getMediaUrl(
        projectKey,
        mediaId
      );
      if (cachedUrl) {
        return cachedUrl;
      }

      if (!username || !slug) return null;

      const apiUrl = `${this.storageContext.getApiBaseUrl()}/api/v1/media/${username}/${slug}/${filename}`;
      const blob = await firstValueFrom(
        this.http.get(apiUrl, { responseType: 'blob' })
      );
      await this.localStorage.saveMedia(projectKey, mediaId, blob, filename);
      return this.localStorage.getMediaUrl(projectKey, mediaId);
    } catch {
      return null;
    }
  }

  /**
   * Resolve a region's background setting into an object suitable for
   * binding as CSS custom properties on the target element.
   *
   * Returns `null` when there is nothing to render (empty setting) so
   * callers can fall back to the default surface.
   */
  resolveRegion(
    setting: BackgroundSetting | undefined,
    _region: AppearanceRegion
  ): ResolvedBackground | null {
    if (!setting || isBackgroundEmpty(setting)) return null;

    const value = this.pickValue(setting);
    if (value === undefined || value === '') return null;

    const type = setting.type;
    if (type === 'color') {
      return { type, background: value };
    }
    if (type === 'gradient') {
      return { type, background: value };
    }

    // Image. In auto mode the single image is brightened in light theme and
    // darkened in dark theme so overlaid content stays legible. In manual
    // mode the author already chose theme-specific images, so no overlay.
    if (setting.mode === 'auto') {
      const dark = this.isDarkMode();
      return {
        type,
        background: `url('${value}')`,
        overlay: dark ? 'dark' : 'light',
      };
    }
    return { type, background: `url('${value}')` };
  }

  /**
   * Select the active value based on mode + current theme.
   */
  private pickValue(setting: BackgroundSetting): string | undefined {
    if (setting.mode === 'manual') {
      return this.isDarkMode() ? setting.dark : setting.light;
    }
    return setting.value;
  }
}
