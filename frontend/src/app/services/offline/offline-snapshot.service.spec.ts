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

    it('should do nothing when snapshot not found', async () => {
      storageService.get.mockResolvedValue(undefined);

      await service.markSynced('non-existent-id', 'server-id-123');

      expect(storageService.put).not.toHaveBeenCalled();
    });
  });

  describe('listSnapshotsForDocument', () => {
    it('should return snapshots filtered by document', async () => {
      const snapshots: StoredSnapshot[] = [
        { ...mockSnapshot, id: 'testuser/test-project:doc-1:snap-1' },
        {
          ...mockSnapshot,
          id: 'testuser/test-project:doc-1:snap-2',
          name: 'Second Snapshot',
        },
        {
          ...mockSnapshot,
          id: 'testuser/test-project:doc-2:snap-3',
          documentId: 'doc-2',
        },
      ];

      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        result: snapshots,
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.listSnapshotsForDocument(
        'testuser/test-project',
        'doc-1'
      );

      // Trigger success handler
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({} as Event);
        }
      }, 0);

      const result = await promise;

      expect(result).toHaveLength(2);
      expect(result[0].id).toContain('doc-1');
      expect(result[1].id).toContain('doc-1');
    });

    it('should handle request errors', async () => {
      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        error: { message: 'Test error' },
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.listSnapshotsForDocument(
        'testuser/test-project',
        'doc-1'
      );

      setTimeout(() => {
        if (mockRequest.onerror) {
          mockRequest.onerror({} as Event);
        }
      }, 0);

      await expect(promise).rejects.toThrow('Test error');
    });
  });

  describe('listSnapshotsForProject', () => {
    it('should return all snapshots for a project', async () => {
      const snapshots: StoredSnapshot[] = [
        { ...mockSnapshot, id: 'testuser/test-project:doc-1:snap-1' },
        { ...mockSnapshot, id: 'testuser/test-project:doc-2:snap-2' },
        { ...mockSnapshot, id: 'other/project:doc-1:snap-3' },
      ];

      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        result: snapshots,
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.listSnapshotsForProject('testuser/test-project');

      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({} as Event);
        }
      }, 0);

      const result = await promise;

      expect(result).toHaveLength(2);
      expect(result.every(s => s.id.startsWith('testuser/test-project:'))).toBe(
        true
      );
    });
  });

  describe('getUnsyncedSnapshots', () => {
    it('should return only unsynced snapshots', async () => {
      const snapshots: StoredSnapshot[] = [
        { ...mockSnapshot, id: 'snap-1', synced: false },
        { ...mockSnapshot, id: 'snap-2', synced: true },
        { ...mockSnapshot, id: 'snap-3', synced: false },
      ];

      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        result: snapshots,
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.getUnsyncedSnapshots();

      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({} as Event);
        }
      }, 0);

      const result = await promise;

      expect(result).toHaveLength(2);
      expect(result.every(s => !s.synced)).toBe(true);
    });
  });

  describe('deleteSnapshotById', () => {
    it('should delete a snapshot by its ID', async () => {
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

      await service.deleteSnapshotById('testuser/test-project:doc-1:snap-uuid');

      expect(storageService.delete).toHaveBeenCalledWith(
        mockDb,
        'snapshots',
        'testuser/test-project:doc-1:snap-uuid'
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'OfflineSnapshot',
        'Deleted snapshot testuser/test-project:doc-1:snap-uuid'
      );
    });
  });

  describe('deleteAllForProject', () => {
    it('should delete all snapshots for a project', async () => {
      const snapshots: StoredSnapshot[] = [
        { ...mockSnapshot, id: 'testuser/test-project:doc-1:snap-1' },
        { ...mockSnapshot, id: 'testuser/test-project:doc-2:snap-2' },
        { ...mockSnapshot, id: 'other/project:doc-1:snap-3' },
      ];

      const deleteRequests: { onsuccess: (() => void) | null }[] = [];
      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        result: snapshots,
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
        delete: vi.fn(() => {
          const req = { onsuccess: null as (() => void) | null, onerror: null };
          deleteRequests.push(req);
          return req;
        }),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.deleteAllForProject('testuser/test-project');

      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({} as Event);
        }
        // Trigger delete success for each
        setTimeout(() => {
          deleteRequests.forEach(req => {
            if (req.onsuccess) req.onsuccess();
          });
        }, 0);
      }, 0);

      await promise;

      expect(mockStore.delete).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenCalledWith(
        'OfflineSnapshot',
        'Deleted 2 snapshots for testuser/test-project'
      );
    });
  });

  describe('getSnapshotsForExport', () => {
    it('should return all snapshots for export', async () => {
      const snapshots: StoredSnapshot[] = [
        {
          ...mockSnapshot,
          id: 'testuser/test-project:doc-1:snap-1',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
        {
          ...mockSnapshot,
          id: 'testuser/test-project:doc-1:snap-2',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        { ...mockSnapshot, id: 'other/project:doc-1:snap-3' },
      ];

      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        result: snapshots,
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.getSnapshotsForExport('testuser/test-project');

      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({} as Event);
        }
      }, 0);

      const result = await promise;

      expect(result).toHaveLength(2);
      // Should be sorted by createdAt ascending (oldest first for export)
      expect(result[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result[1].createdAt).toBe('2024-01-02T00:00:00.000Z');
    });
  });

  describe('hasPendingSync signal', () => {
    it('should update to true when unsynced snapshots exist', async () => {
      storageService.put.mockResolvedValue(undefined);

      const unsyncedSnapshot = { ...mockSnapshot, synced: false };
      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        result: [unsyncedSnapshot],
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.createSnapshot('testuser/test-project', 'doc-1', {
        name: 'Test',
        xmlContent: '<doc></doc>',
      });

      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({} as Event);
        }
      }, 0);

      await promise;

      // Wait a tick for updatePendingSync to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(service.hasPendingSync()).toBe(true);
    });

    it('should handle updatePendingSync errors gracefully', async () => {
      storageService.put.mockResolvedValue(undefined);

      const mockRequest = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        error: { message: 'Test error' },
      };
      const mockStore = {
        getAll: vi.fn(() => mockRequest),
      };
      const mockTransaction = {
        objectStore: vi.fn(() => mockStore),
        onerror: null as ((ev: Event) => void) | null,
      };
      (mockDb.transaction as ReturnType<typeof vi.fn>).mockReturnValue(
        mockTransaction
      );

      const promise = service.createSnapshot('testuser/test-project', 'doc-1', {
        name: 'Test',
        xmlContent: '<doc></doc>',
      });

      setTimeout(() => {
        if (mockRequest.onerror) {
          mockRequest.onerror({} as Event);
        }
      }, 0);

      await promise;

      // Wait for updatePendingSync error handling
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.warn).toHaveBeenCalledWith(
        'OfflineSnapshot',
        'Failed to check pending sync status',
        expect.anything()
      );
    });
  });

  describe('importSnapshot with legacy format', () => {
    it('should import a snapshot with xmlContent', async () => {
      storageService.put.mockResolvedValue(undefined);

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

      const xmlContent = '<doc><p>Test content</p></doc>';
      const result = await service.importSnapshot('testuser/test-project', {
        documentId: 'doc-1',
        name: 'Test Snapshot',
        xmlContent: xmlContent,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      expect(result.xmlContent).toEqual(xmlContent);
    });
  });
});
