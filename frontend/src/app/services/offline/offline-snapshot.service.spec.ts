import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { LoggerService } from '../core/logger.service';
import {
  OfflineSnapshotService,
  StoredSnapshot,
} from './offline-snapshot.service';
import { StorageService } from './storage.service';

/**
 * Tests for OfflineSnapshotService.
 *
 * These tests mock IndexedDB through the StorageService to test
 * snapshot CRUD operations and sync status management.
 */
describe('OfflineSnapshotService', () => {
  let service: OfflineSnapshotService;
  let storageService: DeepMockProxy<StorageService>;
  let logger: DeepMockProxy<LoggerService>;
  let mockDb: IDBDatabase;

  const mockSnapshot: StoredSnapshot = {
    id: 'testuser/test-project:doc-1:snap-uuid-1',
    projectKey: 'testuser/test-project',
    documentId: 'doc-1',
    name: 'Test Snapshot',
    description: 'A test snapshot',
    xmlContent: '<doc><p>Hello World</p></doc>',
    wordCount: 2,
    createdAt: '2024-01-01T00:00:00.000Z',
    synced: false,
  };

  beforeEach(() => {
    logger = mockDeep<LoggerService>();
    storageService = mockDeep<StorageService>();

    // Create a mock IDBDatabase
    mockDb = {
      transaction: vi.fn(),
      objectStoreNames: { contains: vi.fn(() => true) },
      close: vi.fn(),
    } as unknown as IDBDatabase;

    // Mock database initialization
    storageService.initializeDatabase.mockResolvedValue(mockDb);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        OfflineSnapshotService,
        { provide: LoggerService, useValue: logger },
        { provide: StorageService, useValue: storageService },
      ],
    });

    service = TestBed.inject(OfflineSnapshotService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with hasPendingSync as false', () => {
      expect(service.hasPendingSync()).toBe(false);
    });
  });

  describe('createSnapshot', () => {
    it('should create a new snapshot and store it', async () => {
      storageService.put.mockResolvedValue(undefined);

      // Mock getAll for updatePendingSync
      const mockStore = {
        getAll: vi.fn(() => ({
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          result: [],
        })),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      // Trigger the async success handler
      setTimeout(() => {
        const req = mockStore.getAll();
        if (req.onsuccess) {
          req.onsuccess({} as Event);
        }
      }, 0);

      const result = await service.createSnapshot(
        'testuser/test-project',
        'doc-1',
        {
          name: 'New Snapshot',
          xmlContent: '<doc><p>Content</p></doc>',
          wordCount: 1,
        }
      );

      expect(result.projectKey).toBe('testuser/test-project');
      expect(result.documentId).toBe('doc-1');
      expect(result.name).toBe('New Snapshot');
      expect(result.xmlContent).toBe('<doc><p>Content</p></doc>');
      expect(result.synced).toBe(false);
      expect(storageService.put).toHaveBeenCalled();
    });
  });

  describe('getSnapshot', () => {
    it('should return a snapshot by composite key', async () => {
      storageService.get.mockResolvedValue(mockSnapshot);

      const result = await service.getSnapshot(
        'testuser/test-project',
        'doc-1',
        'snap-uuid-1'
      );

      expect(result).toEqual(mockSnapshot);
      expect(storageService.get).toHaveBeenCalledWith(
        mockDb,
        'snapshots',
        'testuser/test-project:doc-1:snap-uuid-1'
      );
    });

    it('should return undefined when snapshot not found', async () => {
      storageService.get.mockResolvedValue(undefined);

      const result = await service.getSnapshot(
        'testuser/test-project',
        'doc-1',
        'non-existent'
      );

      expect(result).toBeUndefined();
    });
  });

  describe('getSnapshotById', () => {
    it('should return a snapshot by ID', async () => {
      storageService.get.mockResolvedValue(mockSnapshot);

      const result = await service.getSnapshotById(mockSnapshot.id);

      expect(result).toEqual(mockSnapshot);
      expect(storageService.get).toHaveBeenCalledWith(
        mockDb,
        'snapshots',
        mockSnapshot.id
      );
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete a snapshot by composite key', async () => {
      storageService.delete.mockResolvedValue(undefined);

      // Mock for updatePendingSync
      const mockStore = {
        getAll: vi.fn(() => ({
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          result: [],
        })),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      setTimeout(() => {
        const req = mockStore.getAll();
        if (req.onsuccess) {
          req.onsuccess({} as Event);
        }
      }, 0);

      await service.deleteSnapshot(
        'testuser/test-project',
        'doc-1',
        'snap-uuid-1'
      );

      expect(storageService.delete).toHaveBeenCalledWith(
        mockDb,
        'snapshots',
        'testuser/test-project:doc-1:snap-uuid-1'
      );
    });
  });

  describe('importSnapshot', () => {
    it('should import a snapshot from archive data', async () => {
      storageService.put.mockResolvedValue(undefined);

      // Mock for updatePendingSync
      const mockStore = {
        getAll: vi.fn(() => ({
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          result: [],
        })),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      setTimeout(() => {
        const req = mockStore.getAll();
        if (req.onsuccess) {
          req.onsuccess({} as Event);
        }
      }, 0);

      const result = await service.importSnapshot('testuser/test-project', {
        documentId: 'doc-1',
        name: 'Imported Snapshot',
        xmlContent: '<doc><p>Imported</p></doc>',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      expect(result.documentId).toBe('doc-1');
      expect(result.name).toBe('Imported Snapshot');
      expect(result.synced).toBe(false);
      expect(storageService.put).toHaveBeenCalled();
    });
  });

  describe('markSynced', () => {
    it('should mark a snapshot as synced with server ID', async () => {
      storageService.get.mockResolvedValue(mockSnapshot);
      storageService.put.mockResolvedValue(undefined);

      // Mock for updatePendingSync
      const mockStore = {
        getAll: vi.fn(() => ({
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          result: [],
        })),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      setTimeout(() => {
        const req = mockStore.getAll();
        if (req.onsuccess) {
          req.onsuccess({} as Event);
        }
      }, 0);

      await service.markSynced(mockSnapshot.id, 'server-id-123');

      expect(storageService.put).toHaveBeenCalledWith(
        mockDb,
        'snapshots',
        expect.objectContaining({
          id: mockSnapshot.id,
          synced: true,
          serverId: 'server-id-123',
        })
      );
    });
  });
});
