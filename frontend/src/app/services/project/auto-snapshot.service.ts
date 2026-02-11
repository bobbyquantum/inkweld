import { inject, Injectable, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SettingsService } from '../core/settings.service';
import {
  LocalSnapshotService,
  StoredSnapshot,
} from '../local/local-snapshot.service';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';
import { UnifiedSnapshotService } from './unified-snapshot.service';

/**
 * Minimum interval between auto-snapshots for the same document (5 minutes).
 * Prevents excessive snapshots from rapid navigation.
 */
const AUTO_SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Maximum number of auto-snapshots to keep per document.
 * Oldest auto-snapshots beyond this limit are pruned automatically.
 */
const MAX_AUTO_SNAPSHOTS_PER_DOC = 10;

/**
 * Prefix used to identify auto-snapshots by name convention.
 */
export const AUTO_SNAPSHOT_NAME_PREFIX = 'Auto-save —';

/**
 * Settings key for enabling/disabling auto-snapshots.
 */
const AUTO_SNAPSHOT_SETTING_KEY = 'autoSnapshotsEnabled';

/**
 * AutoSnapshotService
 *
 * Creates automatic snapshots of edited documents when the user leaves a project.
 * This provides a safety net of restore points without requiring manual action.
 *
 * How it works:
 * 1. When a document receives edits, it's tracked as "dirty" via markDirty()
 * 2. When the user navigates away from the project (ProjectComponent destroys),
 *    createAutoSnapshots() is called for all dirty documents
 * 3. Auto-snapshots are throttled (max once per 5 minutes per document)
 * 4. Old auto-snapshots are pruned (max 10 per document)
 * 5. Auto-snapshots are visually distinct from manual ones in the UI
 *
 * Auto-snapshots are stored locally in IndexedDB and synced to server
 * when online, just like manual snapshots.
 */
