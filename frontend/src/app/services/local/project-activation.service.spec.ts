import 'fake-indexeddb/auto';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';
import { ProjectActivationService } from './project-activation.service';
import { StorageService } from './storage.service';

describe('ProjectActivationService', () => {
  let service: ProjectActivationService;
  let storageService: StorageService;

  const TEST_PROJECT_KEY = 'alice/my-novel';

  const mockSetupService = {
    getMode: vi.fn().mockReturnValue('server'),
  };

  const mockStorageContext = {
    prefixDbName: vi.fn((name: string) => `srv:test:${name}`),
  };

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetupService.getMode.mockReturnValue('server');

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageService,
        ProjectActivationService,
        { provide: SetupService, useValue: mockSetupService },
        { provide: StorageContextService, useValue: mockStorageContext },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    storageService = TestBed.inject(StorageService);
    service = TestBed.inject(ProjectActivationService);
  });

  afterEach(() => {
    storageService.closeAll();

    Object.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
  });

  describe('server mode', () => {
    it('should report activation required in server mode', () => {
      expect(service.isActivationRequired()).toBe(true);
    });

    it('should not be activated by default', async () => {
      await service.initialize();
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(false);
    });

    it('should activate a project', async () => {
      await service.initialize();
      await service.activate(TEST_PROJECT_KEY);
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(true);
    });

    it('should deactivate a project', async () => {
      await service.initialize();
      await service.activate(TEST_PROJECT_KEY);
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(true);

      await service.deactivate(TEST_PROJECT_KEY);
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(false);
    });

    it('should persist activations across re-initialize', async () => {
      await service.initialize();
      await service.activate(TEST_PROJECT_KEY);
      await service.activate('bob/other');

      // In-memory set retains activations from activate() calls
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(true);
      expect(service.isActivated('bob/other')).toBe(true);
    });

    it('should only read from IndexedDB once (idempotent initialize)', async () => {
      await service.initialize();
      await service.activate(TEST_PROJECT_KEY);

      // Second initialize returns cached promise — does not re-read
      await service.initialize();
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(true);
    });

    it('should return activated project keys', async () => {
      await service.initialize();
      await service.activate('alice/proj-a');
      await service.activate('bob/proj-b');

      const keys = service.getActivatedProjects();
      expect(keys).toContain('alice/proj-a');
      expect(keys).toContain('bob/proj-b');
      expect(keys).toHaveLength(2);
    });

    it('should increment activationVersion on activate', async () => {
      await service.initialize();
      const v1 = service.activationVersion();
      await service.activate(TEST_PROJECT_KEY);
      expect(service.activationVersion()).toBe(v1 + 1);
    });

    it('should increment activationVersion on deactivate', async () => {
      await service.initialize();
      await service.activate(TEST_PROJECT_KEY);
      const v1 = service.activationVersion();
      await service.deactivate(TEST_PROJECT_KEY);
      expect(service.activationVersion()).toBe(v1 + 1);
    });

    it('should not double-activate', async () => {
      await service.initialize();
      await service.activate(TEST_PROJECT_KEY);
      const v1 = service.activationVersion();
      await service.activate(TEST_PROJECT_KEY);
      // Version should not have changed
      expect(service.activationVersion()).toBe(v1);
    });
  });

  describe('local mode', () => {
    beforeEach(() => {
      mockSetupService.getMode.mockReturnValue('local');
    });

    it('should not require activation in local mode', () => {
      expect(service.isActivationRequired()).toBe(false);
    });

    it('should always report projects as activated', () => {
      expect(service.isActivated(TEST_PROJECT_KEY)).toBe(true);
      expect(service.isActivated('any/project')).toBe(true);
    });

    it('should skip initialization in local mode', async () => {
      await service.initialize();
      // Should not attempt to open IndexedDB
      expect(service.getActivatedProjects()).toHaveLength(0);
    });
  });
});
