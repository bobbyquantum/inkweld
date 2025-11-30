import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SetupService } from '../core/setup.service';
import { ElementSyncProviderFactory } from './element-sync-provider.factory';
import { OfflineElementSyncProvider } from './offline-element-sync.provider';
import { YjsElementSyncProvider } from './yjs-element-sync.provider';

describe('ElementSyncProviderFactory', () => {
  let factory: ElementSyncProviderFactory;
  let mockSetupService: {
    getMode: ReturnType<typeof vi.fn>;
    getWebSocketUrl: ReturnType<typeof vi.fn>;
  };
  let mockYjsProvider: YjsElementSyncProvider;
  let mockOfflineProvider: OfflineElementSyncProvider;

  beforeEach(() => {
    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    };

    mockYjsProvider = {
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn(),
    } as unknown as YjsElementSyncProvider;

    mockOfflineProvider = {
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn(),
    } as unknown as OfflineElementSyncProvider;

    TestBed.configureTestingModule({
      providers: [
        ElementSyncProviderFactory,
        { provide: SetupService, useValue: mockSetupService },
        { provide: YjsElementSyncProvider, useValue: mockYjsProvider },
        { provide: OfflineElementSyncProvider, useValue: mockOfflineProvider },
      ],
    });

    factory = TestBed.inject(ElementSyncProviderFactory);
  });

  describe('getProvider()', () => {
    it('should return YjsElementSyncProvider in server mode', () => {
      mockSetupService.getMode.mockReturnValue('server');

      const provider = factory.getProvider();

      expect(provider).toBe(mockYjsProvider);
    });

    it('should return OfflineElementSyncProvider in offline mode', () => {
      mockSetupService.getMode.mockReturnValue('offline');

      const provider = factory.getProvider();

      expect(provider).toBe(mockOfflineProvider);
    });
  });

  describe('getCurrentMode()', () => {
    it('should return current mode from setup service', () => {
      mockSetupService.getMode.mockReturnValue('server');

      expect(factory.getCurrentMode()).toBe('server');

      mockSetupService.getMode.mockReturnValue('offline');
      expect(factory.getCurrentMode()).toBe('offline');
    });
  });

  describe('isOfflineMode()', () => {
    it('should return true for offline mode', () => {
      mockSetupService.getMode.mockReturnValue('offline');

      expect(factory.isOfflineMode()).toBe(true);
    });

    it('should return false for server mode', () => {
      mockSetupService.getMode.mockReturnValue('server');

      expect(factory.isOfflineMode()).toBe(false);
    });
  });
});
