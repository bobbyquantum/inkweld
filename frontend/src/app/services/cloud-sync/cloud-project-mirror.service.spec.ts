import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementType, type Project } from '@inkweld/index';
import { LoggerService } from '@services/core/logger.service';
import { LocalProjectService } from '@services/local/local-project.service';
import {
  LocalSnapshotService,
  type StoredSnapshot,
} from '@services/local/local-snapshot.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  CLOUD_SYNC_ORIGIN,
  CloudProjectMirrorService,
} from './cloud-project-mirror.service';
import {
  documentDocId,
  documentPath,
  elementsPath,
  mediaIndexPath,
  mediaPath,
  projectJsonPath,
  snapshotPath,
} from './cloud-sync-layout';
import {
  type CloudFileRecord,
  CloudSyncStateService,
} from './cloud-sync-state.service';
import { InMemoryRemoteStore } from './testing/in-memory-remote-store';
import { type AcquiredDoc, YDocAccessService } from './ydoc-access.service';

/** In-memory Yjs docs standing in for IndexedDB-backed ones */
class FakeDocs {
  readonly docs = new Map<string, Y.Doc>();
  readonly released: string[] = [];

  doc(id: string): Y.Doc {
    let doc = this.docs.get(id);
    if (!doc) {
      doc = new Y.Doc();
      this.docs.set(id, doc);
    }
    return doc;
  }

  acquire(id: string): Promise<AcquiredDoc> {
    const doc = this.doc(id);
    return Promise.resolve({
      doc,
      live: false,
      flush: () => Promise.resolve(),
      release: () => {
        this.released.push(id);
        return Promise.resolve();
      },
    });
  }
}

