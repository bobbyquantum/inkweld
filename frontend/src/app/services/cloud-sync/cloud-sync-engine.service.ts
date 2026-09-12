import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
} from '@angular/core';
import { type Project } from '@inkweld/index';
import {
  CLOUD_MANIFEST_PATH,
  type CloudManifest,
  type CloudManifestProject,
  createCloudManifest,
  manifestsEquivalent,
  mergeCloudManifests,
  mergeManifestProjects,
  parseCloudManifest,
  sameUsername,
  upsertManifestProject,
  withManifestProfile,
} from '@models/cloud-manifest';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { LocalProjectService } from '@services/local/local-project.service';
import { LocalProjectElementsService } from '@services/local/local-project-elements.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { ProjectSyncService } from '@services/local/project-sync.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import type * as Y from 'yjs';

import {
  CLOUD_SYNC_ORIGIN,
  CloudProjectMirrorService,
  type ProjectSyncSummary,
} from './cloud-project-mirror.service';
import { CloudSyncConnectService } from './cloud-sync-connect.service';
import {
  CLOUD_PROJECTS_ROOT,
  projectFolder,
  projectKeyFromDocId,
  projectKeyOf,
  splitProjectKey,
} from './cloud-sync-layout';
import { CloudSyncStateService } from './cloud-sync-state.service';
import {
  RemoteAuthError,
  RemoteConflictError,
  type RemoteFileInfo,
  RemoteFileNotFoundError,
  RemoteRateLimitError,
  type RemoteStore,
} from './remote-store.interface';

export type CloudSyncStatus =
  | 'disabled' // not in cloud mode
  | 'disconnected' // cloud mode but no usable credentials
  | 'idle' // nothing has run yet
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

/** Quiet period after the last local edit before a project is synced */
const EDIT_DEBOUNCE_MS = 4000;
/** Full pass cadence while the tab is visible */
const PERIODIC_MS = 60_000;
/** Ignore a full-pass request if one finished this recently */
const MIN_FULL_PASS_GAP_MS = 10_000;

/**
 * Drives Cloud Sync mode: decides *when* to sync and keeps the manifest
 * coherent, delegating the per-project work to {@link CloudProjectMirrorService}.
 *
 * Triggers: app start, project open, a few seconds after the last local edit
 * (documents, worldbuilding, elements doc of the open project), window focus,
 * coming back online, a periodic timer, and an explicit "sync now".
 *
 * A full pass: pull the manifest, adopt projects created elsewhere (as
 * deactivated cards with covers), apply tombstones both ways, then mirror
 * every activated project, then push the merged manifest with optimistic
 * concurrency on its version tag.
 */
@Injectable({
  providedIn: 'root',
})
export class CloudSyncEngineService {
  private readonly setupService = inject(SetupService);
  private readonly storageContext = inject(StorageContextService);
  private readonly connect = inject(CloudSyncConnectService);
  private readonly mirror = inject(CloudProjectMirrorService);
  private readonly state = inject(CloudSyncStateService);
  private readonly localProjects = inject(LocalProjectService);
  private readonly localElements = inject(LocalProjectElementsService);
  private readonly media = inject(LocalStorageService);
  private readonly activation = inject(ProjectActivationService);
  private readonly projectSync = inject(ProjectSyncService);
  private readonly projectState = inject(ProjectStateService);
  private readonly liveDocs = inject(LiveDocumentRegistryService);
  private readonly worldbuilding = inject(WorldbuildingService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly status = signal<CloudSyncStatus>('disabled');
  readonly lastSyncAt = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);
  /** Projects with local edits waiting for the debounce */
  readonly pendingProjects = signal<ReadonlySet<string>>(new Set());

  readonly isActive = computed(
    () => this.status() !== 'disabled' && this.status() !== 'disconnected'
  );

  private store: RemoteStore | null = null;
  private configId: string | null = null;
  private initialized = false;
  private queue: Promise<unknown> = Promise.resolve();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private lastFullPassAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private elementsListener: { doc: Y.Doc; handler: () => void } | null = null;
  private manifestVersion = '';

