import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import {
  CreateSnapshotRequest,
  DocumentSnapshot,
  SnapshotsService,
  SnapshotWithContent,
} from '../../api-client';
import { Project } from '../../api-client/model/project';
import { DocumentSnapshotService } from './document-snapshot.service';
import { ProjectStateService } from './project-state.service';

describe('DocumentSnapshotService', () => {
  let service: DocumentSnapshotService;
  let snapshotsApi: MockedObject<SnapshotsService>;
  let projectState: MockedObject<ProjectStateService>;
  let projectSignal: ReturnType<typeof signal<Project | null>>;

  const mockProject: Project = {
    id: '1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: '',
    createdDate: '2024-01-01',
    updatedDate: '2024-01-01',
  };

  const mockSnapshot: DocumentSnapshot = {
    id: 'snapshot-1',
    documentId: 'doc-1',
    name: 'Test Snapshot',
    description: 'A test snapshot',
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockSnapshotWithContent: SnapshotWithContent = {
    ...mockSnapshot,
    yDocState: 'base64-encoded-state',
  };

  beforeEach(() => {
    projectSignal = signal<Project | null>(mockProject);

    snapshotsApi = {
      createProjectSnapshot: vi.fn().mockReturnValue(of(mockSnapshot)),
      listProjectSnapshots: vi.fn().mockReturnValue(of([mockSnapshot])),
      getProjectSnapshot: vi.fn().mockReturnValue(of(mockSnapshot)),
      restoreProjectSnapshot: vi
        .fn()
        .mockReturnValue(of({ message: 'Restored' })),
      deleteProjectSnapshot: vi
        .fn()
        .mockReturnValue(of({ message: 'Deleted' })),
      previewProjectSnapshot: vi
        .fn()
        .mockReturnValue(of(mockSnapshotWithContent)),
    } as unknown as MockedObject<SnapshotsService>;

    projectState = {
      project: projectSignal,
    } as unknown as MockedObject<ProjectStateService>;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentSnapshotService,
        { provide: SnapshotsService, useValue: snapshotsApi },
        { provide: ProjectStateService, useValue: projectState },
      ],
    });

    service = TestBed.inject(DocumentSnapshotService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createSnapshot', () => {
    it('should create a snapshot', () => {
      const request: CreateSnapshotRequest = {
        documentId: 'doc-1',
        name: 'New Snapshot',
        description: 'New description',
        yDocState: 'state-data',
      };

      let result: DocumentSnapshot | undefined;
      service.createSnapshot('doc-1', request).subscribe(snapshot => {
        result = snapshot;
      });

      expect(result).toEqual(mockSnapshot);
      expect(snapshotsApi.createProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        request
      );
    });

    it('should throw error when no active project', () => {
      projectSignal.set(null);
      const request: CreateSnapshotRequest = {
        documentId: 'doc-1',
        name: 'Test',
        yDocState: 'state',
      };

      expect(() => service.createSnapshot('doc-1', request)).toThrow(
        'No active project'
      );
    });
  });

  describe('listSnapshots', () => {
    it('should list snapshots', () => {
      let result: DocumentSnapshot[] | undefined;
      service.listSnapshots('doc-1').subscribe(snapshots => {
        result = snapshots;
      });

      expect(result).toEqual([mockSnapshot]);
      expect(snapshotsApi.listProjectSnapshots).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });

    it('should throw error when no active project', () => {
      projectSignal.set(null);
      expect(() => service.listSnapshots('doc-1')).toThrow('No active project');
    });
  });

  describe('getSnapshot', () => {
    it('should get a snapshot', () => {
      let result: DocumentSnapshot | undefined;
      service.getSnapshot('doc-1', 'snapshot-1').subscribe(snapshot => {
        result = snapshot;
      });

      expect(result).toEqual(mockSnapshot);
      expect(snapshotsApi.getProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'snapshot-1'
      );
    });

    it('should throw error when no active project', () => {
      projectSignal.set(null);
      expect(() => service.getSnapshot('doc-1', 'snapshot-1')).toThrow(
        'No active project'
      );
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore a snapshot', () => {
      let result: { message: string } | undefined;
      service.restoreSnapshot('doc-1', 'snapshot-1').subscribe(response => {
        result = response;
      });

      expect(result).toEqual({ message: 'Restored' });
      expect(snapshotsApi.restoreProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'snapshot-1'
      );
    });

    it('should throw error when no active project', () => {
      projectSignal.set(null);
      expect(() => service.restoreSnapshot('doc-1', 'snapshot-1')).toThrow(
        'No active project'
      );
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete a snapshot', () => {
      let result: { message: string } | undefined;
      service.deleteSnapshot('doc-1', 'snapshot-1').subscribe(response => {
        result = response;
      });

      expect(result).toEqual({ message: 'Deleted' });
      expect(snapshotsApi.deleteProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'snapshot-1'
      );
    });

    it('should throw error when no active project', () => {
      projectSignal.set(null);
      expect(() => service.deleteSnapshot('doc-1', 'snapshot-1')).toThrow(
        'No active project'
      );
    });
  });

  describe('previewSnapshot', () => {
    it('should preview a snapshot', () => {
      let result: SnapshotWithContent | undefined;
      service.previewSnapshot('doc-1', 'snapshot-1').subscribe(snapshot => {
        result = snapshot;
      });

      expect(result).toEqual(mockSnapshotWithContent);
      expect(snapshotsApi.previewProjectSnapshot).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'snapshot-1'
      );
    });

    it('should throw error when no active project', () => {
      projectSignal.set(null);
      expect(() => service.previewSnapshot('doc-1', 'snapshot-1')).toThrow(
        'No active project'
      );
    });
  });
});
