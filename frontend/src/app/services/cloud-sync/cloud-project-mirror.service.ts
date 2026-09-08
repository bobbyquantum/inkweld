import { inject, Injectable } from '@angular/core';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { LoggerService } from '@services/core/logger.service';
import { LocalProjectService } from '@services/local/local-project.service';
import {
  LocalSnapshotService,
  type StoredSnapshot,
} from '@services/local/local-snapshot.service';
import {
  LocalStorageService,
  type MediaInfo,
} from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import * as Y from 'yjs';

import {
  documentDocId,
  documentPath,
  elementsPath,
  mediaIndexPath,
  mediaPath,
  type ParsedRemotePath,
  parseRemotePath,
  projectFolder,
  projectJsonPath,
  projectKeyOf,
  type RemotePathKind,
  snapshotPath,
  worldbuildingDocId,
  worldbuildingPath,
} from './cloud-sync-layout';
import { CloudSyncStateService } from './cloud-sync-state.service';
import {
  type RemoteFile,
  type RemoteFileInfo,
  RemoteFileNotFoundError,
  type RemoteStore,
} from './remote-store.interface';
import { type AcquiredDoc, YDocAccessService } from './ydoc-access.service';

/** Transaction origin for updates applied from the cloud, so change trackers can ignore them */
export const CLOUD_SYNC_ORIGIN = 'cloud-sync';

/** Remote media index: everything needed to recreate a Blob locally */
export interface RemoteMediaIndex {
  version: 1;
  items: Record<
    string,
    { mimeType: string; size: number; filename?: string; createdAt: string }
  >;
}

/** One version-history entry as stored remotely */
interface RemoteSnapshotJson {
  version: 1;
  snapshotId: string;
  documentId: string;
  name: string;
  description?: string;
  xmlContent: string;
  worldbuildingData?: Record<string, unknown>;
  wordCount?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Last segment of a local composite snapshot key "projectKey:documentId:snapshotId" */
function snapshotIdOf(compositeId: string): string {
  return compositeId.slice(compositeId.lastIndexOf(':') + 1);
}

function toRemoteSnapshot(
  snapshotId: string,
  snap: StoredSnapshot
): RemoteSnapshotJson {
  return {
    version: 1,
    snapshotId,
    documentId: snap.documentId,
    name: snap.name,
    description: snap.description,
    xmlContent: snap.xmlContent,
    worldbuildingData: snap.worldbuildingData,
    wordCount: snap.wordCount,
    metadata: snap.metadata,
    createdAt: snap.createdAt,
  };
}

/** Parsed remote paths of one kind that belong to the given project */
function remoteEntriesOfKind(
  files: Map<string, RemoteFileInfo>,
  username: string,
  slug: string,
  kind: RemotePathKind
): (ParsedRemotePath & { path: string })[] {
  const out: (ParsedRemotePath & { path: string })[] = [];
  for (const path of files.keys()) {
    const parsed = parseRemotePath(path);
    if (
      parsed?.kind === kind &&
      parsed.username === username &&
      parsed.slug === slug &&
      parsed.id
    ) {
      out.push({ ...parsed, path });
    }
  }
  return out;
}

/** Everything a per-project sync step needs, bundled to keep signatures short */
interface ProjectSyncContext {
  store: RemoteStore;
  username: string;
  slug: string;
  files: Map<string, RemoteFileInfo>;
  summary: ProjectSyncSummary;
}

/** Remote project.json */
interface RemoteProjectJson {
  version: 1;
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  createdDate: string;
  updatedDate: string;
}

export interface ProjectSyncSummary {
  projectKey: string;
  pushed: number;
  pulled: number;
  /** Cover media id read from the project's elements doc, for the manifest */
  coverMediaId?: string;
  title: string;
  description?: string;
  updatedAt: string;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary);
}

function stateVectorDigest(doc: Y.Doc): string {
  return base64(Y.encodeStateVector(doc));
}

function isEmptyDoc(doc: Y.Doc): boolean {
  return doc.store.clients.size === 0;
}

