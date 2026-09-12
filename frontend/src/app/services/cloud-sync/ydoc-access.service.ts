import { inject, Injectable } from '@angular/core';
import { LocalProjectElementsService } from '@services/local/local-project-elements.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import * as Y from 'yjs';

import { StorageContextService } from '../core/storage-context.service';

/** A Yjs doc handed out for syncing, with the means to give it back */
export interface AcquiredDoc {
  doc: Y.Doc;
  /** True when this is the doc an open editor is using */
  live: boolean;
  /** Persist pending changes (headless docs) */
  flush(): Promise<void>;
  /** Release resources. Never destroys a live doc. */
  release(): Promise<void>;
}

/**
 * Hands Cloud Sync the right Y.Doc for a local document:
 *
 * - the **live** doc when the project or editor currently has it open, so
 *   remote updates show up on screen immediately and local edits are read
 *   from memory;
 * - otherwise a **headless** doc loaded from IndexedDB, flushed and destroyed
 *   after use.
 *
 * Headless loading of a doc that does not exist yet creates its IndexedDB
 * database, so callers should check {@link exists} first when they only want
 * to read.
 */
@Injectable({
  providedIn: 'root',
})
export class YDocAccessService {
  private readonly storageContext = inject(StorageContextService);
  private readonly localElements = inject(LocalProjectElementsService);
  private readonly liveDocs = inject(LiveDocumentRegistryService);
  private readonly worldbuilding = inject(WorldbuildingService);
  private readonly projectState = inject(ProjectStateService);

  /** Prefixed IndexedDB name of a project's elements doc */
  elementsDocId(username: string, slug: string): string {
    return this.storageContext.prefixDocumentId(`${username}:${slug}:elements`);
  }

  /** Whether a doc has any persisted content, without creating its database */
  exists(docId: string): Promise<boolean> {
    return this.liveDocs.hasLocalContent(docId);
  }

  /**
   * The elements doc. Uses the shared connection only for the project that
   * is currently open, because LocalProjectElementsService's signals are
   * single-project and loading another project would hijack them.
   */
  async acquireElements(username: string, slug: string): Promise<AcquiredDoc> {
    const current = this.projectState.project();
    if (current?.username === username && current.slug === slug) {
      const doc = await this.localElements.getYjsDocument(username, slug);
      return this.liveDoc(doc);
    }
    return this.headless(this.elementsDocId(username, slug));
  }

  async acquireDocument(docId: string): Promise<AcquiredDoc> {
    const live = this.liveDocs.getConnectedYDoc(docId);
    if (live) return this.liveDoc(live);
    return this.headless(docId);
  }

  async acquireWorldbuilding(
    username: string,
    slug: string,
    elementId: string,
    docId: string
  ): Promise<AcquiredDoc> {
    const live = this.worldbuilding.getYDoc(elementId, username, slug);
    if (live) return this.liveDoc(live);
    return this.headless(docId);
  }

  private liveDoc(doc: Y.Doc): AcquiredDoc {
    return {
      doc,
      live: true,
      flush: () => Promise.resolve(),
      release: () => Promise.resolve(),
    };
  }

  private async headless(docId: string): Promise<AcquiredDoc> {
    const doc = new Y.Doc();
    const provider = new IndexeddbPersistence(docId, doc);
    await provider.whenSynced;
    return {
      doc,
      live: false,
      flush: async () => {
        await storeState(provider, true);
      },
      release: async () => {
        await provider.destroy();
        doc.destroy();
      },
    };
  }
}
