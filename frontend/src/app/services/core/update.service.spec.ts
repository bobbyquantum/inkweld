import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { ConfirmationDialogComponent } from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { UpdateService } from './update.service';
import { LAST_SEEN_VERSION_KEY } from './whats-new.service';

describe('UpdateService', () => {
  let service: UpdateService;
  let swUpdateMock: any;
  let dialogMock: any;
  let versionUpdatesSubject: Subject<any>;
  let unrecoverableSubject: Subject<any>;

  beforeEach(() => {
    localStorage.removeItem(LAST_SEEN_VERSION_KEY);
    versionUpdatesSubject = new Subject();
    unrecoverableSubject = new Subject();
    swUpdateMock = {
      isEnabled: true,
      versionUpdates: versionUpdatesSubject.asObservable(),
      unrecoverable: unrecoverableSubject.asObservable(),
      checkForUpdate: vi.fn().mockResolvedValue(true),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      }),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        UpdateService,
        { provide: SwUpdate, useValue: swUpdateMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
    });

    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: vi.fn() },
    });

    // Default to online. `configurable` matters: without it the property is
    // frozen for the whole worker, and any later spec that spies on the getter
    // fails with "Cannot redefine property: onLine".
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: true,
    });

    service = TestBed.inject(UpdateService);
    // Pin the running version so the spec doesn't depend on the release.
    (service as { currentVersion: string }).currentVersion = '1.0.0-beta.1';
    service.initialize();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should open dialog when VERSION_READY event is emitted', () => {
    const event: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2' },
    };

    versionUpdatesSubject.next(event);

    expect(dialogMock.open).toHaveBeenCalledWith(
      ConfirmationDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Update Available',
        }),
      })
    );
  });

  it('should reload page when dialog is confirmed', () => {
    const event: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2' },
    };

    versionUpdatesSubject.next(event);

    expect(window.location.reload).toHaveBeenCalled();
  });

  it('should not reload page when dialog is cancelled', () => {
    dialogMock.open.mockReturnValue({
      afterClosed: vi.fn().mockReturnValue(of(false)),
    });

    const event: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2' },
    };

    versionUpdatesSubject.next(event);

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('should apply update by reloading the page', () => {
    service.applyUpdate();
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('should not open a second dialog while one is already open', () => {
    dialogMock.open.mockReturnValue({
      afterClosed: vi.fn().mockReturnValue(new Subject<any>().asObservable()),
    });

    const event: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2' },
    };

    versionUpdatesSubject.next(event);
    versionUpdatesSubject.next(event);

    expect(dialogMock.open).toHaveBeenCalledTimes(1);
  });

  function readyWith(appData: object | undefined): VersionReadyEvent {
    return {
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2', appData },
    };
  }

  function openedData(): any {
    return dialogMock.open.mock.calls[0][1].data;
  }

  it('names the version, bump and highlights from the build appData', () => {
    versionUpdatesSubject.next(
      readyWith({
        version: '1.0.0-beta.3',
        releases: [
          { version: '1.0.0-beta.3', highlights: ['Word sprints'], more: 2 },
          { version: '1.0.0-beta.2', highlights: ['Faster sync'], more: 0 },
          { version: '1.0.0-beta.1', highlights: ['Old news'], more: 0 },
        ],
      })
    );

    expect(openedData()).toEqual(
      expect.objectContaining({
        title: 'Beta Update Available',
        message:
          "Inkweld 1.0.0-beta.3 is ready to install (you have 1.0.0-beta.1). What's new:",
        details: [
          'Word sprints',
          'Faster sync',
          '…and 2 more changes in About → Changelog',
        ],
      })
    );
  });

  it('labels a move from beta to a stable release', () => {
    versionUpdatesSubject.next(readyWith({ version: '1.0.0', releases: [] }));

    expect(openedData()).toEqual(
      expect.objectContaining({
        title: 'Stable Release Available',
        message:
          'Inkweld 1.0.0 is ready to install (you have 1.0.0-beta.1). Update now?',
        details: [],
      })
    );
  });

  it('marks the new version as seen when the update is accepted', () => {
    versionUpdatesSubject.next(
      readyWith({ version: '1.0.0-beta.2', releases: [] })
    );

    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('1.0.0-beta.2');
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('uses the generic prompt when the build has the same version', () => {
    // A preview build between releases keeps the released version.
    versionUpdatesSubject.next(
      readyWith({ version: '1.0.0-beta.1', releases: [] })
    );

    expect(openedData()).toEqual(
      expect.objectContaining({
        title: 'Update Available',
        message: 'A new version of Inkweld is available. Update now?',
      })
    );
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBeNull();
  });

  it('uses the generic prompt when the build has no appData', () => {
    versionUpdatesSubject.next(readyWith(undefined));

    expect(openedData().title).toBe('Update Available');
    expect(openedData().details).toBeUndefined();
  });

  it('should handle checkForUpdate error gracefully', async () => {
    swUpdateMock.checkForUpdate.mockRejectedValue(new Error('Network error'));
    const result = await service.checkForUpdate();
    expect(result).toBe(false);
  });

  it('should skip update check when offline', async () => {
    swUpdateMock.checkForUpdate.mockClear();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: false,
    });
    const result = await service.checkForUpdate();
    expect(result).toBe(false);
    expect(swUpdateMock.checkForUpdate).not.toHaveBeenCalled();
  });

  it('should reload on unrecoverable state when online', () => {
    unrecoverableSubject.next({ reason: 'Hash mismatch' });
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('should not reload on unrecoverable state when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      writable: true,
      value: false,
    });
    unrecoverableSubject.next({ reason: 'Hash mismatch' });
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});

describe('UpdateService without SwUpdate', () => {
  let service: UpdateService;
  let dialogMock: any;

  beforeEach(() => {
    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      }),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        UpdateService,
        { provide: MatDialog, useValue: dialogMock },
        // No SwUpdate provider - it will be null via optional injection
      ],
    });

    service = TestBed.inject(UpdateService);
  });

  it('should be created without SwUpdate', () => {
    expect(service).toBeTruthy();
  });

  it('should return false when checking for update without SwUpdate', async () => {
    const result = await service.checkForUpdate();
    expect(result).toBe(false);
  });

  it('should report updateAvailable as false', () => {
    expect(service.updateAvailable()).toBe(false);
  });
});