/**
 * Mirrors one project between local storage and the remote folder.
 *
 * Yjs docs: pull when the remote version tag moved since we last looked,
 * merge with `Y.applyUpdate`, then push the full state whenever the local
 * state vector differs from what the remote holds. Media: content-addressed,
 * so it is a set difference in both directions. project.json: last writer
 * wins by `updatedDate`.
 */
@Injectable({
  providedIn: 'root',
})
export class CloudProjectMirrorService {
  private readonly state = inject(CloudSyncStateService);
  private readonly docs = inject(YDocAccessService);
  private readonly localProjects = inject(LocalProjectService);
  private readonly media = inject(LocalStorageService);
  private readonly mediaSync = inject(MediaSyncService);
  private readonly snapshots = inject(LocalSnapshotService);
  private readonly logger = inject(LoggerService);

  /**
   * Full two-way sync of a project. `remoteFiles` lets the caller pass a
   * listing it already has (e.g. one recursive list of /projects).
   */
  async syncProject(
    store: RemoteStore,
    username: string,
    slug: string,
    remoteFiles?: Map<string, RemoteFileInfo>
  ): Promise<ProjectSyncSummary> {
    const projectKey = projectKeyOf(username, slug);
    const files =
      remoteFiles ??
      this.indexFiles(
        await store.list(projectFolder(username, slug), { recursive: true })
      );
    const summary: ProjectSyncSummary = {
      projectKey,
      pushed: 0,
      pulled: 0,
      title: '',
      updatedAt: new Date().toISOString(),
    };

    // 1. Elements doc first: it tells us which documents exist
    const elementList = await this.syncElements(
      store,
      username,
      slug,
      files,
      summary
    );

    // 2. Prose documents and worldbuilding docs
    for (const element of elementList) {
      if (element.type === ElementType.Item) {
        await this.syncOptionalDoc(
          store,
          documentPath(username, slug, element.id),
          documentDocId(username, slug, element.id),
          () =>
            this.docs.acquireDocument(
              documentDocId(username, slug, element.id)
            ),
          files,
          summary
        );
      } else if (element.type === ElementType.Worldbuilding) {
        const docId = worldbuildingDocId(username, slug, element.id);
        await this.syncOptionalDoc(
          store,
          worldbuildingPath(username, slug, element.id),
          docId,
          () =>
            this.docs.acquireWorldbuilding(username, slug, element.id, docId),
          files,
          summary
        );
      }
    }

    // 3. Media blobs
    await this.syncMedia(store, username, slug, files, summary);

    // 3b. Version history (immutable snapshots, set difference each way)
    await this.syncSnapshots(store, username, slug, files, summary);

    // 4. Project metadata
    const project = await this.syncProjectJson(
      store,
      username,
      slug,
      files,
      summary
    );
    summary.title = project?.title ?? slug;
    summary.description = project?.description ?? undefined;
    summary.updatedAt = project?.updatedDate ?? summary.updatedAt;

    return summary;
  }

  /** Delete a project's remote folder and forget our records for it */
  async deleteRemoteProject(
    store: RemoteStore,
    username: string,
    slug: string
  ): Promise<void> {
    await store.delete(projectFolder(username, slug));
    await this.state.deleteByPrefix(`${projectFolder(username, slug)}/`);
  }

  /**
   * Download only the cover image of a project that is not activated on this
   * device, so its card renders. Returns true when a blob was stored.
   */
  async pullCover(
    store: RemoteStore,
    username: string,
    slug: string,
    coverMediaId: string
  ): Promise<boolean> {
    const projectKey = projectKeyOf(username, slug);
    if (await this.media.hasMedia(projectKey, coverMediaId)) return false;
    try {
      const file = await store.get(mediaPath(username, slug, coverMediaId));
      const index = await this.readMediaIndex(store, username, slug);
      const meta = index.items[coverMediaId];
      await this.media.saveMedia(
        projectKey,
        coverMediaId,
        new Blob([file.content as BlobPart], {
          type: meta?.mimeType ?? 'image/png',
        }),
        meta?.filename
      );
      this.mediaSync.mediaSyncVersion.update(v => v + 1);
      return true;
    } catch (error) {
      if (error instanceof RemoteFileNotFoundError) return false;
      throw error;
    }
  }

