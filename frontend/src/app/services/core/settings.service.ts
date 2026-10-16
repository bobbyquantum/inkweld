import { inject, Injectable, signal } from '@angular/core';

import { StorageContextService } from './storage-context.service';

const SETTINGS_BASE_KEY = 'userSettings';

/**
 * Unprefixed localStorage key for the WebMCP opt-in. It belongs to the
 * browser, not to a profile: the agent is the browser's, and /setup offers
 * the switch before any profile exists.
 */
export const WEBMCP_ENABLED_KEY = 'inkweld-webmcp';

function readWebMcpEnabled(): boolean {
  try {
    return localStorage.getItem(WEBMCP_ENABLED_KEY) === 'on';
  } catch {
    return false;
  }
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
   * Internal writable signal backing the "let browser AI agents use Inkweld"
   * (WebMCP) preference. Updates must go through {@link setWebMcpEnabled}.
   */
  private readonly _webMcpEnabled = signal<boolean>(readWebMcpEnabled());

  /**
   * Whether Inkweld registers WebMCP tools (`document.modelContext`) so an AI
   * agent built into the browser can read and edit projects on the user's
   * behalf. Defaults to `false`: nothing is exposed until the user opts in.
   * It is a preference of this browser (shared by its profiles, stored under
   * {@link WEBMCP_ENABLED_KEY}) rather than a server setting, because the
   * tools run here and work the same in every storage mode.
   */
  readonly webMcpEnabled = this._webMcpEnabled.asReadonly();

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
   * Update the WebMCP preference. Persists to storage and updates the
   * reactive signal; `WebMcpService` registers or removes the tools.
   */
  setWebMcpEnabled(value: boolean): void {
    this._webMcpEnabled.set(value);
    try {
      if (value) localStorage.setItem(WEBMCP_ENABLED_KEY, 'on');
      else localStorage.removeItem(WEBMCP_ENABLED_KEY);
    } catch {
      // Storage can be unavailable (private mode/quota); keep UI reactive.
    }
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
