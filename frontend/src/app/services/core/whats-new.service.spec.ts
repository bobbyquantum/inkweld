import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  LAST_SEEN_VERSION_KEY,
  markVersionSeen,
  WhatsNewService,
} from './whats-new.service';

describe('WhatsNewService', () => {
  let service: WhatsNewService;
  let action: Subject<void>;
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.removeItem(LAST_SEEN_VERSION_KEY);
    action = new Subject<void>();
    snackBar = {
      open: vi.fn().mockReturnValue({ onAction: () => action.asObservable() }),
    };
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(WhatsNewService);
    // Pin the running version so the spec doesn't depend on the release.
    (service as { currentVersion: string }).currentVersion = '1.0.0-beta.3';
  });

  afterEach(() => {
    localStorage.removeItem(LAST_SEEN_VERSION_KEY);
  });

  it('records the version without a notice on first run', () => {
    service.initialize();

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('1.0.0-beta.3');
  });

  it('shows the notice once after an update', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0-beta.2');

    service.initialize();
    service.initialize();

    expect(snackBar.open).toHaveBeenCalledTimes(1);
    expect(snackBar.open).toHaveBeenCalledWith(
      'Updated to Inkweld 1.0.0-beta.3',
      "What's new",
      expect.objectContaining({ duration: expect.any(Number) })
    );
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('1.0.0-beta.3');
  });

  it('opens the changelog from the notice action', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0-beta.2');
    service.initialize();

    action.next();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/about/changelog');
  });

  it('stays quiet when the version is unchanged, older or unreadable', () => {
    for (const lastSeen of ['1.0.0-beta.3', '1.0.0-beta.4', 'garbage']) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, lastSeen);
      service.initialize();
    }

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('1.0.0-beta.3');
  });

  it('stays quiet once the update dialog marked the version as seen', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '1.0.0-beta.2');
    markVersionSeen('1.0.0-beta.3');

    service.initialize();

    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('survives storage that throws', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });

    expect(() => service.initialize()).not.toThrow();
    expect(snackBar.open).not.toHaveBeenCalled();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