  /**
   * Start the engine. Safe to call more than once; does nothing outside
   * cloud mode. Called from app bootstrap after the user profile is loaded.
   */
  initialize(options: { runStartupPass?: boolean } = {}): void {
    if (this.initialized) return;
    this.initialized = true;

    if (this.setupService.getMode() !== 'cloud') {
      this.status.set('disabled');
      return;
    }
    const config = this.storageContext.getActiveConfig();
    if (!config?.cloudProvider || !this.connect.hasCredentials(config.id)) {
      this.status.set('disconnected');
      this.logger.warn(
        'CloudSync',
        'Cloud mode without credentials; sync is off'
      );
      return;
    }
    this.configId = config.id;
    this.store = this.connect.createStore(config.cloudProvider, config.id);
    this.status.set(navigator.onLine ? 'idle' : 'offline');

    this.wireTriggers();
    if (options.runStartupPass !== false) {
      void this.syncAll('startup');
    }
  }

  /** Full pass now, ignoring the minimum gap. Used by the UI. */
  syncNow(): Promise<void> {
    return this.syncAll('manual', { force: true });
  }

  /** Sync one project as soon as the queue allows */
  syncProject(projectKey: string): Promise<void> {
    return this.enqueue(async () => {
      if (!this.store) return;
      const parts = splitProjectKey(projectKey);
      if (!parts) return;
      this.status.set('syncing');
      try {
        const summary = await this.mirror.syncProject(
          this.store,
          parts.username,
          parts.slug
        );
        await this.updateManifestFromSummaries([summary]);
        this.logger.info(
          'CloudSync',
          `Project ${projectKey}: ${summary.pushed} pushed, ${summary.pulled} pulled`
        );
        this.markSynced();
      } catch (error) {
        this.handleError(error);
      }
    });
  }