  indexFiles(list: RemoteFileInfo[]): Map<string, RemoteFileInfo> {
    return new Map(list.map(f => [f.path, f]));
  }

  // ───────────────────────────────────────────────────────────────────────────

  /** Sync the elements doc and return its element list */
  private async syncElements(
    store: RemoteStore,
    username: string,
    slug: string,
    files: Map<string, RemoteFileInfo>,
    summary: ProjectSyncSummary
  ): Promise<Element[]> {
    const elements = await this.docs.acquireElements(username, slug);
    try {
      await this.syncYDoc(
        store,
        elementsPath(username, slug),
        elements,
        files,
        summary
      );
      const meta = elements.doc.getMap<string>('projectMeta');
      summary.coverMediaId = meta.get('coverMediaId') ?? undefined;
      return elements.doc.getArray<Element>('elements').toArray();
    } finally {
      await elements.release();
    }
  }

  /**
   * Sync a doc that may not exist on either side yet. Avoids creating an
   * empty local database when neither side has content.
   */
  private async syncOptionalDoc(
    store: RemoteStore,
    path: string,
    docId: string,
    acquire: () => Promise<AcquiredDoc>,
    files: Map<string, RemoteFileInfo>,
    summary: ProjectSyncSummary
  ): Promise<void> {
    const remote = files.get(path);
    if (!remote && !(await this.docs.exists(docId))) return;
    const acquired = await acquire();
    try {
      await this.syncYDoc(store, path, acquired, files, summary);
    } finally {
      await acquired.release();
    }
  }

  private async syncYDoc(
    store: RemoteStore,
    path: string,
    acquired: AcquiredDoc,
    files: Map<string, RemoteFileInfo>,
    summary: ProjectSyncSummary
  ): Promise<void> {
    const { doc } = acquired;
    const record = await this.state.get(path);
    const remote = files.get(path);
    let remoteVersion = record?.remoteVersion ?? '';
    let remoteDigest: string | null = null;

    if (remote && remote.version !== record?.remoteVersion) {
      const file = await store.get(path);
      remoteDigest = base64(Y.encodeStateVectorFromUpdate(file.content));
      const before = stateVectorDigest(doc);
      Y.applyUpdate(doc, file.content, CLOUD_SYNC_ORIGIN);
      if (stateVectorDigest(doc) !== before) {
        await acquired.flush();
        summary.pulled++;
      }
      remoteVersion = file.version;
    }

    const localDigest = stateVectorDigest(doc);
    const remoteHasEverything = remoteDigest
      ? remoteDigest === localDigest
      : !!remote && record?.localDigest === localDigest;

    if (!remoteHasEverything && !isEmptyDoc(doc)) {
      const info = await store.put(path, Y.encodeStateAsUpdate(doc));
      remoteVersion = info.version;
      files.set(path, info);
      summary.pushed++;
    } else if (!remote && isEmptyDoc(doc)) {
      return;
    }

    await this.state.set({
      path,
      remoteVersion,
      localDigest,
      syncedAt: new Date().toISOString(),
    });
  }

  private async syncMedia(
    store: RemoteStore,
    username: string,
    slug: string,
    files: Map<string, RemoteFileInfo>,
    summary: ProjectSyncSummary
  ): Promise<void> {
    const projectKey = projectKeyOf(username, slug);
    const local = await this.media.listMedia(projectKey);
    const index = await this.readMediaIndex(store, username, slug);
    const remoteIds = new Set(
      remoteEntriesOfKind(files, username, slug, 'media').map(p => p.id!)
    );

    const indexChanged = await this.uploadLocalOnlyMedia(
      { store, username, slug, files, summary },
      local,
      remoteIds,
      index
    );

    const localIds = new Set(local.map(m => m.mediaId));
    const downloaded = await this.downloadRemoteOnlyMedia(
      store,
      username,
      slug,
      [...remoteIds].filter(id => !localIds.has(id)),
      index,
      summary
    );
    if (downloaded > 0) {
      this.mediaSync.mediaSyncVersion.update(v => v + 1);
    }

    if (indexChanged) {
      const info = await store.put(
        mediaIndexPath(username, slug),
        JSON.stringify(index)
      );
      files.set(info.path, info);
    }
  }