@Injectable({
  providedIn: 'root',
})
export class AutoSnapshotService implements OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly settings = inject(SettingsService);
  private readonly projectState = inject(ProjectStateService);
  private readonly documentService = inject(DocumentService);
  private readonly snapshotService = inject(UnifiedSnapshotService);
  private readonly localSnapshots = inject(LocalSnapshotService);

  /**
   * Set of element IDs that have been modified during this session.
   * Cleared when auto-snapshots are created or when the project changes.
   */
  private dirtyDocuments = new Set<string>();

  /**
   * Timestamps of last auto-snapshot per element ID, for throttling.
   */
  private lastAutoSnapshotTime = new Map<string, number>();

  /**
   * Subscription to DocumentService's local edit events.
   */
  private editSubscription: Subscription;

  constructor() {
    this.editSubscription = this.documentService.localEdit$.subscribe(
      (documentId: string) => {
        // Extract element ID from full document ID (username:slug:elementId)
        const parts = documentId.split(':');
        const elementId =
          parts.length >= 3 ? parts.slice(2).join(':') : documentId;
        this.markDirty(elementId);
      }
    );
  }

  ngOnDestroy(): void {
    this.editSubscription.unsubscribe();
  }

  /**
   * Whether auto-snapshots are enabled.
   * Defaults to true; users can disable via settings.
   */
  isEnabled(): boolean {
    return this.settings.getSetting<boolean>(AUTO_SNAPSHOT_SETTING_KEY, true);
  }

  /**
   * Enable or disable auto-snapshots.
   */
  setEnabled(enabled: boolean): void {
    this.settings.setSetting(AUTO_SNAPSHOT_SETTING_KEY, enabled);
  }

  /**
   * Mark a document as dirty (edited during this session).
   * Called by DocumentService when a local update is applied.
   *
   * @param elementId The element ID of the document (not the full documentId)
   */
  markDirty(elementId: string): void {
    this.dirtyDocuments.add(elementId);
  }

  /**
   * Clear all dirty tracking (e.g., when switching projects).
   */
  clearDirtyState(): void {
    this.dirtyDocuments.clear();
  }

  /**
   * Get the number of dirty documents tracked this session.
   */
  getDirtyCount(): number {
    return this.dirtyDocuments.size;
  }

  /**
   * Create auto-snapshots for all dirty documents.
   *
   * This is the main entry point, called from ProjectComponent.ngOnDestroy().
   * It's fire-and-forget — writes to IndexedDB are fast enough that they'll
   * complete before the page navigates away.
   */
  async createAutoSnapshots(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug('AutoSnapshot', 'Auto-snapshots disabled, skipping');
      return;
    }

    const project = this.projectState.project();
    if (!project) {
      return;
    }

    const dirtyIds = Array.from(this.dirtyDocuments);
    if (dirtyIds.length === 0) {
      this.logger.debug('AutoSnapshot', 'No dirty documents, skipping');
      return;
    }

    const now = Date.now();
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    let created = 0;
    let skipped = 0;

    for (const elementId of dirtyIds) {
      try {
        // Throttle: skip if we auto-snapshotted this doc recently
        const lastTime = this.lastAutoSnapshotTime.get(elementId);
        if (lastTime && now - lastTime < AUTO_SNAPSHOT_THROTTLE_MS) {
          this.logger.debug(
            'AutoSnapshot',
            `Throttled auto-snapshot for ${elementId} (last: ${Math.round((now - lastTime) / 1000)}s ago)`
          );
          skipped++;
          continue;
        }

        // Find the element name for a descriptive snapshot name
        const element = this.projectState
          .elements()
          .find(e => e.id === elementId);
        const elementName = element?.name ?? elementId;

        const name = `${AUTO_SNAPSHOT_NAME_PREFIX} ${elementName} — ${timestamp}`;

        // Use the full formatted document ID (username:slug:elementId) to match
        // the format used by the document editor when creating manual snapshots.
        // This ensures auto-snapshots appear in the snapshots dialog alongside manual ones.
        const fullDocumentId = `${project.username}:${project.slug}:${elementId}`;

        await this.snapshotService.createSnapshot(
          fullDocumentId,
          name,
          'Automatic snapshot created on session end'
        );

        this.lastAutoSnapshotTime.set(elementId, now);
        created++;

        this.logger.debug(
          'AutoSnapshot',
          `Created auto-snapshot for ${elementId}`
        );
      } catch (err) {
        this.logger.warn(
          'AutoSnapshot',
          `Failed to create auto-snapshot for ${elementId}`,
          err
        );
      }
    }

    // Clear dirty state after processing
    this.dirtyDocuments.clear();

    if (created > 0 || skipped > 0) {
      this.logger.info(
        'AutoSnapshot',
        `Session end: created ${created} auto-snapshot(s), skipped ${skipped} (throttled)`
      );
    }

    // Prune old auto-snapshots in the background
    void this.pruneOldAutoSnapshots();
  }

  /**
   * Prune old auto-snapshots to prevent unbounded storage growth.
   *
   * Keeps the most recent MAX_AUTO_SNAPSHOTS_PER_DOC auto-snapshots per document.
   * Manual snapshots are never pruned.
   */
  private async pruneOldAutoSnapshots(): Promise<void> {
    try {
      const project = this.projectState.project();
      if (!project) return;

      const projectKey = `${project.username}/${project.slug}`;
      const allSnapshots =
        await this.localSnapshots.getSnapshotsForExport(projectKey);

      // Filter to auto-snapshots only
      const autoSnapshots = allSnapshots.filter(s =>
        s.name.startsWith(AUTO_SNAPSHOT_NAME_PREFIX)
      );

      // Group by documentId
      const byDocument = new Map<string, StoredSnapshot[]>();
      for (const snap of autoSnapshots) {
        const existing = byDocument.get(snap.documentId) ?? [];
        existing.push(snap);
        byDocument.set(snap.documentId, existing);
      }

      let pruned = 0;

      for (const [docId, snapshots] of byDocument) {
        // Sort newest first
        snapshots.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Delete excess snapshots (beyond the limit)
        if (snapshots.length > MAX_AUTO_SNAPSHOTS_PER_DOC) {
          const toDelete = snapshots.slice(MAX_AUTO_SNAPSHOTS_PER_DOC);
          for (const snap of toDelete) {
            try {
              await this.localSnapshots.deleteSnapshotById(snap.id);
              pruned++;
            } catch (err) {
              this.logger.warn(
                'AutoSnapshot',
                `Failed to prune auto-snapshot ${snap.id} for ${docId}`,
                err
              );
            }
          }
        }
      }

      if (pruned > 0) {
        this.logger.info(
          'AutoSnapshot',
          `Pruned ${pruned} old auto-snapshot(s)`
        );
      }
    } catch (err) {
      this.logger.warn('AutoSnapshot', 'Failed to prune auto-snapshots', err);
    }
  }

  /**
   * Check if a snapshot is an auto-snapshot (by name convention).
   */
  static isAutoSnapshot(snapshot: { name: string }): boolean {
    return snapshot.name.startsWith(AUTO_SNAPSHOT_NAME_PREFIX);
  }
}
