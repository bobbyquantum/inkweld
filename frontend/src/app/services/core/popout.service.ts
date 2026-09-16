import { Injectable, signal } from '@angular/core';

/** Query parameter that marks a window as a popped-out document. */
export const POPOUT_QUERY_PARAM = 'popout';

/**
 * Per-window record that this context is a pop-out. sessionStorage is scoped
 * to the individual tab/window, so the flag survives a reload of the pop-out
 * without ever leaking into the main window.
 */
const POPOUT_SESSION_KEY = 'inkweld.popout';

/** Opening size of a pop-out window, in CSS pixels. */
const POPOUT_WIDTH = 900;
const POPOUT_HEIGHT = 1000;

/**
 * Tracks whether the current window is a popped-out document, and opens new
 * ones.
 *
 * A pop-out is an ordinary document URL with `?popout=1` appended. The route,
 * the editor and the sync providers are all the same as in the main window —
 * only the surrounding chrome (sidebar, tab bar, toolbar) is suppressed, and
 * the window keeps its tab state to itself.
 */
@Injectable({
  providedIn: 'root',
})
export class PopoutService {
  private readonly popout = signal(false);

  /** True when this window is a popped-out document. */
  readonly isPopout = this.popout.asReadonly();

  constructor() {
    this.popout.set(this.detectPopout());
  }

  /**
   * Opens a document in its own window.
   *
   * Windows are named after the document, so asking twice for the same
   * document focuses the window that is already open instead of stacking a
   * duplicate on top of it.
   *
   * @param username - Project owner's username.
   * @param slug - Project slug.
   * @param elementId - The document element to show.
   * @returns True when a window was opened or focused; false when the browser
   * blocked it (almost always a pop-up blocker).
   */
  openDocument(username: string, slug: string, elementId: string): boolean {
    const url = this.buildUrl(username, slug, elementId);
    const name = `inkweld-doc-${username}-${slug}-${elementId}`;
    const features = [
      'popup=yes',
      `width=${POPOUT_WIDTH}`,
      `height=${POPOUT_HEIGHT}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
    ].join(',');

    const opened = globalThis.open(url, name, features);
    if (!opened) return false;

    // Re-requesting a document that is already popped out should surface that
    // window rather than silently do nothing.
    try {
      opened.focus();
    } catch {
      // Focusing across windows can be refused; the window still opened.
    }
    return true;
  }

  /** The URL a pop-out window for this document opens at. */
  buildUrl(username: string, slug: string, elementId: string): string {
    const path = `/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/document/${encodeURIComponent(elementId)}`;
    return `${path}?${POPOUT_QUERY_PARAM}=1`;
  }

  /**
   * A window is a pop-out if it was opened as one, or if it is a reload of a
   * window that was. The query parameter is the signal on first load; Angular
   * drops it on the first in-app navigation, so it is latched into
   * sessionStorage for the life of the window.
   */
  private detectPopout(): boolean {
    let fromSession = false;
    try {
      fromSession = sessionStorage.getItem(POPOUT_SESSION_KEY) === '1';
    } catch {
      // Storage can be unavailable (private mode, blocked cookies); fall back
      // to the query parameter alone.
    }

    const params = new URLSearchParams(globalThis.location.search);
    const fromUrl = params.get(POPOUT_QUERY_PARAM) === '1';

    if (fromUrl && !fromSession) {
      try {
        sessionStorage.setItem(POPOUT_SESSION_KEY, '1');
      } catch {
        // Without storage the flag lasts until the next reload, which is
        // still the whole useful lifetime of the window.
      }
    }

    return fromUrl || fromSession;
  }
}
