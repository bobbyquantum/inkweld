import { inject, Injectable } from '@angular/core';

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
