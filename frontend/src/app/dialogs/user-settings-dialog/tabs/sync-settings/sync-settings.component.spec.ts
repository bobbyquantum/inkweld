import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SetupService } from '@services/core/setup.service';
import { MockedObject, vi } from 'vitest';

import { SyncSettingsComponent } from './sync-settings.component';

describe('SyncSettingsComponent', () => {
  let component: SyncSettingsComponent;
  let fixture: ComponentFixture<SyncSettingsComponent>;
  let setupService: MockedObject<SetupService>;
  let snackBarMock: MockedObject<MatSnackBar>;

  beforeEach(async () => {
    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
    } as unknown as MockedObject<SetupService>;

    snackBarMock = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [SyncSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SetupService, useValue: setupService },
        { provide: MatSnackBar, useValue: snackBarMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SyncSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display server mode', () => {
    expect(component['currentMode']).toBe('server');
  });

  describe('toggleAutoSync', () => {
    it('should toggle auto sync on', () => {
      component['autoSyncEnabled'].set(false);
      component.toggleAutoSync();
      expect(component['autoSyncEnabled']()).toBe(true);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Auto-sync enabled',
        'Close',
        { duration: 2000 }
      );
    });

    it('should toggle auto sync off', () => {
      component['autoSyncEnabled'].set(true);
      component.toggleAutoSync();
      expect(component['autoSyncEnabled']()).toBe(false);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Auto-sync disabled',
        'Close',
        { duration: 2000 }
      );
    });
  });

  describe('updateSyncInterval', () => {
    it('should update sync interval', () => {
      component.updateSyncInterval(15);
      expect(component['syncInterval']()).toBe(15);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Sync interval updated to 15 minutes',
        'Close',
        { duration: 2000 }
      );
    });
  });

  describe('triggerManualSync', () => {
    it('should show message when in offline mode', async () => {
      setupService.getMode.mockReturnValue('offline');
      // Recreate component with offline mode
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [SyncSettingsComponent],
        providers: [
          provideZonelessChangeDetection(),
          { provide: SetupService, useValue: setupService },
          { provide: MatSnackBar, useValue: snackBarMock },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(SyncSettingsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      await component.triggerManualSync();

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Sync is not available in offline mode',
        'Close',
        { duration: 3000 }
      );
    });

    it('should trigger sync successfully in server mode', async () => {
      // Use fake timers
      vi.useFakeTimers();

      const syncPromise = component.triggerManualSync();

      // Check syncing state immediately
      expect(component['syncStatus']().isSyncing).toBe(true);

      // Advance time past the simulated sync delay
      await vi.advanceTimersByTimeAsync(2100);

      // Wait for the promise to complete
      await syncPromise;

      expect(component['syncStatus']().isSyncing).toBe(false);
      expect(component['syncStatus']().lastSync).not.toBeNull();
      expect(component['syncStatus']().pendingChanges).toBe(0);
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Sync completed successfully',
        'Close',
        { duration: 3000 }
      );

      vi.useRealTimers();
    });
  });

  describe('resolveConflicts', () => {
    it('should show not implemented message', () => {
      component.resolveConflicts();
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Conflict resolution not yet implemented',
        'Close',
        { duration: 3000 }
      );
    });
  });

  describe('getLastSyncTime', () => {
    it('should return "Never" when lastSync is null', () => {
      expect(component.getLastSyncTime()).toBe('Never');
    });

    it('should return "Just now" for recent sync', () => {
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: new Date(),
      }));
      expect(component.getLastSyncTime()).toBe('Just now');
    });

    it('should return minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: fiveMinutesAgo,
      }));
      expect(component.getLastSyncTime()).toBe('5 minutes ago');
    });

    it('should return singular minute', () => {
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: oneMinuteAgo,
      }));
      expect(component.getLastSyncTime()).toBe('1 minute ago');
    });

    it('should return hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: twoHoursAgo,
      }));
      expect(component.getLastSyncTime()).toBe('2 hours ago');
    });

    it('should return singular hour', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: oneHourAgo,
      }));
      expect(component.getLastSyncTime()).toBe('1 hour ago');
    });

    it('should return days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: threeDaysAgo,
      }));
      expect(component.getLastSyncTime()).toBe('3 days ago');
    });

    it('should return singular day', () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      component['syncStatus'].update(s => ({
        ...s,
        lastSync: oneDayAgo,
      }));
      expect(component.getLastSyncTime()).toBe('1 day ago');
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(component.formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(component.formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(component.formatBytes(1024)).toBe('1 KB');
      expect(component.formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(component.formatBytes(1048576)).toBe('1 MB');
      expect(component.formatBytes(2621440)).toBe('2.5 MB');
    });

    it('should format gigabytes', () => {
      expect(component.formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('media sync state helpers', () => {
    it('should return 0 for server total size when no state', () => {
      component['mediaSyncState'].set(null);
      expect(component.getServerTotalSize()).toBe(0);
    });

    it('should return 0 for local total size when no state', () => {
      component['mediaSyncState'].set(null);
      expect(component.getLocalTotalSize()).toBe(0);
    });

    it('should return 0 for server file count when no state', () => {
      component['mediaSyncState'].set(null);
      expect(component.getServerFileCount()).toBe(0);
    });

    it('should return 0 for local file count when no state', () => {
      component['mediaSyncState'].set(null);
      expect(component.getLocalFileCount()).toBe(0);
    });

    it('should calculate server total size from items', () => {
      component['mediaSyncState'].set({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        downloadProgress: 0,
        items: [
          {
            mediaId: '1',
            size: 100,
            status: 'synced',
            server: { filename: 'a.png', size: 100 },
          },
          {
            mediaId: '2',
            size: 200,
            status: 'synced',
            server: { filename: 'b.png', size: 200 },
          },
          {
            mediaId: '3',
            size: 50,
            status: 'local-only',
            local: {
              mediaId: '3',
              size: 50,
              mimeType: 'image/png',
              createdAt: new Date().toISOString(),
            },
          },
        ],
      });
      expect(component.getServerTotalSize()).toBe(300);
    });

    it('should calculate local total size from items', () => {
      component['mediaSyncState'].set({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        downloadProgress: 0,
        items: [
          {
            mediaId: '1',
            size: 100,
            status: 'local-only',
            local: {
              mediaId: '1',
              size: 100,
              mimeType: 'image/png',
              createdAt: new Date().toISOString(),
            },
          },
          {
            mediaId: '2',
            size: 200,
            status: 'local-only',
            local: {
              mediaId: '2',
              size: 200,
              mimeType: 'image/png',
              createdAt: new Date().toISOString(),
            },
          },
          {
            mediaId: '3',
            size: 50,
            status: 'server-only',
            server: { filename: 'c.png', size: 50 },
          },
        ],
      });
      expect(component.getLocalTotalSize()).toBe(300);
    });

    it('should count server files', () => {
      component['mediaSyncState'].set({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        downloadProgress: 0,
        items: [
          {
            mediaId: '1',
            size: 100,
            status: 'synced',
            server: { filename: 'a.png', size: 100 },
          },
          {
            mediaId: '2',
            size: 200,
            status: 'synced',
            server: { filename: 'b.png', size: 200 },
          },
          {
            mediaId: '3',
            size: 50,
            status: 'local-only',
            local: {
              mediaId: '3',
              size: 50,
              mimeType: 'image/png',
              createdAt: new Date().toISOString(),
            },
          },
        ],
      });
      expect(component.getServerFileCount()).toBe(2);
    });

    it('should count local files', () => {
      component['mediaSyncState'].set({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        downloadProgress: 0,
        items: [
          {
            mediaId: '1',
            size: 100,
            status: 'local-only',
            local: {
              mediaId: '1',
              size: 100,
              mimeType: 'image/png',
              createdAt: new Date().toISOString(),
            },
          },
          {
            mediaId: '2',
            size: 200,
            status: 'local-only',
            local: {
              mediaId: '2',
              size: 200,
              mimeType: 'image/png',
              createdAt: new Date().toISOString(),
            },
          },
          {
            mediaId: '3',
            size: 50,
            status: 'server-only',
            server: { filename: 'c.png', size: 50 },
          },
        ],
      });
      expect(component.getLocalFileCount()).toBe(2);
    });
  });
});