  /** Upload media the remote lacks; also backfill index entries. Returns whether the index changed. */
  private async uploadLocalOnlyMedia(
    ctx: ProjectSyncContext,
    local: MediaInfo[],
    remoteIds: Set<string>,
    index: RemoteMediaIndex
  ): Promise<boolean> {
    const { store, username, slug, files, summary } = ctx;
    const projectKey = projectKeyOf(username, slug);
    let indexChanged = false;
    for (const item of local) {
      const alreadyRemote = remoteIds.has(item.mediaId);
      if (!alreadyRemote) {
        const blob = await this.media.getMedia(projectKey, item.mediaId);
        if (!blob) continue;
        const info = await store.put(
          mediaPath(username, slug, item.mediaId),
          new Uint8Array(await blob.arrayBuffer())
        );
        files.set(info.path, info);
        summary.pushed++;
      }
      if (!alreadyRemote || !index.items[item.mediaId]) {
        index.items[item.mediaId] = {
          mimeType: item.mimeType,
          size: item.size,
          filename: item.filename,
          createdAt: item.createdAt,
        };
        indexChanged = true;
      }
    }
    return indexChanged;
  }

  /** Download media only the remote has. Returns how many were stored. */
  private async downloadRemoteOnlyMedia(
    store: RemoteStore,
    username: string,
    slug: string,
    mediaIds: string[],
    index: RemoteMediaIndex,
    summary: ProjectSyncSummary
  ): Promise<number> {
    const projectKey = projectKeyOf(username, slug);
    let downloaded = 0;
    for (const mediaId of mediaIds) {
      try {
        const file = await store.get(mediaPath(username, slug, mediaId));
        const meta = index.items[mediaId];
        await this.media.saveMedia(
          projectKey,
          mediaId,
          new Blob([file.content as BlobPart], {
            type: meta?.mimeType ?? 'application/octet-stream',
          }),
          meta?.filename
        );
        downloaded++;
        summary.pulled++;
      } catch (error) {
        if (!(error instanceof RemoteFileNotFoundError)) throw error;
      }
    }
    return downloaded;
  }

  /**
   * Snapshots are immutable once created and keyed by a UUID, so mirroring
   * is a set difference in both directions. Deletions are not propagated
   * yet; a snapshot removed on one device stays on the others.
   */
  private async syncSnapshots(
    store: RemoteStore,
    username: string,
    slug: string,
    files: Map<string, RemoteFileInfo>,
    summary: ProjectSyncSummary
  ): Promise<void> {
    const projectKey = projectKeyOf(username, slug);
    const local = await this.snapshots.getSnapshotsForExport(projectKey);
    const localBySnapshotId = new Map(
      local.map(snap => [snapshotIdOf(snap.id), snap] as const)
    );
    const remotePaths = new Map(
      remoteEntriesOfKind(files, username, slug, 'snapshot').map(
        p => [p.snapshotId!, p.path] as const
      )
    );

    for (const [snapshotId, snap] of localBySnapshotId) {
      if (remotePaths.has(snapshotId)) continue;
      const info = await store.put(
        snapshotPath(username, slug, snap.documentId, snapshotId),
        JSON.stringify(toRemoteSnapshot(snapshotId, snap))
      );
      files.set(info.path, info);
      summary.pushed++;
    }

    for (const [snapshotId, path] of remotePaths) {
      if (localBySnapshotId.has(snapshotId)) continue;
      const parsed = await this.readRemoteSnapshot(store, path);
      if (!parsed) continue;
      await this.snapshots.importSnapshot(
        projectKey,
        {
          documentId: parsed.documentId,
          name: parsed.name,
          description: parsed.description,
          xmlContent: parsed.xmlContent ?? '',
          worldbuildingData: parsed.worldbuildingData,
          wordCount: parsed.wordCount,
          metadata: parsed.metadata,
          createdAt: parsed.createdAt,
        },
        { snapshotId }
      );
      summary.pulled++;
    }
  }

