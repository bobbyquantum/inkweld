import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type ElementTypeSchema } from '@models/schema-types';
import {
  LocalSnapshotService,
  type SnapshotInfo,
  type StoredSnapshot,
} from '@services/local/local-snapshot.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { vi } from 'vitest';

import {
  templateSnapshotDocumentId,
  TemplateSnapshotService,
} from './template-snapshot.service';

describe('TemplateSnapshotService', () => {
  let service: TemplateSnapshotService;
  let localSnapshots: {
    createSnapshot: ReturnType<typeof vi.fn>;
    listSnapshotsForDocument: ReturnType<typeof vi.fn>;
    getSnapshot: ReturnType<typeof vi.fn>;
    deleteSnapshotById: ReturnType<typeof vi.fn>;
  };
  let worldbuilding: {
    getSchemaById: ReturnType<typeof vi.fn>;
    updateTemplate: ReturnType<typeof vi.fn>;
    saveSchemaToLibrary: ReturnType<typeof vi.fn>;
  };
  let projectState: { project: ReturnType<typeof vi.fn> };

  const buildSnapshot = (
    overrides: Partial<StoredSnapshot> = {}
  ): StoredSnapshot => ({
    id: 'k:template:char:uuid',
    projectKey: 'user/proj',
    documentId: 'template:char',
    name: 'Character',
    xmlContent: '',
    worldbuildingData: {
      schema: { id: 'char', name: 'Character', tabs: [] },
    },
    metadata: { kind: 'schema-template' },
    createdAt: new Date().toISOString(),
    synced: false,
    ...overrides,
  });

  const schema: ElementTypeSchema = {
    id: 'char',
    name: 'Character',
    icon: 'person',
    description: '',
    version: 1,
    tabs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    localSnapshots = {
      createSnapshot: vi.fn(),
      listSnapshotsForDocument: vi.fn(),
      getSnapshot: vi.fn(),
      deleteSnapshotById: vi.fn(),
    };
    worldbuilding = {
      getSchemaById: vi.fn(),
      updateTemplate: vi.fn().mockReturnValue(schema),
      saveSchemaToLibrary: vi.fn(),
    };
    projectState = {
      project: vi.fn().mockReturnValue({
        username: 'user',
        slug: 'proj',
        id: 'p1',
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TemplateSnapshotService,
        { provide: LocalSnapshotService, useValue: localSnapshots },
        { provide: WorldbuildingService, useValue: worldbuilding },
        { provide: ProjectStateService, useValue: projectState },
      ],
    });
    service = TestBed.inject(TemplateSnapshotService);
  });

  it('should create a snapshot from the current schema', async () => {
    worldbuilding.getSchemaById.mockReturnValue(schema);
    localSnapshots.createSnapshot.mockResolvedValue(buildSnapshot());

    await service.createTemplateSnapshot('char');

    expect(localSnapshots.createSnapshot).toHaveBeenCalledWith(
      'user/proj',
      'template:char',
      expect.objectContaining({
        name: 'Character',
        metadata: { kind: 'schema-template' },
      })
    );
  });

  it('should throw when the schema is missing', async () => {
    worldbuilding.getSchemaById.mockReturnValue(null);
    await expect(service.createTemplateSnapshot('nope')).rejects.toThrow(
      'Template not found'
    );
  });

  it('should list snapshots for a template', async () => {
    const info: SnapshotInfo[] = [];
    localSnapshots.listSnapshotsForDocument.mockResolvedValue(info);
    const result = await service.listTemplateSnapshots('char');
    expect(result).toBe(info);
    expect(localSnapshots.listSnapshotsForDocument).toHaveBeenCalledWith(
      'user/proj',
      'template:char'
    );
  });

  it('should delete a snapshot by id', async () => {
    await service.deleteTemplateSnapshot('id-1');
    expect(localSnapshots.deleteSnapshotById).toHaveBeenCalledWith('id-1');
  });

  it('should restore an existing template in place', async () => {
    localSnapshots.getSnapshot.mockResolvedValue(buildSnapshot());
    worldbuilding.getSchemaById.mockReturnValue({ ...schema, version: 2 });

    const restored = await service.restoreTemplateSnapshot('char', 'uuid');

    expect(worldbuilding.updateTemplate).toHaveBeenCalledWith(
      'char',
      expect.objectContaining({ version: 3 })
    );
    expect(restored?.version).toBe(3);
  });

  it('should save a restored schema that no longer exists', async () => {
    localSnapshots.getSnapshot.mockResolvedValue(buildSnapshot());
    worldbuilding.getSchemaById.mockReturnValue(null);

    const restored = await service.restoreTemplateSnapshot('char', 'uuid');

    expect(worldbuilding.saveSchemaToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'char' })
    );
    expect(restored).toBeDefined();
  });

  it('should return undefined when restoring a missing snapshot', async () => {
    localSnapshots.getSnapshot.mockResolvedValue(undefined);
    const restored = await service.restoreTemplateSnapshot('char', 'uuid');
    expect(restored).toBeUndefined();
  });

  it('should expose a namespaced document id helper', () => {
    expect(templateSnapshotDocumentId('char')).toBe('template:char');
  });

  it('should restore from a snapshot record without the schema payload', () => {
    const restored = service.restoreTemplateFromSnapshot(buildSnapshot());
    expect(restored).toBeDefined();
    const empty = service.restoreTemplateFromSnapshot({
      ...buildSnapshot(),
      worldbuildingData: {},
    });
    expect(empty).toBeUndefined();
  });
});
