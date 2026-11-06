import { inject, Injectable, signal } from '@angular/core';

import { StorageContextService } from './storage-context.service';

const SETTINGS_BASE_KEY = 'userSettings';

/**
 * Unprefixed localStorage key for this browser's copy of the user's "No AI /
 * Allow AI" choice: `'allow'`, `'none'`, or absent when nobody has chosen in
 * this browser. It belongs to the browser, not to a profile: /setup offers it
 * before any profile exists, and the browser's own agent (WebMCP) is per
 * browser. With a server account the account's choice is the one that counts
 * (`AiPreferenceSyncService` keeps the two in step).
 */
export const AI_PREFERENCE_KEY = 'inkweld-ai';

/**
 * Set (`'1'`) while a choice made in this browser hasn't reached a server
 * account yet: made on /setup, offline, or in Browser mode. The next server
 * account that signs in here takes it instead of overwriting it.
 */
export const AI_PREFERENCE_UNSYNCED_KEY = 'inkweld-ai-unsynced';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode/quota); keep UI reactive.
  }
}

function readAiAllowed(): boolean {
  return readStorage(AI_PREFERENCE_KEY) === 'allow';
}

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

  /**
   * Internal writable signal backing the "dense sidebar" preference.
   * Updates must go through {@link setDenseLayout} so the value is persisted
   * to localStorage.
   */
  private readonly _denseLayout = signal<boolean>(
    this.getSetting<boolean>('denseLayout', true)
  );

  /**
   * Read-only reactive signal for the "dense sidebar" preference. Components
   * that render the project shell should subscribe so the layout updates
   * immediately when the user toggles it.
   *
   * Defaults to `true` (dense) — but the preference only ever tightens the
   * desktop sidebar, so phones keep their larger touch targets regardless.
   * Users can turn it off in Settings → Project Tree.
   */
  readonly denseLayout = this._denseLayout.asReadonly();

  /**
   * Internal writable signal backing the "clicking a folder opens it"
   * preference. Updates must go through {@link setFolderClickOpens}.
   */
  private readonly _folderClickOpens = signal<boolean>(
    this.getSetting<boolean>('folderClickOpens', false)
  );

  /**
   * Whether clicking a folder in the project tree also opens its folder view
   * (corkboard / outline) in a tab, rather than only expanding it. Defaults
   * to `false`: browsing the tree should not replace the open editor.
   */
  readonly folderClickOpens = this._folderClickOpens.asReadonly();

  /**
   * Internal writable signal backing the "Markdown shortcuts while typing"
   * preference. Updates must go through {@link setMarkdownShortcuts}.
   */
  private readonly _markdownShortcuts = signal<boolean>(
    this.getSetting<boolean>('markdownShortcuts', false)
  );

  /**
   * Whether typing Markdown at the start of a paragraph ("# ", "> ", "- ",
   * "1. ", "**bold**", smart quotes…) converts it as you type. Defaults to
   * `false`: prose often starts a line with "#" or "-" and should stay as typed.
   * Read when an editor is created, so a change applies to documents opened
   * afterwards.
   */
  readonly markdownShortcuts = this._markdownShortcuts.asReadonly();

  /**
   * Internal writable signal backing the "No AI / Allow AI" choice. Updates
   * must go through {@link setAiAllowed}.
   */
  private readonly _aiAllowed = signal<boolean>(readAiAllowed());

  private readonly _aiChoiceUnsynced = signal<boolean>(
    readStorage(AI_PREFERENCE_UNSYNCED_KEY) === '1'
  );

  /**
   * The user's own consent to AI features, on top of the admin's AI kill
   * switch: AI runs only when the server allows it *and* the user has chosen
   * "Allow AI". Defaults to `false` ("No AI"): every AI feature is opt-in.
   * It covers the server's AI features (image generation, Auto-Review, MCP
   * access) through `SystemConfigService`, and the WebMCP tools for the
   * browser's own agent, which need no server. Stored per browser under
   * {@link AI_PREFERENCE_KEY}, shared by every profile, and on the signed-in
   * server account so it follows the user to other devices.
   */
  readonly aiAllowed = this._aiAllowed.asReadonly();

  /**
   * True while a choice made in this browser still has to be sent to a
   * server account (see {@link AI_PREFERENCE_UNSYNCED_KEY}).
   */
  readonly aiChoiceUnsynced = this._aiChoiceUnsynced.asReadonly();

  /** Whether this browser has a choice of its own (not just the default). */
  hasLocalAiChoice(): boolean {
    return readStorage(AI_PREFERENCE_KEY) !== null;
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

  /**
   * Update the "Markdown shortcuts while typing" preference. Persists to
   * storage and updates the reactive signal.
   */
  setMarkdownShortcuts(value: boolean): void {
    this._markdownShortcuts.set(value);
    try {
      this.setSetting<boolean>('markdownShortcuts', value);
    } catch {
      // Storage can be unavailable (private mode/quota); keep UI reactive.
    }
  }

  /**
   * Record the user's own "No AI / Allow AI" choice. `SystemConfigService`
   * and `WebMcpService` follow the signal; `AiPreferenceSyncService` sends it
   * to the signed-in account, or to the next one that signs in here.
   */
  setAiAllowed(value: boolean): void {
    this.storeAiAllowed(value);
    this._aiChoiceUnsynced.set(true);
    writeStorage(AI_PREFERENCE_UNSYNCED_KEY, '1');
  }

  /**
   * Take the choice stored on the signed-in account, which wins over this
   * browser's copy unless that has an unsynced change of its own.
   */
  applyAccountAiChoice(value: boolean): void {
    if (this._aiAllowed() === value && this.hasLocalAiChoice()) return;
    this.storeAiAllowed(value);
  }

  /**
   * The account now has `value`. Clears the unsynced flag unless the user
   * changed the choice again while it was being sent.
   */
  markAiChoiceSynced(value: boolean): void {
    if (this._aiAllowed() !== value) return;
    this._aiChoiceUnsynced.set(false);
    writeStorage(AI_PREFERENCE_UNSYNCED_KEY, null);
  }

  private storeAiAllowed(value: boolean): void {
    this._aiAllowed.set(value);
    writeStorage(AI_PREFERENCE_KEY, value ? 'allow' : 'none');
  }

  /**
   * Update the "dense sidebar" preference. Persists to storage and updates
   * the reactive signal so subscribed components re-render.
   */
  setDenseLayout(value: boolean): void {
    this._denseLayout.set(value);
    try {
      this.setSetting<boolean>('denseLayout', value);
    } catch {
      // Storage can be unavailable (private mode/quota); keep UI reactive.
    }
  }

  /**
   * Update the "clicking a folder opens it" preference. Persists to storage
   * and updates the reactive signal.
   */
  setFolderClickOpens(value: boolean): void {
    this._folderClickOpens.set(value);
    try {
      this.setSetting<boolean>('folderClickOpens', value);
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