describe('CloudProjectMirrorService', () => {
  let service: CloudProjectMirrorService;
  let store: InMemoryRemoteStore;
  let docs: FakeDocs;
  let records: Map<string, CloudFileRecord>;
  let mediaBlobs: Map<string, { blob: Blob; filename?: string }>;
  let projects: Project[];
  let mediaSyncVersion: ReturnType<typeof signal<number>>;
  let snapshotStore: Map<string, StoredSnapshot>;
  let localProjects: {
    getProject: ReturnType<typeof vi.fn>;
    importProjects: ReturnType<typeof vi.fn>;
  };

  const username = 'bobby';
  const slug = 'novel';
  const elementsId = `local:${username}:${slug}:elements`;

  function makeProject(overrides: Partial<Project> = {}): Project {
    return {
      id: 'p1',
      slug,
      username,
      title: 'My Novel',
      description: 'A story',
      coverImage: null,
      createdDate: '2026-01-01T00:00:00.000Z',
      updatedDate: '2026-01-02T00:00:00.000Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    store = new InMemoryRemoteStore();
    docs = new FakeDocs();
    records = new Map();
    mediaBlobs = new Map();
    projects = [makeProject()];
    mediaSyncVersion = signal(0);
    snapshotStore = new Map();

    localProjects = {
      getProject: vi.fn(
        (u: string, s: string) =>
          projects.find(p => p.username === u && p.slug === s) ?? null
      ),
      importProjects: vi.fn((imported: Project[]) => {
        for (const p of imported) {
          const idx = projects.findIndex(
            x => x.username === p.username && x.slug === p.slug
          );
          if (idx >= 0) projects[idx] = p;
          else projects.push(p);
        }
      }),
    };

    const stateMock = {
      get: vi.fn((path: string) => Promise.resolve(records.get(path) ?? null)),
      set: vi.fn((rec: CloudFileRecord) => {
        records.set(rec.path, rec);
        return Promise.resolve();
      }),
      delete: vi.fn(),
      deleteByPrefix: vi.fn((prefix: string) => {
        for (const k of [...records.keys()]) {
          if (k.startsWith(prefix)) records.delete(k);
        }
        return Promise.resolve();
      }),
      listByPrefix: vi.fn(),
    };

    const docAccessMock = {
      elementsDocId: () => elementsId,
      exists: vi.fn((docId: string) => Promise.resolve(docs.docs.has(docId))),
      acquireElements: vi.fn(() => docs.acquire(elementsId)),
      acquireDocument: vi.fn((docId: string) => docs.acquire(docId)),
      acquireWorldbuilding: vi.fn(
        (_u: string, _s: string, _e: string, docId: string) =>
          docs.acquire(docId)
      ),
    };

    const mediaMock = {
      listMedia: vi.fn((projectKey: string) =>
        Promise.resolve(
          [...mediaBlobs.entries()]
            .filter(([k]) => k.startsWith(`${projectKey}:`))
            .map(([k, v]) => ({
              mediaId: k.slice(projectKey.length + 1),
              mimeType: v.blob.type || 'application/octet-stream',
              size: v.blob.size,
              createdAt: '2026-01-01T00:00:00.000Z',
              filename: v.filename,
            }))
        )
      ),
      getMedia: vi.fn((projectKey: string, id: string) =>
        Promise.resolve(mediaBlobs.get(`${projectKey}:${id}`)?.blob ?? null)
      ),
      hasMedia: vi.fn((projectKey: string, id: string) =>
        Promise.resolve(mediaBlobs.has(`${projectKey}:${id}`))
      ),
      saveMedia: vi.fn(
        (projectKey: string, id: string, blob: Blob, filename?: string) => {
          mediaBlobs.set(`${projectKey}:${id}`, { blob, filename });
          return Promise.resolve();
        }
      ),
    };

    const snapshotsMock = {
      getSnapshotsForExport: vi.fn((projectKey: string) =>
        Promise.resolve(
          [...snapshotStore.values()].filter(s => s.projectKey === projectKey)
        )
      ),
      importSnapshot: vi.fn(
        (
          projectKey: string,
          snap: {
            documentId: string;
            name: string;
            xmlContent?: string;
            createdAt: string;
          },
          options: { snapshotId?: string } = {}
        ) => {
          const snapshotId = options.snapshotId ?? crypto.randomUUID();
          const stored = {
            id: `${projectKey}:${snap.documentId}:${snapshotId}`,
            projectKey,
            documentId: snap.documentId,
            name: snap.name,
            xmlContent: snap.xmlContent ?? '',
            createdAt: snap.createdAt,
            synced: false,
          } as StoredSnapshot;
          snapshotStore.set(stored.id, stored);
          return Promise.resolve(stored);
        }
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CloudProjectMirrorService,
        { provide: LocalSnapshotService, useValue: snapshotsMock },
        { provide: CloudSyncStateService, useValue: stateMock },
        { provide: YDocAccessService, useValue: docAccessMock },
        { provide: LocalProjectService, useValue: localProjects },
        { provide: LocalStorageService, useValue: mediaMock },
        { provide: MediaSyncService, useValue: { mediaSyncVersion } },
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
    service = TestBed.inject(CloudProjectMirrorService);
  });

  function seedElements(items: { id: string; type: ElementType }[]): void {
    const doc = docs.doc(elementsId);
    doc.transact(() => {
      const arr = doc.getArray('elements');
      for (const item of items) {
        arr.push([{ id: item.id, type: item.type, name: item.id }]);
      }
      doc.getMap<string>('projectMeta').set('coverMediaId', 'cover-1');
    });
  }

  it('pushes a fresh project: elements, documents, media, project.json', async () => {
    seedElements([
      { id: 'e1', type: ElementType.Item },
      { id: 'f1', type: ElementType.Folder },
    ]);
    const d1 = docs.doc(documentDocId(username, slug, 'e1'));
    d1.getXmlFragment('prosemirror').insert(0, [new Y.XmlText('Hello')]);
    mediaBlobs.set(`${username}/${slug}:img1`, {
      blob: new Blob(['png'], { type: 'image/png' }),
      filename: 'img1.png',
    });

    const summary = await service.syncProject(store, username, slug);

    expect(store.files.has(elementsPath(username, slug))).toBe(true);
    expect(store.files.has(documentPath(username, slug, 'e1'))).toBe(true);
    expect(store.files.has(documentPath(username, slug, 'f1'))).toBe(false);
    expect(store.files.has(mediaPath(username, slug, 'img1'))).toBe(true);
    const index = JSON.parse(store.text(mediaIndexPath(username, slug))!);
    expect(index.items.img1).toMatchObject({
      mimeType: 'image/png',
      filename: 'img1.png',
    });
    const projectJson = JSON.parse(
      store.text(projectJsonPath(username, slug))!
    );
    expect(projectJson.title).toBe('My Novel');
    expect(summary.coverMediaId).toBe('cover-1');
    expect(summary.title).toBe('My Novel');
    expect(summary.pushed).toBe(4);
    expect(summary.pulled).toBe(0);
    // every acquired doc was released
    expect(docs.released).toEqual(
      expect.arrayContaining([elementsId, documentDocId(username, slug, 'e1')])
    );
  });

  it('is idempotent: a second pass with no changes pushes nothing', async () => {
    seedElements([{ id: 'e1', type: ElementType.Item }]);
    docs
      .doc(documentDocId(username, slug, 'e1'))
      .getXmlFragment('prosemirror')
      .insert(0, [new Y.XmlText('Hello')]);
    await service.syncProject(store, username, slug);
    store.log.length = 0;

    const summary = await service.syncProject(store, username, slug);

    expect(summary.pushed).toBe(0);
    expect(summary.pulled).toBe(0);
    expect(store.log.filter(l => l.startsWith('put'))).toEqual([]);
  });

  it('does not create a local database for a document that exists nowhere', async () => {
    seedElements([{ id: 'ghost', type: ElementType.Item }]);

    await service.syncProject(store, username, slug);

    expect(docs.docs.has(documentDocId(username, slug, 'ghost'))).toBe(false);
    expect(store.files.has(documentPath(username, slug, 'ghost'))).toBe(false);
  });

  it('merges a remote elements doc from another device and pushes the union', async () => {
    // Device A state already in the cloud
    const remoteDoc = new Y.Doc();
    remoteDoc.getArray('elements').push([{ id: 'remote-1', type: 'ITEM' }]);
    store.seed(elementsPath(username, slug), Y.encodeStateAsUpdate(remoteDoc));
    // Device B (us) has its own element
    seedElements([{ id: 'local-1', type: ElementType.Folder }]);

    const summary = await service.syncProject(store, username, slug);

    const local = docs
      .doc(elementsId)
      .getArray<{ id: string }>('elements')
      .toArray();
    expect(local.map(e => e.id).sort()).toEqual(['local-1', 'remote-1']);
    expect(summary.pulled).toBeGreaterThanOrEqual(1);
    // The union went back up so device A converges
    const pushed = new Y.Doc();
    Y.applyUpdate(
      pushed,
      store.files.get(elementsPath(username, slug))!.content
    );
    expect(
      pushed
        .getArray<{ id: string }>('elements')
        .toArray()
        .map(e => e.id)
        .sort()
    ).toEqual(['local-1', 'remote-1']);
  });

  it('applies remote updates with the cloud-sync origin', async () => {
    const remoteDoc = new Y.Doc();
    remoteDoc.getArray('elements').push([{ id: 'r', type: 'ITEM' }]);
    store.seed(elementsPath(username, slug), Y.encodeStateAsUpdate(remoteDoc));
    const origins: unknown[] = [];
    docs.doc(elementsId).on('update', (_u, origin) => origins.push(origin));

    await service.syncProject(store, username, slug);

    expect(origins).toContain(CLOUD_SYNC_ORIGIN);
  });

  it('pulls a document created on another device and downloads its media', async () => {
    const remoteElements = new Y.Doc();
    remoteElements.getArray('elements').push([{ id: 'e9', type: 'ITEM' }]);
    store.seed(
      elementsPath(username, slug),
      Y.encodeStateAsUpdate(remoteElements)
    );
    const remoteDoc = new Y.Doc();
    remoteDoc
      .getXmlFragment('prosemirror')
      .insert(0, [new Y.XmlText('From A')]);
    store.seed(
      documentPath(username, slug, 'e9'),
      Y.encodeStateAsUpdate(remoteDoc)
    );
    store.seed(mediaPath(username, slug, 'm9'), new Uint8Array([1, 2, 3]));
    store.seed(
      mediaIndexPath(username, slug),
      JSON.stringify({
        version: 1,
        items: {
          m9: {
            mimeType: 'image/jpeg',
            size: 3,
            filename: 'm9.jpg',
            createdAt: 'x',
          },
        },
      })
    );

    await service.syncProject(store, username, slug);

    const pulled = docs.doc(documentDocId(username, slug, 'e9'));
    expect(pulled.getXmlFragment('prosemirror').toJSON()).toContain('From A');
    const saved = mediaBlobs.get(`${username}/${slug}:m9`);
    expect(saved?.blob.type).toBe('image/jpeg');
    expect(saved?.filename).toBe('m9.jpg');
    expect(mediaSyncVersion()).toBe(1);
  });

  it('adopts newer remote project metadata and pushes newer local metadata', async () => {
    store.seed(
      projectJsonPath(username, slug),
      JSON.stringify({
        version: 1,
        id: 'p1',
        slug,
        title: 'Renamed Elsewhere',
        description: 'A story',
        createdDate: '2026-01-01T00:00:00.000Z',
        updatedDate: '2026-02-01T00:00:00.000Z',
      })
    );

    let summary = await service.syncProject(store, username, slug);
    expect(localProjects.importProjects).toHaveBeenCalledTimes(1);
    expect(summary.title).toBe('Renamed Elsewhere');

    // Now the local copy moves ahead
    projects[0] = makeProject({
      title: 'Local Wins',
      updatedDate: '2026-03-01T00:00:00.000Z',
    });
    summary = await service.syncProject(store, username, slug);
    const remote = JSON.parse(store.text(projectJsonPath(username, slug))!);
    expect(remote.title).toBe('Local Wins');
    expect(summary.title).toBe('Local Wins');
  });

  it('pullCover stores only the cover blob and bumps the media version', async () => {
    store.seed(mediaPath(username, slug, 'cover-1'), new Uint8Array([9]));
    store.seed(
      mediaIndexPath(username, slug),
      JSON.stringify({
        version: 1,
        items: {
          'cover-1': { mimeType: 'image/webp', size: 1, createdAt: 'x' },
        },
      })
    );

    expect(await service.pullCover(store, username, slug, 'cover-1')).toBe(
      true
    );
    expect(mediaBlobs.get(`${username}/${slug}:cover-1`)?.blob.type).toBe(
      'image/webp'
    );
    expect(mediaSyncVersion()).toBe(1);
    // Already present: no-op
    expect(await service.pullCover(store, username, slug, 'cover-1')).toBe(
      false
    );
    // Missing remotely: false, not an error
    expect(await service.pullCover(store, username, slug, 'nope')).toBe(false);
  });

  it('deleteRemoteProject removes the folder and forgets local records', async () => {
    seedElements([{ id: 'e1', type: ElementType.Item }]);
    await service.syncProject(store, username, slug);
    expect(records.size).toBeGreaterThan(0);

    await service.deleteRemoteProject(store, username, slug);

    expect(store.files.size).toBe(0);
    expect(records.size).toBe(0);
  });
  describe('snapshots', () => {
    const projectKey = `${username}/${slug}`;

    function seedLocalSnapshot(snapshotId: string, documentId = 'e1'): void {
      snapshotStore.set(`${projectKey}:${documentId}:${snapshotId}`, {
        id: `${projectKey}:${documentId}:${snapshotId}`,
        projectKey,
        documentId,
        name: `Snap ${snapshotId}`,
        xmlContent: '<doc><p>v1</p></doc>',
        wordCount: 1,
        createdAt: '2026-02-01T00:00:00.000Z',
        synced: false,
      });
    }

    it('pushes local snapshots as immutable files', async () => {
      seedLocalSnapshot('s1');

      await service.syncProject(store, username, slug);

      const text = store.text(snapshotPath(username, slug, 'e1', 's1'));
      expect(text).toBeDefined();
      const remote = JSON.parse(text!);
      expect(remote).toMatchObject({
        version: 1,
        snapshotId: 's1',
        documentId: 'e1',
        name: 'Snap s1',
        xmlContent: '<doc><p>v1</p></doc>',
      });
      // synced/serverId bookkeeping must not leak into the cloud copy
      expect(remote.synced).toBeUndefined();
    });

    it('pulls remote snapshots under their original id and is idempotent', async () => {
      store.seed(
        snapshotPath(username, slug, 'e2', 'remote-1'),
        JSON.stringify({
          version: 1,
          snapshotId: 'remote-1',
          documentId: 'e2',
          name: 'From device A',
          xmlContent: '<doc><p>A</p></doc>',
          createdAt: '2026-01-15T00:00:00.000Z',
        })
      );

      const first = await service.syncProject(store, username, slug);
      expect(first.pulled).toBeGreaterThanOrEqual(1);
      expect(snapshotStore.has(`${projectKey}:e2:remote-1`)).toBe(true);
      expect(snapshotStore.get(`${projectKey}:e2:remote-1`)?.name).toBe(
        'From device A'
      );

      store.log.length = 0;
      const second = await service.syncProject(store, username, slug);
      expect(second.pulled).toBe(0);
      expect(second.pushed).toBe(0);
      expect(store.log.filter(l => l.startsWith('put'))).toEqual([]);
    });

    it('skips unreadable remote snapshot files', async () => {
      store.seed(snapshotPath(username, slug, 'e2', 'bad'), '{"version":2}');

      const summary = await service.syncProject(store, username, slug);

      expect(summary.pulled).toBe(0);
      expect(snapshotStore.size).toBe(0);
    });
  });
});
