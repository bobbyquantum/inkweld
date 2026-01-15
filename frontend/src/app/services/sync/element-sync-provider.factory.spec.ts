import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SetupService } from '../core/setup.service';
import { ElementSyncProviderFactory } from './element-sync-provider.factory';
import { LocalElementSyncProvider } from './local-element-sync.provider';
import { YjsElementSyncProvider } from './yjs-element-sync.provider';

describe('ElementSyncProviderFactory', () => {
  let factory: ElementSyncProviderFactory;
  let mockSetupService: {
    getMode: ReturnType<typeof vi.fn>;
    getWebSocketUrl: ReturnType<typeof vi.fn>;
  };
  let mockYjsProvider: YjsElementSyncProvider;
  let mockLocalProvider: LocalElementSyncProvider;

  beforeEach(() => {
    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    };

    mockYjsProvider = {
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn(),
    } as unknown as YjsElementSyncProvider;

    mockLocalProvider = {
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn(),
    } as unknown as LocalElementSyncProvider;

    TestBed.configureTestingModule({
      providers: [
        ElementSyncProviderFactory,
        { provide: SetupService, useValue: mockSetupService },
        { provide: YjsElementSyncProvider, useValue: mockYjsProvider },
        { provide: LocalElementSyncProvider, useValue: mockLocalProvider },
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

    it('should return LocalElementSyncProvider in local mode', () => {
      mockSetupService.getMode.mockReturnValue('local');

      const provider = factory.getProvider();

      expect(provider).toBe(mockLocalProvider);
    });
  });

  describe('getCurrentMode()', () => {
    it('should return current mode from setup service', () => {
      mockSetupService.getMode.mockReturnValue('server');

      expect(factory.getCurrentMode()).toBe('server');

      mockSetupService.getMode.mockReturnValue('local');
      expect(factory.getCurrentMode()).toBe('local');
    });
  });

  describe('isLocalMode()', () => {
    it('should return true for local mode', () => {
      mockSetupService.getMode.mockReturnValue('local');

      expect(factory.isLocalMode()).toBe(true);
    });

    it('should return false for server mode', () => {
      mockSetupService.getMode.mockReturnValue('server');

      expect(factory.isLocalMode()).toBe(false);
    });
  });
});
