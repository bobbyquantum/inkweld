import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DocumentSnapshot,
  ElementType,
  Project,
  SnapshotsService,
} from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { ProjectElement } from '../../models/project-element';
import { LoggerService } from '../core/logger.service';
import {
  OfflineSnapshotService,
  SnapshotInfo,
  StoredSnapshot,
} from '../offline/offline-snapshot.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';
import { UnifiedSnapshotService } from './unified-snapshot.service';

describe('UnifiedSnapshotService', () => {
  let service: UnifiedSnapshotService;
  let projectSignal: ReturnType<typeof signal<Project | undefined>>;
  let elementsSignal: ReturnType<typeof signal<ProjectElement[]>>;

  // Mock services
  let projectState: {
    project: ReturnType<typeof signal<Project | undefined>>;
    elements: ReturnType<typeof signal<ProjectElement[]>>;
  };
  let documentService: { getYDoc: ReturnType<typeof vi.fn> };
  let offlineSnapshots: {
    createSnapshot: ReturnType<typeof vi.fn>;
    listSnapshotsForDocument: ReturnType<typeof vi.fn>;
    listSnapshotsForProject: ReturnType<typeof vi.fn>;
    getSnapshotById: ReturnType<typeof vi.fn>;
    deleteSnapshotById: ReturnType<typeof vi.fn>;
    getUnsyncedSnapshots: ReturnType<typeof vi.fn>;
    getSnapshotsForExport: ReturnType<typeof vi.fn>;
    importSnapshot: ReturnType<typeof vi.fn>;
    updatePendingCount: ReturnType<typeof vi.fn>;
  };
  let syncFactory: { isOfflineMode: ReturnType<typeof vi.fn> };
  let snapshotsApi: {
    createProjectSnapshot: ReturnType<typeof vi.fn>;
    listProjectSnapshots: ReturnType<typeof vi.fn>;
    previewProjectSnapshot: ReturnType<typeof vi.fn>;
    deleteProjectSnapshot: ReturnType<typeof vi.fn>;
  };
  let worldbuildingService: { getYDoc: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockProject: Partial<Project> = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
  };

  // Helper to create ProjectElement with all required properties
  const createElement = (
    id: string,
    name: string,
    type: ElementType
  ): ProjectElement =>
    ({
      id,
      name,
      type,
      level: 0,
      order: 0,
      parentId: null,
      expandable: type === ElementType.Folder,
      version: 1,
      metadata: {},
    }) as ProjectElement;

  const mockElement = createElement('doc-123', 'Chapter 1', ElementType.Item);

  const mockStoredSnapshot: StoredSnapshot = {
    id: 'testuser/test-project:doc-123:snap-1',
    projectKey: 'testuser/test-project',
    documentId: 'doc-123',
    name: 'Test Snapshot',
    description: 'Test description',
    xmlContent: '<paragraph>Test content</paragraph>',
    wordCount: 10,
    createdAt: '2025-01-01T00:00:00.000Z',
    synced: false,
  };

  const mockSnapshotInfo: SnapshotInfo = {
    id: 'testuser/test-project:doc-123:snap-1',
    documentId: 'doc-123',
    name: 'Test Snapshot',
    description: 'Test description',
    wordCount: 10,
    createdAt: '2025-01-01T00:00:00.000Z',
    synced: false,
  };

  const mockServerSnapshot: DocumentSnapshot = {
    id: 'server-snap-1',
    documentId: 'doc-123',
    name: 'Server Snapshot',
    description: 'From server',
    wordCount: 20,
    createdAt: '2025-01-02T00:00:00.000Z',
  };

  beforeEach(() => {
    projectSignal = signal<Project | undefined>(mockProject as Project);
    elementsSignal = signal<ProjectElement[]>([mockElement]);

    projectState = {
      project: projectSignal,
      elements: elementsSignal,
    };

    documentService = {
      getYDoc: vi.fn().mockResolvedValue(new Y.Doc()),
    };

    offlineSnapshots = {
      createSnapshot: vi.fn().mockResolvedValue(mockStoredSnapshot),
      listSnapshotsForDocument: vi.fn().mockResolvedValue([mockSnapshotInfo]),
      listSnapshotsForProject: vi.fn().mockResolvedValue([mockSnapshotInfo]),
      getSnapshotById: vi.fn().mockResolvedValue(mockStoredSnapshot),
      deleteSnapshotById: vi.fn().mockResolvedValue(undefined),
      getUnsyncedSnapshots: vi.fn().mockResolvedValue([]),
      getSnapshotsForExport: vi.fn().mockResolvedValue([mockStoredSnapshot]),
      importSnapshot: vi.fn().mockResolvedValue(mockStoredSnapshot),
      updatePendingCount: vi.fn().mockResolvedValue(undefined),
    };

    syncFactory = {
      isOfflineMode: vi.fn().mockReturnValue(false),
    };

    snapshotsApi = {
      createProjectSnapshot: vi.fn().mockReturnValue(of(mockServerSnapshot)),
      listProjectSnapshots: vi.fn().mockReturnValue(of([mockServerSnapshot])),
      previewProjectSnapshot: vi
        .fn()
        .mockReturnValue(
          of({ ...mockServerSnapshot, yDocState: btoa('test') })
        ),
      deleteProjectSnapshot: vi
        .fn()
        .mockReturnValue(of({ message: 'Deleted' })),
    };

    worldbuildingService = {
      getYDoc: vi.fn().mockReturnValue(new Y.Doc()),
    };

    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        UnifiedSnapshotService,
        { provide: ProjectStateService, useValue: projectState },
        { provide: DocumentService, useValue: documentService },
        { provide: OfflineSnapshotService, useValue: offlineSnapshots },
        { provide: ElementSyncProviderFactory, useValue: syncFactory },
        { provide: SnapshotsService, useValue: snapshotsApi },
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(UnifiedSnapshotService);
  });

  describe('initial state', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize isSyncing as false', () => {
      expect(service.isSyncing()).toBe(false);
    });

    it('should initialize pendingCount as 0', () => {
      expect(service.pendingCount()).toBe(0);
    });
  });

  describe('createSnapshot', () => {
    it('should throw error when no active project', async () => {
      projectSignal.set(undefined);

      await expect(
        service.createSnapshot('doc-123', 'Test Snapshot')
      ).rejects.toThrow('No active project');
    });

    it('should throw error when document not found', async () => {
      documentService.getYDoc.mockResolvedValue(null);

      await expect(
        service.createSnapshot('doc-123', 'Test Snapshot')
      ).rejects.toThrow('Document doc-123 not found or not loaded');
    });

    it('should create snapshot locally first', async () => {
      const ydoc = new Y.Doc();
      const prosemirror = ydoc.getXmlFragment('prosemirror');
      ydoc.transact(() => {
        const para = new Y.XmlElement('paragraph');
        para.insert(0, [new Y.XmlText('Hello world')]);
        prosemirror.insert(0, [para]);
      });

      documentService.getYDoc.mockResolvedValue(ydoc);
      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      const result = await service.createSnapshot(
        'doc-123',
        'Test Snapshot',
        'Description'
      );

      expect(offlineSnapshots.createSnapshot).toHaveBeenCalledWith(
        'testuser/test-project',
        'doc-123',
        expect.objectContaining({
          name: 'Test Snapshot',
          description: 'Description',
          xmlContent: expect.any(String),
          wordCount: expect.any(Number),
        })
      );
      expect(result).toBe(mockStoredSnapshot);
    });

    it('should try to sync to server when online', async () => {
      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);
      offlineSnapshots.createSnapshot.mockResolvedValue({
        ...mockStoredSnapshot,
        yDocState: new Uint8Array([1, 2, 3]),
      });

      await service.createSnapshot('doc-123', 'Test Snapshot');

      expect(snapshotsApi.createProjectSnapshot).toHaveBeenCalled();
    });

    it('should not sync to server when offline', async () => {
      syncFactory.isOfflineMode.mockReturnValue(true);
      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);
      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      await service.createSnapshot('doc-123', 'Test Snapshot');

      expect(snapshotsApi.createProjectSnapshot).not.toHaveBeenCalled();
    });

    it('should include worldbuilding data for worldbuilding elements', async () => {
      const element = createElement(
        'char-123',
        'Character',
        ElementType.Worldbuilding
      );
      elementsSignal.set([element]);

      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);

      const wbYdoc = new Y.Doc();
      const dataMap = wbYdoc.getMap('data');
      wbYdoc.transact(() => {
        dataMap.set('name', 'John Doe');
        dataMap.set('age', 30);
      });
      worldbuildingService.getYDoc.mockReturnValue(wbYdoc);

      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      await service.createSnapshot('char-123', 'Character Snapshot');

      expect(offlineSnapshots.createSnapshot).toHaveBeenCalledWith(
        'testuser/test-project',
        'char-123',
        expect.objectContaining({
          worldbuildingData: expect.objectContaining({
            name: 'John Doe',
            age: 30,
          }),
        })
      );
    });
  });

  describe('createBulkSnapshots', () => {
    it('should create snapshots for multiple documents', async () => {
      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);
      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      elementsSignal.set([
        createElement('doc-1', 'Doc 1', ElementType.Item),
        createElement('doc-2', 'Doc 2', ElementType.Item),
      ]);

      const result = await service.createBulkSnapshots(
        ['doc-1', 'doc-2'],
        'Backup'
      );

      expect(result).toHaveLength(2);
      expect(offlineSnapshots.createSnapshot).toHaveBeenCalledTimes(2);
    });

    it('should continue if one document fails', async () => {
      const ydoc = new Y.Doc();
      documentService.getYDoc
        .mockResolvedValueOnce(null) // First fails
        .mockResolvedValueOnce(ydoc); // Second succeeds
      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      elementsSignal.set([
        createElement('doc-1', 'Doc 1', ElementType.Item),
        createElement('doc-2', 'Doc 2', ElementType.Item),
      ]);

      const result = await service.createBulkSnapshots(
        ['doc-1', 'doc-2'],
        'Backup'
      );

      expect(result).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('listSnapshots', () => {
    it('should throw error when no active project', async () => {
      projectSignal.set(undefined);

      await expect(service.listSnapshots('doc-123')).rejects.toThrow(
        'No active project'
      );
    });

    it('should return merged local and server snapshots', async () => {
      offlineSnapshots.listSnapshotsForDocument.mockResolvedValue([
        mockSnapshotInfo,
      ]);
      snapshotsApi.listProjectSnapshots.mockReturnValue(
        of([mockServerSnapshot])
      );

      const result = await service.listSnapshots('doc-123');

      expect(result).toHaveLength(2);
      expect(result[0].isLocal).toBe(false); // Server is newer
      expect(result[1].isLocal).toBe(true);
    });

    it('should return only local snapshots when offline', async () => {
      syncFactory.isOfflineMode.mockReturnValue(true);
      offlineSnapshots.listSnapshotsForDocument.mockResolvedValue([
        mockSnapshotInfo,
      ]);

      const result = await service.listSnapshots('doc-123');

      expect(result).toHaveLength(1);
      expect(result[0].isLocal).toBe(true);
      expect(snapshotsApi.listProjectSnapshots).not.toHaveBeenCalled();
    });

    it('should handle server fetch failure gracefully', async () => {
      offlineSnapshots.listSnapshotsForDocument.mockResolvedValue([
        mockSnapshotInfo,
      ]);
      snapshotsApi.listProjectSnapshots.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      const result = await service.listSnapshots('doc-123');

      expect(result).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should filter server snapshots to requested document', async () => {
      const otherDocSnapshot: DocumentSnapshot = {
        ...mockServerSnapshot,
        documentId: 'other-doc',
      };
      offlineSnapshots.listSnapshotsForDocument.mockResolvedValue([]);
      snapshotsApi.listProjectSnapshots.mockReturnValue(
        of([mockServerSnapshot, otherDocSnapshot])
      );

      const result = await service.listSnapshots('doc-123');

      expect(result).toHaveLength(1);
      expect(result[0].documentId).toBe('doc-123');
    });
  });

  describe('listProjectSnapshots', () => {
    it('should list all snapshots for project', async () => {
      offlineSnapshots.listSnapshotsForProject.mockResolvedValue([
        mockSnapshotInfo,
      ]);
      snapshotsApi.listProjectSnapshots.mockReturnValue(
        of([mockServerSnapshot])
      );

      const result = await service.listProjectSnapshots();

      expect(result).toHaveLength(2);
      expect(offlineSnapshots.listSnapshotsForProject).toHaveBeenCalledWith(
        'testuser/test-project'
      );
    });
  });

  describe('getSnapshotForRestore', () => {
    it('should return local snapshot if found', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue(mockStoredSnapshot);

      const result = await service.getSnapshotForRestore('snap-123');

      expect(result).toBe(mockStoredSnapshot);
      expect(snapshotsApi.previewProjectSnapshot).not.toHaveBeenCalled();
    });

    it('should fetch from server if not found locally', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue(undefined);
      snapshotsApi.previewProjectSnapshot.mockReturnValue(
        of({
          id: 'server-snap',
          documentId: 'doc-123',
          name: 'Server Snap',
          createdAt: new Date().toISOString(),
          yDocState: btoa('test'),
        })
      );

      const result = await service.getSnapshotForRestore('server-snap');

      expect(result).toBeDefined();
      expect(result?.id).toBe('server-snap');
    });

    it('should return undefined if not found anywhere', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue(undefined);
      snapshotsApi.previewProjectSnapshot.mockReturnValue(
        throwError(() => new Error('Not found'))
      );

      const result = await service.getSnapshotForRestore('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined in offline mode if not local', async () => {
      syncFactory.isOfflineMode.mockReturnValue(true);
      offlineSnapshots.getSnapshotById.mockResolvedValue(undefined);

      const result = await service.getSnapshotForRestore('server-only');

      expect(result).toBeUndefined();
      expect(snapshotsApi.previewProjectSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('restoreFromSnapshot', () => {
    it('should throw if snapshot not found', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue(undefined);
      syncFactory.isOfflineMode.mockReturnValue(true);

      await expect(
        service.restoreFromSnapshot('doc-123', 'nonexistent')
      ).rejects.toThrow('Snapshot nonexistent not found');
    });

    it('should throw if snapshot is for different document', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue({
        ...mockStoredSnapshot,
        documentId: 'other-doc',
      });

      await expect(
        service.restoreFromSnapshot('doc-123', mockStoredSnapshot.id)
      ).rejects.toThrow('Snapshot');
    });

    it('should restore from xmlContent when available', async () => {
      const snapshotWithXml: StoredSnapshot = {
        ...mockStoredSnapshot,
        xmlContent: '<paragraph>Restored content</paragraph>',
      };
      offlineSnapshots.getSnapshotById.mockResolvedValue(snapshotWithXml);

      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);

      const result = await service.restoreFromSnapshot(
        'doc-123',
        snapshotWithXml.id
      );

      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'UnifiedSnapshot',
        expect.stringContaining('using XML content')
      );
    });

    it('should throw if snapshot has no content', async () => {
      const emptySnapshot: StoredSnapshot = {
        ...mockStoredSnapshot,
        xmlContent: '',
      };
      offlineSnapshots.getSnapshotById.mockResolvedValue(emptySnapshot);

      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);

      await expect(
        service.restoreFromSnapshot('doc-123', emptySnapshot.id)
      ).rejects.toThrow('has no content to restore');
    });
  });

  describe('restoreFromContent', () => {
    it('should apply XML content to document', async () => {
      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);

      await service.restoreFromContent(
        'doc-123',
        '<paragraph>Test</paragraph>'
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'UnifiedSnapshot',
        expect.stringContaining('Applied XML content')
      );
    });

    it('should throw if document not found', async () => {
      documentService.getYDoc.mockResolvedValue(null);

      await expect(
        service.restoreFromContent('doc-123', '<paragraph>Test</paragraph>')
      ).rejects.toThrow('Document doc-123 not found');
    });

    it('should apply worldbuilding data when provided', async () => {
      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);

      const wbYdoc = new Y.Doc();
      worldbuildingService.getYDoc.mockReturnValue(wbYdoc);

      await service.restoreFromContent(
        'doc-123',
        '<paragraph>Test</paragraph>',
        { name: 'Character', traits: ['brave'] }
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'UnifiedSnapshot',
        expect.stringContaining('Applied worldbuilding data')
      );
    });
  });

  describe('deleteSnapshot', () => {
    it('should throw if no active project', async () => {
      projectSignal.set(undefined);

      await expect(service.deleteSnapshot('snap-123')).rejects.toThrow(
        'No active project'
      );
    });

    it('should delete from local storage', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue(mockStoredSnapshot);

      await service.deleteSnapshot(mockStoredSnapshot.id);

      expect(offlineSnapshots.deleteSnapshotById).toHaveBeenCalledWith(
        mockStoredSnapshot.id
      );
    });

    it('should delete from server if synced and online', async () => {
      const syncedSnapshot: StoredSnapshot = {
        ...mockStoredSnapshot,
        synced: true,
        serverId: 'server-123',
      };
      offlineSnapshots.getSnapshotById.mockResolvedValue(syncedSnapshot);

      await service.deleteSnapshot(syncedSnapshot.id);

      expect(snapshotsApi.deleteProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'server-123'
      );
    });

    it('should not delete from server if offline', async () => {
      syncFactory.isOfflineMode.mockReturnValue(true);
      const syncedSnapshot: StoredSnapshot = {
        ...mockStoredSnapshot,
        synced: true,
        serverId: 'server-123',
      };
      offlineSnapshots.getSnapshotById.mockResolvedValue(syncedSnapshot);

      await service.deleteSnapshot(syncedSnapshot.id);

      expect(snapshotsApi.deleteProjectSnapshot).not.toHaveBeenCalled();
    });

    it('should try to delete server-only snapshot', async () => {
      offlineSnapshots.getSnapshotById.mockResolvedValue(undefined);

      await service.deleteSnapshot('server-only-id');

      expect(snapshotsApi.deleteProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'server-only-id'
      );
    });

    it('should handle server delete failure gracefully', async () => {
      const syncedSnapshot: StoredSnapshot = {
        ...mockStoredSnapshot,
        synced: true,
        serverId: 'server-123',
      };
      offlineSnapshots.getSnapshotById.mockResolvedValue(syncedSnapshot);
      snapshotsApi.deleteProjectSnapshot.mockReturnValue(
        throwError(() => new Error('Server error'))
      );

      await service.deleteSnapshot(syncedSnapshot.id);

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('syncPendingSnapshots', () => {
    it('should do nothing in offline mode', async () => {
      syncFactory.isOfflineMode.mockReturnValue(true);

      await service.syncPendingSnapshots();

      expect(offlineSnapshots.getUnsyncedSnapshots).not.toHaveBeenCalled();
    });

    it('should do nothing without active project', async () => {
      projectSignal.set(undefined);

      await service.syncPendingSnapshots();

      expect(offlineSnapshots.getUnsyncedSnapshots).not.toHaveBeenCalled();
    });

    it('should sync unsynced snapshots for current project', async () => {
      const unsynced: StoredSnapshot[] = [
        {
          ...mockStoredSnapshot,
          id: 'testuser/test-project:doc-123:snap-1',
        },
        {
          ...mockStoredSnapshot,
          id: 'other/project:doc-456:snap-2',
        },
      ];
      offlineSnapshots.getUnsyncedSnapshots.mockResolvedValue(unsynced);

      await service.syncPendingSnapshots();

      expect(snapshotsApi.createProjectSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should set isSyncing during sync', async () => {
      offlineSnapshots.getUnsyncedSnapshots.mockResolvedValue([]);

      expect(service.isSyncing()).toBe(false);

      const promise = service.syncPendingSnapshots();

      await promise;

      expect(service.isSyncing()).toBe(false);
    });
  });

  describe('getSnapshotsForExport', () => {
    it('should throw if no active project', async () => {
      projectSignal.set(undefined);

      await expect(service.getSnapshotsForExport()).rejects.toThrow(
        'No active project'
      );
    });

    it('should return snapshots from offline service', async () => {
      offlineSnapshots.getSnapshotsForExport.mockResolvedValue([
        mockStoredSnapshot,
      ]);

      const result = await service.getSnapshotsForExport();

      expect(result).toEqual([mockStoredSnapshot]);
      expect(offlineSnapshots.getSnapshotsForExport).toHaveBeenCalledWith(
        'testuser/test-project'
      );
    });
  });

  describe('importSnapshots', () => {
    it('should throw if no active project', async () => {
      projectSignal.set(undefined);

      await expect(service.importSnapshots([])).rejects.toThrow(
        'No active project'
      );
    });

    it('should import snapshots through offline service', async () => {
      const importData = [
        {
          documentId: 'doc-123',
          name: 'Imported',
          yDocState: new Uint8Array([1, 2, 3]),
          createdAt: new Date().toISOString(),
        },
      ];
      offlineSnapshots.importSnapshot.mockResolvedValue(mockStoredSnapshot);
      offlineSnapshots.getUnsyncedSnapshots.mockResolvedValue([]);

      const result = await service.importSnapshots(importData);

      expect(result).toHaveLength(1);
      expect(offlineSnapshots.importSnapshot).toHaveBeenCalledWith(
        'testuser/test-project',
        importData[0]
      );
    });

    it('should try to sync after import when online', async () => {
      const importData = [
        {
          documentId: 'doc-123',
          name: 'Imported',
          yDocState: new Uint8Array([1, 2, 3]),
          createdAt: new Date().toISOString(),
        },
      ];
      offlineSnapshots.importSnapshot.mockResolvedValue(mockStoredSnapshot);
      offlineSnapshots.getUnsyncedSnapshots.mockResolvedValue([]);

      await service.importSnapshots(importData);

      expect(offlineSnapshots.getUnsyncedSnapshots).toHaveBeenCalled();
    });
  });

  describe('mergeSnapshots (via listSnapshots)', () => {
    it('should deduplicate snapshots by server ID', async () => {
      const localWithServerId: SnapshotInfo = {
        ...mockSnapshotInfo,
        synced: true,
        serverId: 'server-snap-1',
      };
      const serverSame: DocumentSnapshot = {
        ...mockServerSnapshot,
        id: 'server-snap-1',
      };
      offlineSnapshots.listSnapshotsForDocument.mockResolvedValue([
        localWithServerId,
      ]);
      snapshotsApi.listProjectSnapshots.mockReturnValue(of([serverSame]));

      const result = await service.listSnapshots('doc-123');

      expect(result).toHaveLength(1);
      expect(result[0].isLocal).toBe(true);
      expect(result[0].isSynced).toBe(true);
    });

    it('should sort snapshots by creation time, newest first', async () => {
      const older: SnapshotInfo = {
        ...mockSnapshotInfo,
        createdAt: '2025-01-01T00:00:00.000Z',
      };
      const newer: DocumentSnapshot = {
        ...mockServerSnapshot,
        createdAt: '2025-01-15T00:00:00.000Z',
      };
      offlineSnapshots.listSnapshotsForDocument.mockResolvedValue([older]);
      snapshotsApi.listProjectSnapshots.mockReturnValue(of([newer]));

      const result = await service.listSnapshots('doc-123');

      expect(result[0].createdAt).toBe('2025-01-15T00:00:00.000Z');
      expect(result[1].createdAt).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('isWorldbuildingType (via createSnapshot)', () => {
    it.each([
      [ElementType.Worldbuilding, true],
      [ElementType.Item, false],
      [ElementType.Folder, false],
    ] as const)(
      'should identify %s as worldbuilding: %s',
      async (type, expected) => {
        const element = createElement('elem-123', 'Test Element', type);
        elementsSignal.set([element]);

        const ydoc = new Y.Doc();
        documentService.getYDoc.mockResolvedValue(ydoc);

        if (expected) {
          const wbYdoc = new Y.Doc();
          worldbuildingService.getYDoc.mockReturnValue(wbYdoc);
        }

        offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

        await service.createSnapshot('elem-123', 'Test');

        if (expected) {
          expect(worldbuildingService.getYDoc).toHaveBeenCalled();
        } else {
          expect(worldbuildingService.getYDoc).not.toHaveBeenCalled();
        }
      }
    );
  });

  describe('calculateWordCount (via createSnapshot)', () => {
    it('should calculate word count from document content', async () => {
      const ydoc = new Y.Doc();
      const prosemirror = ydoc.getXmlFragment('prosemirror');
      ydoc.transact(() => {
        const para = new Y.XmlElement('paragraph');
        para.insert(0, [new Y.XmlText('Hello world this is a test')]);
        prosemirror.insert(0, [para]);
      });

      documentService.getYDoc.mockResolvedValue(ydoc);
      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      await service.createSnapshot('doc-123', 'Test');

      expect(offlineSnapshots.createSnapshot).toHaveBeenCalledWith(
        'testuser/test-project',
        'doc-123',
        expect.objectContaining({
          wordCount: 6,
        })
      );
    });

    it('should return 0 for empty document', async () => {
      const ydoc = new Y.Doc();
      documentService.getYDoc.mockResolvedValue(ydoc);
      offlineSnapshots.createSnapshot.mockResolvedValue(mockStoredSnapshot);

      await service.createSnapshot('doc-123', 'Test');

      expect(offlineSnapshots.createSnapshot).toHaveBeenCalledWith(
        'testuser/test-project',
        'doc-123',
        expect.objectContaining({
          wordCount: 0,
        })
      );
    });
  });
});
