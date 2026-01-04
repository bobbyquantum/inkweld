import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { ConfirmationDialogComponent } from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';

import { UpdateService } from './update.service';

describe('UpdateService', () => {
  let service: UpdateService;
  let swUpdateMock: any;
  let dialogMock: any;
  let versionUpdatesSubject: Subject<any>;

  beforeEach(() => {
    versionUpdatesSubject = new Subject();
    swUpdateMock = {
      isEnabled: true,
      versionUpdates: versionUpdatesSubject.asObservable(),
      checkForUpdate: vi.fn().mockResolvedValue(true),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      }),
    };

    TestBed.configureTestingModule({
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

    service = TestBed.inject(UpdateService);
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
});
