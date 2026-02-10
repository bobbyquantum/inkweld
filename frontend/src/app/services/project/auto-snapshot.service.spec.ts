import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementType, Project } from '@inkweld/index';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectElement } from '../../models/project-element';
import { LoggerService } from '../core/logger.service';
import { SettingsService } from '../core/settings.service';
import {
  LocalSnapshotService,
  StoredSnapshot,
} from '../local/local-snapshot.service';
import {
  AUTO_SNAPSHOT_NAME_PREFIX,
  AutoSnapshotService,
} from './auto-snapshot.service';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';
import { UnifiedSnapshotService } from './unified-snapshot.service';

describe('AutoSnapshotService', () => {
  let service: AutoSnapshotService;
  let projectSignal: ReturnType<typeof signal<Project | undefined>>;
  let elementsSignal: ReturnType<typeof signal<ProjectElement[]>>;
  let localEdit$: Subject<string>;

  // Mock services
  let settingsService: {
    getSetting: ReturnType<typeof vi.fn>;
    setSetting: ReturnType<typeof vi.fn>;
  };
  let snapshotService: { createSnapshot: ReturnType<typeof vi.fn> };
  let localSnapshots: {
    getSnapshotsForExport: ReturnType<typeof vi.fn>;
    deleteSnapshotById: ReturnType<typeof vi.fn>;
  };
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

  beforeEach(() => {
    projectSignal = signal<Project | undefined>(mockProject as Project);
    elementsSignal = signal<ProjectElement[]>([
      createElement('doc1', 'Chapter 1', ElementType.Item),
      createElement('doc2', 'Chapter 2', ElementType.Item),
    ]);

    localEdit$ = new Subject<string>();

    settingsService = {
      getSetting: vi.fn().mockReturnValue(true),
      setSetting: vi.fn(),
    };

    snapshotService = {
      createSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1' }),
    };

    localSnapshots = {
      getSnapshotsForExport: vi.fn().mockResolvedValue([]),
      deleteSnapshotById: vi.fn().mockResolvedValue(undefined),
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
        AutoSnapshotService,
        {
          provide: ProjectStateService,
          useValue: { project: projectSignal, elements: elementsSignal },
        },
        { provide: DocumentService, useValue: { localEdit$ } },
        { provide: UnifiedSnapshotService, useValue: snapshotService },
        { provide: LocalSnapshotService, useValue: localSnapshots },
        { provide: SettingsService, useValue: settingsService },
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(AutoSnapshotService);
  });

  describe('markDirty / getDirtyCount / clearDirtyState', () => {
    it('should track dirty documents', () => {
      expect(service.getDirtyCount()).toBe(0);

      service.markDirty('doc1');
      expect(service.getDirtyCount()).toBe(1);

      service.markDirty('doc2');
      expect(service.getDirtyCount()).toBe(2);
    });

    it('should not duplicate dirty entries', () => {
      service.markDirty('doc1');
      service.markDirty('doc1');
      expect(service.getDirtyCount()).toBe(1);
    });

    it('should clear dirty state', () => {
      service.markDirty('doc1');
      service.markDirty('doc2');
      service.clearDirtyState();
      expect(service.getDirtyCount()).toBe(0);
    });
  });

  describe('localEdit$ subscription', () => {
    it('should mark documents dirty when localEdit$ emits', () => {
      localEdit$.next('testuser:test-project:doc1');
      expect(service.getDirtyCount()).toBe(1);
    });

    it('should extract element ID from full document ID', () => {
      localEdit$.next('testuser:test-project:doc1');
      localEdit$.next('testuser:test-project:doc2');
      expect(service.getDirtyCount()).toBe(2);
    });

    it('should handle plain element IDs', () => {
      localEdit$.next('doc1');
      expect(service.getDirtyCount()).toBe(1);
    });
  });

  describe('isEnabled / setEnabled', () => {
    it('should read setting from SettingsService', () => {
      settingsService.getSetting.mockReturnValue(false);
      expect(service.isEnabled()).toBe(false);
      expect(settingsService.getSetting).toHaveBeenCalledWith(
        'autoSnapshotsEnabled',
        true
      );
    });

    it('should write setting to SettingsService', () => {
      service.setEnabled(false);
      expect(settingsService.setSetting).toHaveBeenCalledWith(
        'autoSnapshotsEnabled',
        false
      );
    });
  });

  describe('createAutoSnapshots', () => {
    it('should skip when disabled', async () => {
      settingsService.getSetting.mockReturnValue(false);
      service.markDirty('doc1');

      await service.createAutoSnapshots();

      expect(snapshotService.createSnapshot).not.toHaveBeenCalled();
    });

    it('should skip when no project is loaded', async () => {
      projectSignal.set(undefined);
      service.markDirty('doc1');

      await service.createAutoSnapshots();

      expect(snapshotService.createSnapshot).not.toHaveBeenCalled();
    });

    it('should skip when no dirty documents', async () => {
      await service.createAutoSnapshots();

      expect(snapshotService.createSnapshot).not.toHaveBeenCalled();
    });

    it('should create snapshots for dirty documents', async () => {
      service.markDirty('doc1');
      service.markDirty('doc2');

      await service.createAutoSnapshots();

      expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(2);
      // Verify snapshot names include auto-save prefix and element name
      const calls = snapshotService.createSnapshot.mock.calls;
      expect(calls[0][1]).toContain(AUTO_SNAPSHOT_NAME_PREFIX);
      expect(calls[0][1]).toContain('Chapter 1');
      expect(calls[1][1]).toContain(AUTO_SNAPSHOT_NAME_PREFIX);
      expect(calls[1][1]).toContain('Chapter 2');
    });

    it('should use element ID as fallback name if element not found', async () => {
      service.markDirty('unknown-id');

      await service.createAutoSnapshots();

      expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
      const name = snapshotService.createSnapshot.mock.calls[0][1];
      expect(name).toContain('unknown-id');
    });

    it('should clear dirty state after creating snapshots', async () => {
      service.markDirty('doc1');

      await service.createAutoSnapshots();

      expect(service.getDirtyCount()).toBe(0);
    });

    it('should throttle snapshots for the same document', async () => {
      service.markDirty('doc1');
      await service.createAutoSnapshots();
      expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);

      // Immediately try again — should be throttled
      service.markDirty('doc1');
      await service.createAutoSnapshots();
      expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should continue creating snapshots for other docs if one fails', async () => {
      snapshotService.createSnapshot
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ id: 'snap-2' });

      service.markDirty('doc1');
      service.markDirty('doc2');

      await service.createAutoSnapshots();

      // Both were attempted
      expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(2);
      // Warning logged for failure
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('pruneOldAutoSnapshots', () => {
    it('should prune excess auto-snapshots per document', async () => {
      // Create 12 auto-snapshots for the same document
      const snapshots: Partial<StoredSnapshot>[] = Array.from(
        { length: 12 },
        (_, i) => ({
          id: `snap-${i}`,
          documentId: 'doc1',
          name: `${AUTO_SNAPSHOT_NAME_PREFIX} Chapter 1 — Jan ${i + 1}, 2025`,
          createdAt: new Date(2025, 0, i + 1).toISOString(),
        })
      );

      localSnapshots.getSnapshotsForExport.mockResolvedValue(snapshots);

      // Trigger pruning by creating auto-snapshots (pruning runs after)
      service.markDirty('doc1');
      await service.createAutoSnapshots();

      // Flush microtasks to let fire-and-forget pruning complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should delete the 2 oldest (12 - 10 = 2)
      expect(localSnapshots.deleteSnapshotById).toHaveBeenCalledTimes(2);
      // Oldest snapshots (snap-0, snap-1) should be deleted
      expect(localSnapshots.deleteSnapshotById).toHaveBeenCalledWith('snap-0');
      expect(localSnapshots.deleteSnapshotById).toHaveBeenCalledWith('snap-1');
    });

    it('should not prune manual snapshots', async () => {
      const snapshots: Partial<StoredSnapshot>[] = [
        {
          id: 'manual-1',
          documentId: 'doc1',
          name: 'My manual save',
          createdAt: new Date(2020, 0, 1).toISOString(),
        },
        ...Array.from({ length: 11 }, (_, i) => ({
          id: `auto-${i}`,
          documentId: 'doc1',
          name: `${AUTO_SNAPSHOT_NAME_PREFIX} Chapter 1 — Jan ${i + 1}, 2025`,
          createdAt: new Date(2025, 0, i + 1).toISOString(),
        })),
      ];

      localSnapshots.getSnapshotsForExport.mockResolvedValue(snapshots);

      service.markDirty('doc1');
      await service.createAutoSnapshots();

      // Flush microtasks to let fire-and-forget pruning complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should only delete 1 excess auto-snapshot (11 - 10)
      expect(localSnapshots.deleteSnapshotById).toHaveBeenCalledTimes(1);
      // Manual snapshot should NOT be deleted
      expect(localSnapshots.deleteSnapshotById).not.toHaveBeenCalledWith(
        'manual-1'
      );
    });
  });

  describe('isAutoSnapshot', () => {
    it('should identify auto-snapshots by name prefix', () => {
      expect(
        AutoSnapshotService.isAutoSnapshot({
          name: `${AUTO_SNAPSHOT_NAME_PREFIX} Chapter 1 — Jan 1, 2025`,
        })
      ).toBe(true);
    });

    it('should not match manual snapshots', () => {
      expect(
        AutoSnapshotService.isAutoSnapshot({ name: 'My manual save' })
      ).toBe(false);
    });
  });
});
