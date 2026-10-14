import { computed, inject, Injectable, signal } from '@angular/core';
import { isHomeAssistantIngress } from '@utils/app-base';

import { LoggerService } from './logger.service';

/**
 * Chromium's install event (not in the TypeScript DOM lib). Calling
 * `preventDefault()` keeps the browser's own mini-infobar away so the app can
 * offer installing at a moment of its choosing; `prompt()` then opens the
 * browser's install dialog, and can be used once per event.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

/**
 * How this browser can install Inkweld:
 * - `prompt`: Chromium (Chrome, Edge, Android) handed us an install event
 * - `ios`: iPhone/iPad, where installing is Share → Add to Home Screen
 * - `none`: already installed, not installable here, or not offered
 */
export type InstallMode = 'prompt' | 'ios' | 'none';

const DISMISSED_KEY = 'inkweld-install-banner-dismissed';

let earlyPrompt: BeforeInstallPromptEvent | null = null;
let earlyCaptureStarted = false;
/** Set once the service is running; the early listener hands events to it. */
let deliverPrompt: ((event: BeforeInstallPromptEvent) => void) | null = null;

/**
 * Start listening for `beforeinstallprompt` before Angular boots. The event
 * can fire as soon as the page and service worker qualify, which may be
 * before `PwaInstallService` exists; it is held here until the service
 * picks it up. Called from `main.ts`.
 */
export function captureInstallPromptEarly(
  target: Pick<Window, 'addEventListener'> | undefined = globalThis.window
): void {
  if (earlyCaptureStarted || !target) return;
  earlyCaptureStarted = true;
  target.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    const prompt = event as BeforeInstallPromptEvent;
    if (deliverPrompt) deliverPrompt(prompt);
    else earlyPrompt = prompt;
  });
}

/** Test hook: forget anything {@link captureInstallPromptEarly} stored. */
export function resetEarlyInstallPrompt(): void {
  earlyPrompt = null;
  earlyCaptureStarted = false;
  deliverPrompt = null;
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). */
export function isAppleMobile(nav: Navigator | undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/** True when the page already runs as an installed app. */
export function isRunningStandalone(win: Window | undefined): boolean {
  if (!win) return false;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav?.standalone === true) return true;
  return [
    'standalone',
    'window-controls-overlay',
    'minimal-ui',
    'fullscreen',
  ].some(mode => win.matchMedia?.(`(display-mode: ${mode})`).matches ?? false);
}

/**
 * Offers installing Inkweld as an app (PWA): the home-screen banner and the
 * Settings → General button read {@link mode}. Never offered when already
 * installed, or behind Home Assistant ingress (an installed copy would lose
 * HA's session).
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly logger = inject(LoggerService);
  private readonly win: Window | undefined = globalThis.window;

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private initialized = false;

  private readonly promptAvailable = signal(false);
  /** Running as an installed app, or installed during this session */
  readonly installed = signal(false);
  private readonly unsupported = signal(false);
  private readonly appleMobile = signal(false);
  /** The user closed the home-screen banner (remembered per browser) */
  readonly dismissed = signal(false);

  readonly mode = computed<InstallMode>(() => {
    if (this.installed() || this.unsupported()) return 'none';
    if (this.promptAvailable()) return 'prompt';
    if (this.appleMobile()) return 'ios';
    return 'none';
  });

  /** Whether the home screen should show the install banner */
  readonly showBanner = computed(
    () => this.mode() !== 'none' && !this.dismissed()
  );

  /** Wire up the browser events. Safe to call more than once. */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    const win = this.win;
    if (!win) {
      this.unsupported.set(true);
      return;
    }

    this.dismissed.set(this.readDismissed());

    if (isHomeAssistantIngress()) {
      this.unsupported.set(true);
      return;
    }
    if (isRunningStandalone(win)) {
      this.installed.set(true);
      return;
    }

    this.appleMobile.set(isAppleMobile(win.navigator));

    if (earlyCaptureStarted) {
      // main.ts is already listening: take what it caught, then let it
      // deliver later events straight here.
      if (earlyPrompt) this.accept(earlyPrompt);
      earlyPrompt = null;
      deliverPrompt = event => this.accept(event);
    } else {
      win.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        this.accept(event as BeforeInstallPromptEvent);
      });
    }
    win.addEventListener('appinstalled', () => {
      this.logger.info('PwaInstall', 'Inkweld was installed');
      this.deferredPrompt = null;
      this.promptAvailable.set(false);
      this.installed.set(true);
    });
  }

  /**
   * Open the browser's install dialog. Resolves to whether the user accepted.
   * The event can only be used once, so the button goes away either way until
   * the browser offers a new one.
   */
  async install(): Promise<boolean> {
    const event = this.deferredPrompt;
    if (!event) return false;
    this.deferredPrompt = null;
    this.promptAvailable.set(false);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome === 'accepted';
    } catch (err) {
      this.logger.warn('PwaInstall', 'Install prompt failed', err);
      return false;
    }
  }

  /** Hide the home-screen banner on this browser. Settings still offers it. */
  dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage unavailable (private mode); hidden for this session only.
    }
  }

  private accept(event: BeforeInstallPromptEvent): void {
    this.deferredPrompt = event;
    this.promptAvailable.set(true);
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISSED_KEY) !== null;
    } catch {
      return false;
    }
  }
}
