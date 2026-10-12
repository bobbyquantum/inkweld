import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type InstallMode,
  PwaInstallService,
} from '@services/core/pwa-install.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { InstallAppBannerComponent } from './install-app-banner.component';

describe('InstallAppBannerComponent', () => {
  let fixture: ComponentFixture<InstallAppBannerComponent>;
  let mode: ReturnType<typeof signal<InstallMode>>;
  let showBanner: ReturnType<typeof signal<boolean>>;
  let pwaInstall: {
    mode: typeof mode;
    showBanner: typeof showBanner;
    install: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };

  const query = (testId: string): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`
    );

  beforeEach(async () => {
    mode = signal<InstallMode>('prompt');
    showBanner = signal(true);
    pwaInstall = {
      mode,
      showBanner,
      install: vi.fn().mockResolvedValue(true),
      dismiss: vi.fn(() => showBanner.set(false)),
    };

    await TestBed.configureTestingModule({
      imports: [InstallAppBannerComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PwaInstallService, useValue: pwaInstall },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InstallAppBannerComponent);
    await fixture.whenStable();
  });

  it('offers to install when the browser can prompt', () => {
    expect(query('install-app-banner')?.textContent).toContain(
      'Install Inkweld'
    );
    expect(query('install-app-ios-hint')).toBeNull();

    query('install-app-button')?.click();

    expect(pwaInstall.install).toHaveBeenCalled();
  });

  it('explains Add to Home Screen on iPhone and iPad', async () => {
    mode.set('ios');
    await fixture.whenStable();

    expect(query('install-app-button')).toBeNull();
    expect(query('install-app-ios-hint')?.textContent).toContain(
      'Add to Home Screen'
    );
  });

  it('hides itself when dismissed', async () => {
    query('install-app-dismiss')?.click();
    await fixture.whenStable();

    expect(pwaInstall.dismiss).toHaveBeenCalled();
    expect(query('install-app-banner')).toBeNull();
  });

  it('renders nothing when there is nothing to offer', async () => {
    showBanner.set(false);
    await fixture.whenStable();

    expect(query('install-app-banner')).toBeNull();
  });
});
