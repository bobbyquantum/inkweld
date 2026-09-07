import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Project } from '@inkweld/index';
import {
  CLOUD_MANIFEST_PATH,
  type CloudManifest,
  createCloudManifest,
  parseCloudManifest,
} from '@models/cloud-manifest';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { LocalProjectService } from '@services/local/local-project.service';
import { LocalProjectElementsService } from '@services/local/local-project-elements.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { ProjectSyncService } from '@services/local/project-sync.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { Subject } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import * as Y from 'yjs';

import {
  CloudProjectMirrorService,
  type ProjectSyncSummary,
} from './cloud-project-mirror.service';
import { CloudSyncConnectService } from './cloud-sync-connect.service';
import { CloudSyncEngineService } from './cloud-sync-engine.service';
import { CloudSyncStateService } from './cloud-sync-state.service';
import { RemoteAuthError, type RemoteFileInfo } from './remote-store.interface';
import { InMemoryRemoteStore } from './testing/in-memory-remote-store';

describe('CloudSyncEngineService', () => {
  let engine: CloudSyncEngineService;
  let store: InMemoryRemoteStore;
  let mode: 'local' | 'cloud' | 'server';
  let hasCredentials: boolean;
  let projects: ReturnType<typeof signal<Project[]>>;
  let currentProject: ReturnType<typeof signal<Project | undefined>>;
  let activated: Set<string>;
  let tombstones: { projectKey: string; deletedAt: string }[];
  let localEdit$: Subject<string>;
  let wbEdit$: Subject<string>;
  let elementsDoc: Y.Doc;

  let mirror: {
    syncProject: Mock<
      (
        store: unknown,
        username: string,
        slug: string,
        files?: unknown
      ) => Promise<ProjectSyncSummary>
    >;
    indexFiles: (list: RemoteFileInfo[]) => Map<string, RemoteFileInfo>;
    pullCover: ReturnType<typeof vi.fn>;
    deleteRemoteProject: ReturnType<typeof vi.fn>;
  };
  let connect: {
    hasCredentials: ReturnType<typeof vi.fn>;
    createStore: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let localProjects: {
    projects: ReturnType<typeof signal<Project[]>>;
    importProjects: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
  };
  let media: { deleteProjectMedia: ReturnType<typeof vi.fn> };
  let activation: {
    isActivated: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let projectSync: {
    getAllTombstones: ReturnType<typeof vi.fn>;
    removeTombstone: ReturnType<typeof vi.fn>;
  };
  let state: { deleteByPrefix: ReturnType<typeof vi.fn> };

  const config = {
    id: 'cloud-dropbox-abc',
    type: 'cloud' as const,
    cloudProvider: 'dropbox' as const,
    cloudAccountId: 'dbid:abc',
    userProfile: { name: 'Bobby', username: 'bobby' },
    addedAt: '',
    lastUsedAt: '',
  };

  function project(slug: string, overrides: Partial<Project> = {}): Project {
    return {
      id: `p-${slug}`,
      slug,
      username: 'bobby',
      title: `Title ${slug}`,
      description: null,
      coverImage: null,
      createdDate: '2026-01-01T00:00:00.000Z',
      updatedDate: '2026-01-02T00:00:00.000Z',
      ...overrides,
    };
  }

  function summaryFor(key: string): ProjectSyncSummary {
    return {
      projectKey: key,
      pushed: 1,
      pulled: 0,
      title: `Title ${key.split('/')[1]}`,
      coverMediaId: 'cover-1',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
  }

  function remoteManifest(): CloudManifest | null {
    const text = store.text(CLOUD_MANIFEST_PATH);
    return text ? parseCloudManifest(text) : null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRemoteStore();
    mode = 'cloud';
    hasCredentials = true;
    projects = signal<Project[]>([project('novel')]);
    currentProject = signal<Project | undefined>(undefined);
    activated = new Set(['bobby/novel']);
    tombstones = [];
    localEdit$ = new Subject<string>();
    wbEdit$ = new Subject<string>();
    elementsDoc = new Y.Doc();

    mirror = {
      syncProject: vi.fn((_s, username: string, slug: string) =>
        Promise.resolve(summaryFor(`${username}/${slug}`))
      ),
      indexFiles: list => new Map(list.map(f => [f.path, f])),
      pullCover: vi.fn().mockResolvedValue(true),
      deleteRemoteProject: vi.fn().mockResolvedValue(undefined),
    };
    connect = {
      hasCredentials: vi.fn(() => hasCredentials),
      createStore: vi.fn(() => store),
      disconnect: vi.fn(),
    };
    localProjects = {
      projects,
      importProjects: vi.fn((imported: Project[]) =>
        projects.update(list => [...list, ...imported])
      ),
      deleteProject: vi.fn((_u: string, slug: string) =>
        projects.update(list => list.filter(p => p.slug !== slug))
      ),
    };
    media = { deleteProjectMedia: vi.fn().mockResolvedValue(undefined) };
    activation = {
      isActivated: vi.fn((key: string) => activated.has(key)),
      deactivate: vi.fn().mockResolvedValue(undefined),
    };
    projectSync = {
      getAllTombstones: vi.fn(() => Promise.resolve(tombstones)),
      removeTombstone: vi.fn().mockResolvedValue(undefined),
    };
    state = { deleteByPrefix: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CloudSyncEngineService,
        { provide: SetupService, useValue: { getMode: () => mode } },
        {
          provide: StorageContextService,
          useValue: {
            getActiveConfig: () => config,
            getPrefix: () => 'cloud-dropbox-abc:',
          },
        },
        { provide: CloudSyncConnectService, useValue: connect },
        { provide: CloudProjectMirrorService, useValue: mirror },
        { provide: CloudSyncStateService, useValue: state },
        { provide: LocalProjectService, useValue: localProjects },
        {
          provide: LocalProjectElementsService,
          useValue: { getYjsDocument: vi.fn().mockResolvedValue(elementsDoc) },
        },
        { provide: LocalStorageService, useValue: media },
        { provide: ProjectActivationService, useValue: activation },
        { provide: ProjectSyncService, useValue: projectSync },
        { provide: ProjectStateService, useValue: { project: currentProject } },
        { provide: DocumentService, useValue: { localEdit$ } },
        { provide: WorldbuildingService, useValue: { localEdit$: wbEdit$ } },
        {
          provide: LoggerService,
          useValue: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
          },
        },
      ],
    });
    engine = TestBed.inject(CloudSyncEngineService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays disabled outside cloud mode', () => {
    mode = 'local';
    engine.initialize();
    expect(engine.status()).toBe('disabled');
    expect(engine.isActive()).toBe(false);
    expect(connect.createStore).not.toHaveBeenCalled();
  });

  it('reports disconnected when cloud mode has no credentials', () => {
    hasCredentials = false;
    engine.initialize();
    expect(engine.status()).toBe('disconnected');
    expect(connect.createStore).not.toHaveBeenCalled();
  });

  it('can defer the startup pass to the caller', async () => {
    engine.initialize({ runStartupPass: false });
    await vi.advanceTimersByTimeAsync(0);

    expect(engine.status()).toBe('idle');
    expect(mirror.syncProject).not.toHaveBeenCalled();

    await engine.syncNow();
    expect(mirror.syncProject).toHaveBeenCalledTimes(1);
  });

  it('runs a startup pass: mirrors activated projects and writes the manifest', async () => {
    engine.initialize();
    await engine.syncNow();

    expect(connect.createStore).toHaveBeenCalledWith(
      'dropbox',
      'cloud-dropbox-abc'
    );
    expect(mirror.syncProject).toHaveBeenCalledWith(
      store,
      'bobby',
      'novel',
      expect.any(Map)
    );
    const manifest = remoteManifest();
    expect(manifest).not.toBeNull();
    expect(manifest!.profile).toEqual({ name: 'Bobby', username: 'bobby' });
    expect(manifest!.projects).toHaveLength(1);
    expect(manifest!.projects[0]).toMatchObject({
      key: 'bobby/novel',
      title: 'Title novel',
      coverMediaId: 'cover-1',
    });
    expect(engine.status()).toBe('synced');
    expect(engine.lastSyncAt()).not.toBeNull();
    expect(engine.lastError()).toBeNull();
  });

  it('skips projects that are not activated on this device', async () => {
    projects.set([project('novel'), project('dormant')]);
    engine.initialize();
    await engine.syncNow();

    const synced = new Set(mirror.syncProject.mock.calls.map(c => c[2]));
    expect([...synced]).toEqual(['novel']);
  });

  it('adopts projects listed in a remote manifest and fetches their covers', async () => {
    const manifest = createCloudManifest(
      { provider: 'dropbox', accountId: 'dbid:abc' },
      { name: 'Bobby', username: 'bobby' }
    );
    manifest.projects.push({
      key: 'bobby/from-phone',
      slug: 'from-phone',
      title: 'Written on the phone',
      description: 'notes',
      coverMediaId: 'cover-9',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    });
    store.seed(CLOUD_MANIFEST_PATH, JSON.stringify(manifest));

    engine.initialize();
    await engine.syncNow();

    expect(localProjects.importProjects).toHaveBeenCalledTimes(1);
    const imported = localProjects.importProjects.mock
      .calls[0][0][0] as Project;
    expect(imported).toMatchObject({
      slug: 'from-phone',
      username: 'bobby',
      title: 'Written on the phone',
      description: 'notes',
      coverImage: 'cover-9',
    });
    expect(mirror.pullCover).toHaveBeenCalledWith(
      store,
      'bobby',
      'from-phone',
      'cover-9'
    );
    // Not activated here, so its content is not mirrored yet
    expect([...new Set(mirror.syncProject.mock.calls.map(c => c[2]))]).toEqual([
      'novel',
    ]);
    // The merged manifest keeps both entries
    expect(
      remoteManifest()!
        .projects.map(p => p.key)
        .sort()
    ).toEqual(['bobby/from-phone', 'bobby/novel']);
  });

  it('propagates local deletions as tombstones and removes the remote folder', async () => {
    tombstones = [
      { projectKey: 'bobby/old', deletedAt: '2026-03-01T00:00:00.000Z' },
    ];

    engine.initialize();
    await engine.syncNow();

    expect(mirror.deleteRemoteProject).toHaveBeenCalledWith(
      store,
      'bobby',
      'old'
    );
    expect(projectSync.removeTombstone).toHaveBeenCalledWith('bobby/old');
    const entry = remoteManifest()!.projects.find(p => p.key === 'bobby/old');
    expect(entry?.deletedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('applies a remote tombstone that is newer than the local project', async () => {
    projects.set([
      project('novel'),
      project('gone', { updatedDate: '2026-01-05T00:00:00.000Z' }),
    ]);
    const manifest = createCloudManifest(
      { provider: 'dropbox', accountId: 'dbid:abc' },
      { name: 'Bobby', username: 'bobby' }
    );
    manifest.projects.push({
      key: 'bobby/gone',
      slug: 'gone',
      title: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
      deletedAt: '2026-01-10T00:00:00.000Z',
    });
    store.seed(CLOUD_MANIFEST_PATH, JSON.stringify(manifest));

    engine.initialize();
    await engine.syncNow();

    expect(localProjects.deleteProject).toHaveBeenCalledWith('bobby', 'gone', {
      createTombstone: false,
    });
    expect(media.deleteProjectMedia).toHaveBeenCalledWith('bobby/gone');
    expect(activation.deactivate).toHaveBeenCalledWith('bobby/gone');
    expect(state.deleteByPrefix).toHaveBeenCalledWith('/projects/bobby/gone/');
    expect(mirror.syncProject.mock.calls.map(c => c[2])).not.toContain('gone');
  });

  it('keeps a local project edited after the remote deletion', async () => {
    projects.set([
      project('kept', { updatedDate: '2026-02-01T00:00:00.000Z' }),
    ]);
    activated = new Set(['bobby/kept']);
    const manifest = createCloudManifest(
      { provider: 'dropbox', accountId: 'dbid:abc' },
      { name: 'Bobby', username: 'bobby' }
    );
    manifest.projects.push({
      key: 'bobby/kept',
      slug: 'kept',
      title: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
      deletedAt: '2026-01-10T00:00:00.000Z',
    });
    store.seed(CLOUD_MANIFEST_PATH, JSON.stringify(manifest));

    engine.initialize();
    await engine.syncNow();

    expect(localProjects.deleteProject).not.toHaveBeenCalled();
  });

  it('debounces local edits into a single project sync', async () => {
    engine.initialize();
    await engine.syncNow();
    mirror.syncProject.mockClear();

    localEdit$.next('bobby:novel:e1');
    localEdit$.next('bobby:novel:e2');
    wbEdit$.next('bobby:novel:w1');
    expect(engine.pendingProjects().has('bobby/novel')).toBe(true);
    expect(mirror.syncProject).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4_500);

    expect(mirror.syncProject).toHaveBeenCalledTimes(1);
    expect(mirror.syncProject).toHaveBeenCalledWith(store, 'bobby', 'novel');
    expect(engine.pendingProjects().size).toBe(0);
  });

  it('follows the open project: syncs it and watches its elements doc', async () => {
    engine.initialize();
    await engine.syncNow();
    mirror.syncProject.mockClear();

    currentProject.set(project('novel'));
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(mirror.syncProject).toHaveBeenCalledWith(store, 'bobby', 'novel');

    mirror.syncProject.mockClear();
    elementsDoc.getArray('elements').push([{ id: 'new' }]);
    expect(engine.pendingProjects().has('bobby/novel')).toBe(true);
    await vi.advanceTimersByTimeAsync(4_500);
    expect(mirror.syncProject).toHaveBeenCalledTimes(1);
  });

  it('ignores elements-doc updates that came from the cloud itself', async () => {
    engine.initialize();
    await engine.syncNow();
    currentProject.set(project('novel'));
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);

    elementsDoc.transact(() => {
      elementsDoc.getArray('elements').push([{ id: 'remote' }]);
    }, 'cloud-sync');

    expect(engine.pendingProjects().has('bobby/novel')).toBe(false);
  });

  it('goes disconnected and drops credentials on an auth error', async () => {
    mirror.syncProject.mockRejectedValue(new RemoteAuthError());
    engine.initialize();
    await engine.syncNow();

    expect(engine.status()).toBe('disconnected');
    expect(connect.disconnect).toHaveBeenCalledWith('cloud-dropbox-abc');
    expect(engine.lastError()).toMatch(/authorization/i);
  });

  it('reports other failures without giving up credentials', async () => {
    mirror.syncProject.mockRejectedValue(new Error('rate limited'));
    engine.initialize();
    await engine.syncNow();

    expect(engine.status()).toBe('error');
    expect(engine.lastError()).toBe('rate limited');
    expect(connect.disconnect).not.toHaveBeenCalled();
  });

  it('does not push an unchanged manifest twice', async () => {
    engine.initialize();
    await engine.syncNow();
    const puts = () =>
      store.log.filter(l => l === `put ${CLOUD_MANIFEST_PATH}`);
    expect(puts()).toHaveLength(1);

    await engine.syncNow();
    expect(puts()).toHaveLength(1);
  });

  it('merges with a manifest written concurrently by another device', async () => {
    engine.initialize();
    await engine.syncNow();

    // Another device adds a project between our read and our write
    mirror.syncProject.mockImplementation(
      (_s, username: string, slug: string) => {
        const other = parseCloudManifest(store.text(CLOUD_MANIFEST_PATH)!)!;
        other.projects.push({
          key: 'bobby/elsewhere',
          slug: 'elsewhere',
          title: 'Elsewhere',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        });
        other.revision += 1;
        store.seed(CLOUD_MANIFEST_PATH, JSON.stringify(other));
        return Promise.resolve({
          ...summaryFor(`${username}/${slug}`),
          title: 'Renamed locally',
          updatedAt: '2026-04-02T00:00:00.000Z',
        });
      }
    );

    await engine.syncNow();

    const manifest = remoteManifest()!;
    expect(manifest.projects.map(p => p.key).sort()).toEqual([
      'bobby/elsewhere',
      'bobby/novel',
    ]);
    expect(manifest.projects.find(p => p.key === 'bobby/novel')?.title).toBe(
      'Renamed locally'
    );
    expect(engine.status()).toBe('synced');
  });

  it('reports offline instead of syncing when the browser is offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    engine.initialize();
    await engine.syncNow();

    expect(engine.status()).toBe('offline');
    expect(mirror.syncProject).not.toHaveBeenCalled();
    onLine.mockRestore();
  });
});
