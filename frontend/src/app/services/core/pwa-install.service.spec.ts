import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type BeforeInstallPromptEvent,
  captureInstallPromptEarly,
  isAppleMobile,
  isRunningStandalone,
  PwaInstallService,
  resetEarlyInstallPrompt,
} from './pwa-install.service';

function installEvent(
  outcome: 'accepted' | 'dismissed' = 'accepted'
): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
}

function createService(): PwaInstallService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), PwaInstallService],
  });
  const service = TestBed.inject(PwaInstallService);
  service.initialize();
  return service;
}

describe('PwaInstallService', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEarlyInstallPrompt();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelector('meta[name="inkweld-ingress"]')?.remove();
    TestBed.resetTestingModule();
  });

  it('offers nothing until the browser sends an install event', () => {
    const service = createService();

    expect(service.mode()).toBe('none');
    expect(service.showBanner()).toBe(false);
  });

  it('offers the install prompt once the browser sends the event', () => {
    const service = createService();
    const event = installEvent();

    globalThis.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(service.mode()).toBe('prompt');
    expect(service.showBanner()).toBe(true);
  });

  it('opens the browser dialog and reports an accepted install', async () => {
    const service = createService();
    const event = installEvent('accepted');
    globalThis.dispatchEvent(event);

    await expect(service.install()).resolves.toBe(true);

    expect(event.prompt).toHaveBeenCalledTimes(1);
    // The event can only be used once.
    expect(service.mode()).toBe('none');
  });

  it('reports a declined install', async () => {
    const service = createService();
    globalThis.dispatchEvent(installEvent('dismissed'));

    await expect(service.install()).resolves.toBe(false);
  });

  it('does nothing when there is no event to prompt with', async () => {
    const service = createService();

    await expect(service.install()).resolves.toBe(false);
  });

  it('treats a failing prompt as not installed', async () => {
    const service = createService();
    const event = installEvent();
    vi.mocked(event.prompt).mockRejectedValue(new Error('already shown'));
    globalThis.dispatchEvent(event);

    await expect(service.install()).resolves.toBe(false);
  });

  it('marks the app installed when the browser says so', () => {
    const service = createService();
    globalThis.dispatchEvent(installEvent());

    globalThis.dispatchEvent(new Event('appinstalled'));

    expect(service.installed()).toBe(true);
    expect(service.mode()).toBe('none');
  });

  it('remembers a dismissed banner across reloads', () => {
    const service = createService();
    globalThis.dispatchEvent(installEvent());

    service.dismiss();

    expect(service.showBanner()).toBe(false);
    // Settings can still install.
    expect(service.mode()).toBe('prompt');

    TestBed.resetTestingModule();
    const reloaded = createService();
    expect(reloaded.dismissed()).toBe(true);
  });

  it('keeps working when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const service = createService();

    expect(service.dismissed()).toBe(false);
    service.dismiss();
    expect(service.dismissed()).toBe(true);
  });

  it('shows Add to Home Screen instructions on iPhone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    );
    const service = createService();

    expect(service.mode()).toBe('ios');
    expect(service.showBanner()).toBe(true);
  });

  it('offers nothing when already running as an installed app', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(display-mode: standalone)',
      }))
    );
    const service = createService();
    globalThis.dispatchEvent(installEvent());

    expect(service.installed()).toBe(true);
    expect(service.mode()).toBe('none');
  });

  it('offers nothing behind Home Assistant ingress', () => {
    const meta = document.createElement('meta');
    meta.name = 'inkweld-ingress';
    document.head.appendChild(meta);
    const service = createService();
    globalThis.dispatchEvent(installEvent());

    expect(service.mode()).toBe('none');
  });

  it('only initializes once', () => {
    const service = createService();
    const addListener = vi.spyOn(globalThis, 'addEventListener');

    service.initialize();

    expect(addListener).not.toHaveBeenCalled();
  });

  describe('early capture', () => {
    it('keeps an event that arrives before the app starts', () => {
      const target = new EventTarget();
      captureInstallPromptEarly(target);
      const early = installEvent();
      target.dispatchEvent(early);

      expect(early.defaultPrevented).toBe(true);
      const service = createService();
      expect(service.mode()).toBe('prompt');
    });

    it('hands later events straight to the running service', () => {
      const target = new EventTarget();
      captureInstallPromptEarly(target);
      const service = createService();
      expect(service.mode()).toBe('none');

      target.dispatchEvent(installEvent());

      expect(service.mode()).toBe('prompt');
    });

    it('starts listening only once', () => {
      const target = new EventTarget();
      const addListener = vi.spyOn(target, 'addEventListener');

      captureInstallPromptEarly(target);
      captureInstallPromptEarly(target);

      expect(addListener).toHaveBeenCalledTimes(1);
    });
  });
});

describe('isAppleMobile', () => {
  const nav = (userAgent: string, maxTouchPoints = 0) =>
    ({ userAgent, maxTouchPoints }) as Navigator;

  it('recognises iPhone and iPad user agents', () => {
    expect(isAppleMobile(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'))).toBe(
      true
    );
    expect(isAppleMobile(nav('Mozilla/5.0 (iPad; CPU OS 18_0)'))).toBe(true);
  });

  it('recognises an iPad that reports itself as a Mac', () => {
    expect(
      isAppleMobile(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5))
    ).toBe(true);
    expect(
      isAppleMobile(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0))
    ).toBe(false);
  });

  it('is false elsewhere', () => {
    expect(isAppleMobile(nav('Mozilla/5.0 (Linux; Android 15)'))).toBe(false);
    expect(isAppleMobile(undefined)).toBe(false);
  });
});

describe('isRunningStandalone', () => {
  const win = (standalone: boolean | undefined, mode?: string) =>
    ({
      navigator: { standalone },
      matchMedia: (query: string) => ({
        matches: query === `(display-mode: ${mode})`,
      }),
    }) as unknown as Window;

  it('detects iOS home-screen apps', () => {
    expect(isRunningStandalone(win(true))).toBe(true);
  });

  it('detects installed display modes', () => {
    expect(isRunningStandalone(win(undefined, 'standalone'))).toBe(true);
    expect(isRunningStandalone(win(undefined, 'window-controls-overlay'))).toBe(
      true
    );
  });

  it('is false in a browser tab', () => {
    expect(isRunningStandalone(win(undefined, 'browser'))).toBe(false);
    expect(isRunningStandalone(undefined)).toBe(false);
  });
});
