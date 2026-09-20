import { inject, Injectable } from '@angular/core';

import { LoggerService } from '../core/logger.service';
import { DocumentService } from '../project/document.service';
import {
  type DocumentRevisionEntry,
  DocumentSyncManifestService,
} from './document-sync-manifest.service';
import {
  type DocumentSyncRecord,
  DocumentSyncStateService,
} from './document-sync-state.service';

/**
 * Concurrent local IndexedDB digest reads while planning. Matches the bulk
 * sync path's default concurrency so the plan and the sync apply similar
 * pressure to the browser's storage layer.
 */
const DOCUMENT_DIGEST_CONCURRENCY = 3;

/** Result of planning which documents a bulk sync actually needs to open. */
export interface DocumentSyncPlan {
  /** Documents that need a WebSocket sync (new, changed on the server, or edited locally). */
  toSync: string[];
  /** Documents proven unchanged since this device last synced them. */
  skipped: string[];
  /**
   * The pre-sync manifest, used to detect concurrent server edits across the
   * sync run; `null` when the manifest was unavailable and nothing may be
   * checkpointed.
   */
  before: Map<string, DocumentRevisionEntry> | null;
}

/**
 * Decides which documents a bulk sync can skip.
 *
 * A document is skipped only when all three hold:
 *  1. the manifest is available and reports a known, non-null revision for it,
 *  2. this device has a stored sync record for it, and
 *  3. the server revision is unchanged and the local Yjs state-vector digest
 *     still matches the checkpoint — i.e. no local edits since the last sync.
 *
 * Anything else (no record, unknown revision, changed revision, changed local
 * digest, unreadable local state) syncs, so the fast path can only ever *skip
 * work that is provably redundant*, never miss an edit.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentSyncPlannerService {
  private readonly manifestService = inject(DocumentSyncManifestService);
  private readonly syncState = inject(DocumentSyncStateService);
  private readonly documentService = inject(DocumentService);
  private readonly logger = inject(LoggerService);

  /**
   * Plan a bulk sync for a project.
   *
   * `forceSync` document ids (e.g. the user-opened priority document) are
   * always scheduled, because their state may not be reflected in the
   * manifest/record yet.
   */
  async plan(
    username: string,
    slug: string,
    documentIds: string[],
    forceSync: ReadonlySet<string> = new Set()
  ): Promise<DocumentSyncPlan> {
    const manifest = await this.manifestService.getManifest(username, slug);
    if (!manifest) {
      // No manifest: sync everything. Checkpointing is disabled (before=null)
      // because we cannot prove a revision was stable across the run.
      this.logger.debug(
        'DocumentSyncPlanner',
        `Manifest unavailable for ${username}/${slug}; syncing all ${documentIds.length} documents`
      );
      return { toSync: [...documentIds], skipped: [], before: null };
    }

    const before = new Map(
      manifest.documents.map(entry => [entry.documentId, entry])
    );
    const records = await this.syncState.getMany(documentIds);

    // Only candidates need a local IndexedDB digest read, and those reads are
    // independent — run them with bounded concurrency so the plan itself does
    // not become the bottleneck on a large project.
    const candidates = documentIds.filter(id => !forceSync.has(id));
    const digests = await this.computeDigests(candidates, before, records);

    const toSync: string[] = [];
    const skipped: string[] = [];
    for (const documentId of documentIds) {
      if (forceSync.has(documentId) || !digests.get(documentId)) {
        toSync.push(documentId);
      } else {
        skipped.push(documentId);
      }
    }

    this.logger.info(
      'DocumentSyncPlanner',
      `[${username}/${slug}] ${toSync.length} to sync, ${skipped.length} skipped (unchanged)`
    );
    return { toSync, skipped, before };
  }

  /**
   * Read the local state-vector digest for each candidate that *could* be
   * skipped, returning a map of documentId → digest. A document missing from
   * the map cannot be skipped. Reads run with bounded concurrency (IndexedDB
   * opens are cheap but not free).
   */
  private async computeDigests(
    candidates: string[],
    before: Map<string, DocumentRevisionEntry>,
    records: Map<string, DocumentSyncRecord>
  ): Promise<Map<string, string>> {
    const candidatesForRead = candidates.filter(id =>
      this.isSkipCandidate(before.get(id), records.get(id))
    );

    const digests = new Map<string, string>();
    const concurrency = DOCUMENT_DIGEST_CONCURRENCY;
    for (let i = 0; i < candidatesForRead.length; i += concurrency) {
      const batch = candidatesForRead.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async documentId => ({
          documentId,
          digest:
            await this.documentService.getLocalStateVectorDigest(documentId),
        }))
      );
      for (const { documentId, digest } of results) {
        const record = records.get(documentId);
        if (digest !== null && record && digest === record.stateVectorDigest) {
          digests.set(documentId, digest);
        }
      }
    }
    return digests;
  }

  /** Whether the manifest+record permit even considering a skip. */
  private isSkipCandidate(
    entry: DocumentRevisionEntry | undefined,
    record: DocumentSyncRecord | undefined
  ): boolean {
    if (!entry || entry.unknown || entry.revision === null) return false;
    if (!record) return false;
    return record.serverRevision === entry.revision;
  }

  /**
   * Persist sync checkpoints after a batch sync.
   *
   * `digests` maps each successfully synced document to its post-merge local
   * state-vector digest. A record is only written when the server revision is
   * **identical before and after** the sync run — that proves no third party
   * edited the document while we were syncing, so the digest is a safe
   * checkpoint. Documents whose revision moved are left uncheckpointed and will
   * sync again next time (conservative, never stale).
   *
   * A `before` of `null` (manifest was unavailable) disables checkpointing
   * entirely.
   */
  async record(
    username: string,
    slug: string,
    before: Map<string, DocumentRevisionEntry> | null,
    digests: ReadonlyMap<string, string>
  ): Promise<void> {
    if (!before || digests.size === 0) return;

    const afterManifest = await this.manifestService.getManifest(
      username,
      slug
    );
    if (!afterManifest) return;
    const after = new Map(
      afterManifest.documents.map(entry => [entry.documentId, entry])
    );

    const syncedAt = new Date().toISOString();
    const records: DocumentSyncRecord[] = [];
    for (const [documentId, digest] of digests) {
      const beforeEntry = before.get(documentId);
      const afterEntry = after.get(documentId);
      if (
        !beforeEntry ||
        !afterEntry ||
        beforeEntry.unknown ||
        afterEntry.unknown ||
        beforeEntry.revision === null ||
        beforeEntry.revision !== afterEntry.revision
      ) {
        continue;
      }
      records.push({
        documentId,
        serverRevision: afterEntry.revision,
        stateVectorDigest: digest,
        syncedAt,
      });
    }

    if (records.length > 0) {
      await this.syncState.setMany(records);
    }
  }
}
