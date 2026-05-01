import { inject, Injectable, signal } from '@angular/core';

import { StorageContextService } from './storage-context.service';

const SETTINGS_BASE_KEY = 'userSettings';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly storageContext = inject(StorageContextService);

  private get settingsKey(): string {
    return this.storageContext.prefixKey(SETTINGS_BASE_KEY);
  }

  /**
   * Internal writable signal backing the "show breadcrumbs" preference.
   * Updates must go through {@link setShowBreadcrumbs} so the value is
   * persisted to localStorage.
   */
  private readonly _showBreadcrumbs = signal<boolean>(
    this.getSetting<boolean>('showBreadcrumbs', true)
  );

  /**
   * Read-only reactive signal for the "show breadcrumbs" preference.
   * Components that conditionally render the editor breadcrumb bar should
   * subscribe to this signal so the UI updates immediately when the user
   * toggles it.
   *
   * Defaults to `true` (breadcrumbs visible).
   */
  readonly showBreadcrumbs = this._showBreadcrumbs.asReadonly();

  getSetting<T>(key: string, defaultValue: T): T {
    const settings = this.getSettings();
    const value = settings[key];
    return this.isValidType<T>(value) ? value : defaultValue;
  }

  setSetting<T>(key: string, value: T): void {
    const settings = this.getSettings();
    settings[key] = value;
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
  }

  /**
   * Update the "show breadcrumbs" preference. Persists to storage and updates
   * the reactive signal so subscribed components re-render.
   */
  setShowBreadcrumbs(value: boolean): void {
    this._showBreadcrumbs.set(value);
    try {
      this.setSetting<boolean>('showBreadcrumbs', value);
    } catch {
      // Storage can be unavailable (private mode/quota); keep UI reactive.
    }
  }

  private getSettings(): Record<string, unknown> {
    try {
      const settings = localStorage.getItem(this.settingsKey);
      if (!settings) return {};

      const parsed = JSON.parse(settings) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private isValidType<T>(value: unknown): value is T {
    return value !== undefined && value !== null;
  }
}