  /** Download and validate one snapshot file; null when missing or unreadable */
  private async readRemoteSnapshot(
    store: RemoteStore,
    path: string
  ): Promise<RemoteSnapshotJson | null> {
    let file: RemoteFile;
    try {
      file = await store.get(path);
    } catch (error) {
      if (error instanceof RemoteFileNotFoundError) return null;
      throw error;
    }
    const parsed = JSON.parse(
      new TextDecoder().decode(file.content)
    ) as Partial<RemoteSnapshotJson>;
    if (
      parsed.version !== 1 ||
      typeof parsed.documentId !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      this.logger.warn('CloudSync', `Skipping unreadable snapshot ${path}`);
      return null;
    }
    return parsed as RemoteSnapshotJson;
  }

  private async readMediaIndex(
    store: RemoteStore,
    username: string,
    slug: string
  ): Promise<RemoteMediaIndex> {
    try {
      const file = await store.get(mediaIndexPath(username, slug));
      const parsed = JSON.parse(
        new TextDecoder().decode(file.content)
      ) as Partial<RemoteMediaIndex>;
      if (
        parsed.version === 1 &&
        parsed.items &&
        typeof parsed.items === 'object'
      ) {
        return { version: 1, items: parsed.items };
      }
    } catch (error) {
      if (!(error instanceof RemoteFileNotFoundError)) {
        this.logger.warn(
          'CloudSync',
          `Unreadable media index for ${username}/${slug}; rebuilding`,
          error
        );
      }
    }
    return { version: 1, items: {} };
  }

  private async syncProjectJson(
    store: RemoteStore,
    username: string,
    slug: string,
    files: Map<string, RemoteFileInfo>,
    summary: ProjectSyncSummary
  ): Promise<Project | null> {
    const path = projectJsonPath(username, slug);
    const local = this.localProjects.getProject(username, slug);
    const remoteInfo = files.get(path);
    const record = await this.state.get(path);

    let remote: RemoteProjectJson | null = null;
    if (remoteInfo && remoteInfo.version !== record?.remoteVersion) {
      try {
        const file = await store.get(path);
        remote = JSON.parse(
          new TextDecoder().decode(file.content)
        ) as RemoteProjectJson;
      } catch (error) {
        if (!(error instanceof RemoteFileNotFoundError)) throw error;
      }
    }

    // Remote is newer (or we have no local entry): adopt it
    if (remote && remote.updatedDate > (local?.updatedDate ?? '')) {
      const changed =
        local?.title !== remote.title ||
        (local.description ?? null) !== (remote.description ?? null);
      if (changed) {
        this.localProjects.importProjects([
          {
            id: local?.id ?? remote.id,
            slug,
            username,
            title: remote.title,
            description: remote.description ?? null,
            coverImage: local?.coverImage ?? null,
            createdDate: local?.createdDate ?? remote.createdDate,
            updatedDate: remote.updatedDate,
          },
        ]);
        summary.pulled++;
      }
      await this.state.set({
        path,
        remoteVersion: remoteInfo?.version ?? '',
        localDigest: this.projectDigest(remote),
        syncedAt: new Date().toISOString(),
      });
      return this.localProjects.getProject(username, slug);
    }

    if (!local) return null;

    const payload: RemoteProjectJson = {
      version: 1,
      id: local.id,
      slug: local.slug,
      title: local.title,
      description: local.description ?? null,
      createdDate: local.createdDate,
      updatedDate: local.updatedDate,
    };
    const digest = this.projectDigest(payload);
    if (!remoteInfo || record?.localDigest !== digest) {
      const info = await store.put(path, JSON.stringify(payload, null, 2));
      files.set(path, info);
      summary.pushed++;
      await this.state.set({
        path,
        remoteVersion: info.version,
        localDigest: digest,
        syncedAt: new Date().toISOString(),
      });
    } else if (remote === null && remoteInfo && !record) {
      await this.state.set({
        path,
        remoteVersion: remoteInfo.version,
        localDigest: digest,
        syncedAt: new Date().toISOString(),
      });
    }
    return local;
  }

  private projectDigest(p: RemoteProjectJson): string {
    return JSON.stringify([p.title, p.description ?? null, p.updatedDate]);
  }
}