  /** Record a local change; the project syncs after a quiet period */
  markDirty(projectKey: string): void {
    if (!this.store) return;
    const next = new Set(this.pendingProjects());
    next.add(projectKey);
    this.pendingProjects.set(next);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushDirty();
    }, EDIT_DEBOUNCE_MS);
  }

  /** Push pending edits immediately (e.g. before the page hides) */
  async flushDirty(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const pending = [...this.pendingProjects()];
    if (pending.length === 0) return;
    this.pendingProjects.set(new Set());
    for (const key of pending) {
      await this.syncProject(key);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Triggers
  // ───────────────────────────────────────────────────────────────────────────

  private wireTriggers(): void {
    const onOnline = (): void => {
      this.status.set('idle');
      void this.syncAll('online');
    };
    const onOffline = (): void => this.status.set('offline');
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void this.syncAll('focus');
      } else {
        void this.flushDirty();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    this.periodicTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncAll('periodic');
    }, PERIODIC_MS);

    const editSub = this.liveDocs.localEdit$.subscribe(docId => {
      const key = projectKeyFromDocId(docId);
      if (key) this.markDirty(key);
    });
    const wbSub = this.worldbuilding.localEdit$.subscribe(connectionKey => {
      const key = projectKeyFromDocId(connectionKey);
      if (key) this.markDirty(key);
    });

    // Follow the open project: watch its elements doc and sync it on open.
    // initialize() runs outside an injection context, so pass the injector.
    effect(
      () => {
        const project = this.projectState.project();
        void this.followProject(project);
      },
      { injector: this.injector }
    );

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      if (this.periodicTimer) clearInterval(this.periodicTimer);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      editSub.unsubscribe();
      wbSub.unsubscribe();
      this.detachElementsListener();
    });
  }

  private async followProject(project: Project | undefined): Promise<void> {
    this.detachElementsListener();
    if (!project || !this.store) return;
    const key = projectKeyOf(project.username, project.slug);
    try {
      const doc = await this.localElements.getYjsDocument(
        project.username,
        project.slug
      );
      const handler = (_update: Uint8Array, origin: unknown): void => {
        if (origin !== CLOUD_SYNC_ORIGIN) this.markDirty(key);
      };
      doc.on('update', handler);
      this.elementsListener = {
        doc,
        handler: () => doc.off('update', handler),
      };
    } catch (error) {
      this.logger.warn(
        'CloudSync',
        `Could not watch elements doc for ${key}`,
        error
      );
    }
    void this.syncProject(key);
  }

  private detachElementsListener(): void {
    this.elementsListener?.handler();
    this.elementsListener = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Full pass
  // ───────────────────────────────────────────────────────────────────────────

  private syncAll(
    reason: string,
    options: { force?: boolean } = {}
  ): Promise<void> {
    return this.enqueue(async () => {
      if (!this.store) return;
      if (!navigator.onLine) {
        this.status.set('offline');
        return;
      }
      if (
        !options.force &&
        Date.now() - this.lastFullPassAt < MIN_FULL_PASS_GAP_MS
      ) {
        return;
      }
      this.status.set('syncing');
      this.logger.debug('CloudSync', `Full pass (${reason})`);
      try {
        await this.runFullPass();
        this.lastFullPassAt = Date.now();
        this.markSynced();
      } catch (error) {
        this.handleError(error);
      }
    });
  }

  private async runFullPass(): Promise<void> {
    const store = this.store!;
    const listing = await store.list(CLOUD_PROJECTS_ROOT, { recursive: true });
    const files = this.mirror.indexFiles(listing);

    let manifest = await this.readRemoteManifest(store);
    manifest = await this.applyLocalTombstones(store, manifest);
    await this.adoptRemoteEntries(store, manifest);
    const summaries = await this.mirrorActivatedProjects(store, files);

    await this.writeManifest(store, this.applySummaries(manifest, summaries));
    this.pendingProjects.set(new Set());
    const pushed = summaries.reduce((n, s) => n + s.pushed, 0);
    const pulled = summaries.reduce((n, s) => n + s.pulled, 0);
    this.logger.info(
      'CloudSync',
      `Full pass complete: ${summaries.length} project(s), ${pushed} pushed, ${pulled} pulled`
    );
  }

  /** Local deletions become remote tombstones and the remote folder goes */
  private async applyLocalTombstones(
    store: RemoteStore,
    manifest: CloudManifest
  ): Promise<CloudManifest> {
    let next = manifest;
    for (const tombstone of await this.projectSync.getAllTombstones()) {
      const parts = splitProjectKey(tombstone.projectKey);
      if (!parts) continue;
      await this.mirror.deleteRemoteProject(store, parts.username, parts.slug);
      next = upsertManifestProject(next, {
        key: tombstone.projectKey,
        slug: parts.slug,
        title: '',
        createdAt: tombstone.deletedAt,
        updatedAt: tombstone.deletedAt,
        deletedAt: tombstone.deletedAt,
      });
      await this.projectSync.removeTombstone(tombstone.projectKey);
    }
    return next;
  }

  /** Adopt projects created elsewhere as cards; apply remote deletions */
  private async adoptRemoteEntries(
    store: RemoteStore,
    manifest: CloudManifest
  ): Promise<void> {
    const localProjects = this.localProjects.projects();
    const me = this.storageContext.getActiveConfig()?.userProfile?.username;
    for (const entry of manifest.projects) {
      const parts = splitProjectKey(entry.key);
      if (!parts) continue;
      const local = localProjects.find(
        p => p.username === parts.username && p.slug === parts.slug
      );
      // Several authors can share one account. New remote projects are only
      // adopted for this profile's own author; projects already on this
      // device keep following remote changes whoever wrote them.
      if (!local && me && !sameUsername(parts.username, me)) continue;
      await this.adoptRemoteEntry(store, entry, parts, local);
    }
  }

  /** One manifest entry: delete, adopt, and/or fetch its cover */
  private async adoptRemoteEntry(
    store: RemoteStore,
    entry: CloudManifestProject,
    parts: { username: string; slug: string },
    local: { updatedDate: string } | undefined
  ): Promise<void> {
    if (entry.deletedAt) {
      if (local && local.updatedDate <= entry.deletedAt) {
        await this.removeLocalProject(parts.username, parts.slug);
      }
      return;
    }
    if (!local) this.adoptRemoteProject(entry, parts);
    if (entry.coverMediaId && !this.activation.isActivated(entry.key)) {
      await this.mirror.pullCover(
        store,
        parts.username,
        parts.slug,
        entry.coverMediaId
      );
    }
  }

  private adoptRemoteProject(
    entry: CloudManifestProject,
    parts: { username: string; slug: string }
  ): void {
    this.localProjects.importProjects([
      {
        id: `cloud-${crypto.randomUUID()}`,
        slug: parts.slug,
        username: parts.username,
        title: entry.title,
        description: entry.description ?? null,
        coverImage: entry.coverMediaId ?? null,
        createdDate: entry.createdAt,
        updatedDate: entry.updatedAt,
      },
    ]);
    this.logger.info('CloudSync', `Adopted project ${entry.key} from cloud`);
  }

  /** Mirror every activated project (new ones are activated where created) */
  private async mirrorActivatedProjects(
    store: RemoteStore,
    files: Map<string, RemoteFileInfo>
  ): Promise<ProjectSyncSummary[]> {
    const summaries: ProjectSyncSummary[] = [];
    for (const project of this.localProjects.projects()) {
      const key = projectKeyOf(project.username, project.slug);
      if (!this.activation.isActivated(key)) continue;
      summaries.push(
        await this.mirror.syncProject(
          store,
          project.username,
          project.slug,
          files
        )
      );
    }
    return summaries;
  }

  private async removeLocalProject(
    username: string,
    slug: string
  ): Promise<void> {
    const key = projectKeyOf(username, slug);
    this.logger.info('CloudSync', `Removing project ${key} deleted elsewhere`);
    this.localProjects.deleteProject(username, slug, {
      createTombstone: false,
    });
    await this.media.deleteProjectMedia(key);
    await this.activation.deactivate(key);
    await this.state.deleteByPrefix(`${projectFolder(username, slug)}/`);
    if ('databases' in indexedDB) {
      const prefix = this.storageContext.getPrefix();
      const all = await indexedDB.databases();
      for (const db of all) {
        const name = db.name ?? '';
        if (
          name.startsWith(`${prefix}${username}:${slug}:`) ||
          name.startsWith(`${username}:${slug}:`) ||
          name.startsWith(`worldbuilding:${username}:${slug}:`)
        ) {
          indexedDB.deleteDatabase(name);
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Manifest
  // ───────────────────────────────────────────────────────────────────────────

  private async readRemoteManifest(store: RemoteStore): Promise<CloudManifest> {
    try {
      const file = await store.get(CLOUD_MANIFEST_PATH);
      this.manifestVersion = file.version;
      const parsed = parseCloudManifest(new TextDecoder().decode(file.content));
      if (parsed) return parsed;
      this.logger.warn('CloudSync', 'Remote manifest unreadable; rebuilding');
    } catch (error) {
      if (!(error instanceof RemoteFileNotFoundError)) throw error;
      this.manifestVersion = '';
    }
    const config = this.storageContext.getActiveConfig();
    const profile = config?.userProfile ?? {
      name: 'Writer',
      username: 'writer',
    };
    return createCloudManifest(
      {
        provider: config?.cloudProvider ?? 'dropbox',
        accountId: config?.cloudAccountId ?? '',
      },
      { name: profile.name, username: profile.username }
    );
  }

  private applySummaries(
    manifest: CloudManifest,
    summaries: ProjectSyncSummary[]
  ): CloudManifest {
    const entries: CloudManifestProject[] = summaries.map(s => {
      const parts = splitProjectKey(s.projectKey)!;
      const existing = manifest.projects.find(p => p.key === s.projectKey);
      return {
        key: s.projectKey,
        slug: parts.slug,
        title: s.title,
        description: s.description,
        coverMediaId: s.coverMediaId,
        createdAt: existing?.createdAt ?? s.updatedAt,
        updatedAt: s.updatedAt,
      };
    });
    const merged = mergeManifestProjects(manifest.projects, entries);
    // mergeManifestProjects is LWW by clock; an unchanged clock keeps the old
    // entry, so overwrite fields explicitly for entries we just synced.
    const byKey = new Map(entries.map(e => [e.key, e]));
    const projects = merged.map(p => {
      const fresh = byKey.get(p.key);
      return fresh && !p.deletedAt ? { ...p, ...fresh } : p;
    });
    // Make sure this author is listed so other devices can offer the profile
    const profile = this.storageContext.getActiveConfig()?.userProfile;
    const withProfile = profile
      ? withManifestProfile(manifest, {
          name: profile.name,
          username: profile.username,
        })
      : manifest;
    return { ...withProfile, projects };
  }

  private async updateManifestFromSummaries(
    summaries: ProjectSyncSummary[]
  ): Promise<void> {
    const store = this.store!;
    const manifest = await this.readRemoteManifest(store);
    await this.writeManifest(store, this.applySummaries(manifest, summaries));
  }

  /**
   * Push the manifest if it differs from the remote. Uses the version tag so
   * a concurrent writer on another device causes a re-read and merge instead
   * of a lost update.
   */
  private async writeManifest(
    store: RemoteStore,
    manifest: CloudManifest
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await this.fetchManifestForWrite(store);
      const next = remote ? mergeCloudManifests(manifest, remote) : manifest;
      if (remote && manifestsEquivalent(remote, next)) return;
      if (await this.tryPutManifest(store, next)) return;
      this.logger.debug('CloudSync', 'Manifest changed concurrently; retrying');
    }
    throw new Error('Could not update the cloud manifest after retries');
  }

  /** Current remote manifest (null if absent), remembering its version tag */
  private async fetchManifestForWrite(
    store: RemoteStore
  ): Promise<CloudManifest | null> {
    try {
      const file = await store.get(CLOUD_MANIFEST_PATH);
      this.manifestVersion = file.version;
      return parseCloudManifest(new TextDecoder().decode(file.content));
    } catch (error) {
      if (!(error instanceof RemoteFileNotFoundError)) throw error;
      this.manifestVersion = '';
      return null;
    }
  }

  /** Write with optimistic concurrency; false on a version conflict */
  private async tryPutManifest(
    store: RemoteStore,
    manifest: CloudManifest
  ): Promise<boolean> {
    try {
      const info = await store.put(
        CLOUD_MANIFEST_PATH,
        JSON.stringify(manifest, null, 2),
        this.manifestVersion ? { ifVersion: this.manifestVersion } : undefined
      );
      this.manifestVersion = info.version;
      return true;
    } catch (error) {
      if (error instanceof RemoteConflictError) return false;
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Plumbing
  // ───────────────────────────────────────────────────────────────────────────

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private markSynced(): void {
    if (this.status() === 'syncing') this.status.set('synced');
    this.lastSyncAt.set(new Date().toISOString());
    this.lastError.set(null);
  }

  private handleError(error: unknown): void {
    if (error instanceof RemoteRateLimitError) {
      // Not a failure: the provider wants a pause. Keep the status calm and
      // try again after the interval it asked for.
      this.status.set(this.lastSyncAt() ? 'synced' : 'idle');
      this.lastError.set(null);
      this.logger.debug(
        'CloudSync',
        `Rate limited; retrying in ${Math.round(error.retryAfterMs / 1000)}s`
      );
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.syncAll('rate-limit retry', { force: true });
      }, error.retryAfterMs);
      return;
    }
    if (error instanceof RemoteAuthError) {
      this.status.set('disconnected');
      this.lastError.set(error.message);
      if (this.configId) this.connect.disconnect(this.configId);
      this.logger.warn(
        'CloudSync',
        'Cloud credentials rejected; reconnect needed'
      );
      return;
    }
    if (!navigator.onLine) {
      this.status.set('offline');
      return;
    }
    this.status.set('error');
    this.lastError.set(error instanceof Error ? error.message : String(error));
    this.logger.error('CloudSync', 'Sync failed', error);
  }
}
