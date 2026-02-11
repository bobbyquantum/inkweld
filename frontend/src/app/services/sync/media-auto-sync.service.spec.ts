import { TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { MediaSyncService } from '../local/media-sync.service';
import { MediaAutoSyncService } from './media-auto-sync.service';

describe('MediaAutoSyncService', () => {
  let service: MediaAutoSyncService;
  let mockMediaSyncService: {
    fullSync: Mock;
    checkSyncStatus: Mock;
    downloadAllFromServer: Mock;
    uploadAllToServer: Mock;
  };
  let mockSetupService: { getMode: Mock; getWebSocketUrl: Mock };
  let mockAuthTokenService: { getToken: Mock };
  let mockLogger: { info: Mock; warn: Mock; error: Mock; debug: Mock };

  beforeEach(() => {
    mockMediaSyncService = {
      fullSync: vi.fn().mockResolvedValue(undefined),
      checkSyncStatus: vi.fn().mockResolvedValue({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        items: [],
        downloadProgress: 0,
      }),
      downloadAllFromServer: vi.fn().mockResolvedValue(undefined),
      uploadAllToServer: vi.fn().mockResolvedValue(undefined),
    };

    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getWebSocketUrl: vi.fn().mockReturnValue(null), // Disable WS in tests by default
    };

    mockAuthTokenService = {
      getToken: vi.fn().mockReturnValue('mock-token'),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        MediaAutoSyncService,
        { provide: MediaSyncService, useValue: mockMediaSyncService },
        { provide: SetupService, useValue: mockSetupService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(MediaAutoSyncService);
  });

  afterEach(() => {
    service.stopAutoSync();
    vi.restoreAllMocks();
  });

  describe('startAutoSync', () => {
    it('should run initial fullSync when starting', async () => {
      await service.startAutoSync('alice/novel');

      expect(mockMediaSyncService.fullSync).toHaveBeenCalledWith('alice/novel');
      expect(service.isActive()).toBe(true);
    });

    it('should skip auto-sync in local mode', async () => {
      mockSetupService.getMode.mockReturnValue('local');

      await service.startAutoSync('alice/novel');

      expect(mockMediaSyncService.fullSync).not.toHaveBeenCalled();
      expect(service.isActive()).toBe(false);
    });

    it('should skip if already syncing the same project', async () => {
      await service.startAutoSync('alice/novel');
      mockMediaSyncService.fullSync.mockClear();

      await service.startAutoSync('alice/novel');

      expect(mockMediaSyncService.fullSync).not.toHaveBeenCalled();
    });

    it('should stop previous sync when starting a new project', async () => {
      await service.startAutoSync('alice/novel');
      mockMediaSyncService.fullSync.mockClear();

      await service.startAutoSync('bob/story');

      expect(mockMediaSyncService.fullSync).toHaveBeenCalledWith('bob/story');
      expect(service.isActive()).toBe(true);
    });

    it('should handle initial sync errors gracefully', async () => {
      mockMediaSyncService.fullSync.mockRejectedValue(
        new Error('Network error')
      );

      // Should not throw
      await service.startAutoSync('alice/novel');

      expect(service.isActive()).toBe(true);
    });

    it('should update lastSyncTime after successful sync', async () => {
      expect(service.lastSyncTime()).toBeNull();

      await service.startAutoSync('alice/novel');

      expect(service.lastSyncTime()).not.toBeNull();
    });
  });

  describe('stopAutoSync', () => {
    it('should set isActive to false', async () => {
      await service.startAutoSync('alice/novel');
      expect(service.isActive()).toBe(true);

      service.stopAutoSync();
      expect(service.isActive()).toBe(false);
    });

    it('should handle stopping when not active', () => {
      // Should not throw
      service.stopAutoSync();
      expect(service.isActive()).toBe(false);
    });
  });

  describe('triggerSyncAfterUpload', () => {
    it('should run fullSync for the active project', async () => {
      await service.startAutoSync('alice/novel');
      mockMediaSyncService.fullSync.mockClear();

      await service.triggerSyncAfterUpload();

      expect(mockMediaSyncService.fullSync).toHaveBeenCalledWith('alice/novel');
    });

    it('should not sync if no project is active', async () => {
      await service.triggerSyncAfterUpload();

      expect(mockMediaSyncService.fullSync).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      await service.startAutoSync('alice/novel');
      mockMediaSyncService.fullSync.mockClear();
      mockMediaSyncService.fullSync.mockRejectedValue(
        new Error('Upload failed')
      );

      // Should not throw
      await service.triggerSyncAfterUpload();
    });
  });

  describe('periodic sync', () => {
    it('should run periodic syncs at the configured interval', async () => {
      vi.useFakeTimers();

      await service.startAutoSync('alice/novel');
      mockMediaSyncService.fullSync.mockClear();

      // Advance past the periodic interval (60s) — use advanceTimersByTimeAsync
      // to properly handle the async callback without infinite timer loops
      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockMediaSyncService.fullSync).toHaveBeenCalledWith('alice/novel');

      vi.useRealTimers();
    });

    it('should stop periodic sync when stopAutoSync is called', async () => {
      vi.useFakeTimers();

      await service.startAutoSync('alice/novel');
      service.stopAutoSync();
      mockMediaSyncService.fullSync.mockClear();

      vi.advanceTimersByTime(120_000);

      expect(mockMediaSyncService.fullSync).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('overlapping sync prevention', () => {
    it('should not run overlapping syncs', async () => {
      // Make fullSync take some time
      let resolveSync: () => void;
      mockMediaSyncService.fullSync.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolveSync = resolve;
          })
      );

      // Start auto-sync (triggers initial sync)
      const startPromise = service.startAutoSync('alice/novel');

      // While initial sync is running, trigger another sync
      const uploadPromise = service.triggerSyncAfterUpload();

      // Resolve the initial sync
      resolveSync!();
      await startPromise;
      await uploadPromise;

      // Only one fullSync call should have been made (the initial one)
      // The upload trigger should have been skipped
      expect(mockMediaSyncService.fullSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('WebSocket notifications', () => {
    it('should not create WebSocket in local mode', async () => {
      mockSetupService.getMode.mockReturnValue('local');

      await service.startAutoSync('alice/novel');

      // In local mode, startAutoSync returns early — no sync or WS
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'MediaAutoSync',
        'Skipping auto-sync — local mode'
      );
    });

    it('should not create WebSocket when no URL configured', async () => {
      mockSetupService.getWebSocketUrl.mockReturnValue(null);

      await service.startAutoSync('alice/novel');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'MediaAutoSync',
        'Skipping WebSocket — no WebSocket URL configured'
      );
    });

    it('should not create WebSocket when no auth token', async () => {
      mockSetupService.getWebSocketUrl.mockReturnValue('ws://localhost:8333');
      mockAuthTokenService.getToken.mockReturnValue(null);

      await service.startAutoSync('alice/novel');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'MediaAutoSync',
        'Skipping WebSocket — no auth token'
      );
    });
  });
});
