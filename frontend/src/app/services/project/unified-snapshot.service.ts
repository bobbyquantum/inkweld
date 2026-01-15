import { inject, Injectable, signal } from '@angular/core';
import {
  CreateSnapshotRequest,
  DocumentSnapshot,
  SnapshotsService,
  SnapshotWithContent,
} from '@inkweld/index';
import { firstValueFrom } from 'rxjs';
import * as Y from 'yjs';

import {
  applyJsonToYjsMap,
  applyXmlToFragment,
  xmlFragmentToXmlString,
  yjsMapToJson,
} from '../../utils/yjs-xml-serializer';
import { LoggerService } from '../core/logger.service';
import {
  CreateSnapshotOptions,
  LocalSnapshotService,
  SnapshotInfo,
  StoredSnapshot,
} from '../local/local-snapshot.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';

/**
 * Unified snapshot with combined local and server data
 */
export interface UnifiedSnapshot {
  /** Local composite ID (or server ID if only on server) */
  id: string;
  /** Document element ID */
  documentId: string;
  /** Snapshot name */
  name: string;
  /** Optional description */
  description?: string;
  /** Word count at time of snapshot */
  wordCount?: number;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Whether this exists locally */
  isLocal: boolean;
  /** Whether this is synced to server */
  isSynced: boolean;
  /** Server ID if synced */
  serverId?: string;
}

/**
 * Unified Snapshot Service
 *
 * This service manages document snapshots with full offline support:
 * - Creates snapshots locally in IndexedDB
 * - Syncs snapshots to server when online
 * - Retrieves snapshots from local storage first, then server
 * - Supports restore from both local and server snapshots
 *
 * The snapshot includes:
 * - Yjs document state (prose content)
 * - Worldbuilding state (for WB elements)
 * - Word count and metadata
 *
 * @example
 * ```typescript
 * // Create a snapshot
 * const snapshot = await snapshotService.createSnapshot('doc-123', 'Before major edit');
 *
 * // List snapshots for current project
 * const snapshots = await snapshotService.listSnapshots('doc-123');
 *
 * // Restore from snapshot
 * await snapshotService.restoreFromSnapshot('doc-123', snapshotId);
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class UnifiedSnapshotService {
  private logger = inject(LoggerService);
  private projectState = inject(ProjectStateService);
  private syncFactory = inject(ElementSyncProviderFactory);
  private localSnapshots = inject(LocalSnapshotService);
  private snapshotsApi = inject(SnapshotsService);
  private documentService = inject(DocumentService);
  private worldbuildingService = inject(WorldbuildingService);

  /** Whether a sync operation is in progress */
  readonly isSyncing = signal(false);

  /** Number of pending snapshots to sync */
  readonly pendingCount = signal(0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Create Snapshot
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a snapshot of a document's current state.
   *
   * This always saves locally first, then syncs to server if online.
   *
   * @param documentId Document element ID
   * @param name Snapshot name
   * @param description Optional description
   * @returns The created snapshot
   */
  async createSnapshot(
    documentId: string,
    name: string,
    description?: string
  ): Promise<StoredSnapshot> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    const projectKey = `${project.username}/${project.slug}`;

    // Extract the element ID from documentId (which may be full ID or just element ID)
    const expectedPrefix = `${project.username}:${project.slug}:`;
    const elementId = documentId.startsWith(expectedPrefix)
      ? documentId.slice(expectedPrefix.length)
      : documentId;

    // Check if this is a worldbuilding element
    const element = this.projectState.elements().find(e => e.id === elementId);
    const isWorldbuilding = element && this.isWorldbuildingType(element.type);

    let xmlContent = '';
    let wordCount = 0;
    let worldbuildingData: Record<string, unknown> | undefined;

    // For worldbuilding elements, we primarily snapshot the worldbuilding data
    // The prose document may not exist or may be empty
    if (isWorldbuilding) {
      // Get worldbuilding data (required for WB elements)
      const wbYdoc = this.getWorldbuildingYDoc(elementId);
      if (!wbYdoc) {
        throw new Error(
          `Worldbuilding document ${elementId} not found or not loaded`
        );
      }
      const dataMap = wbYdoc.getMap<unknown>('worldbuilding');
      worldbuildingData = yjsMapToJson(dataMap);

      // Optionally try to get prose content (may not exist)
      const ydoc = await this.getDocumentYDoc(documentId);
      if (ydoc) {
        const prosemirror = ydoc.getXmlFragment('prosemirror');
        if (prosemirror.length > 0) {
          xmlContent = xmlFragmentToXmlString(prosemirror);
          wordCount = this.calculateWordCount(ydoc);
        }
      }
    } else {
      // For regular documents, the prose document is required
      const ydoc = await this.getDocumentYDoc(documentId);
      if (!ydoc) {
        throw new Error(`Document ${elementId} not found or not loaded`);
      }

      const prosemirror = ydoc.getXmlFragment('prosemirror');
      xmlContent = xmlFragmentToXmlString(prosemirror);
      wordCount = this.calculateWordCount(ydoc);
    }

    // Create the snapshot options
    const options: CreateSnapshotOptions = {
      name,
      description,
      xmlContent,
      worldbuildingData,
      wordCount,
      metadata: {
        elementName: element?.name,
        elementType: element?.type,
      },
    };

    // Save locally first
    const localSnapshot = await this.localSnapshots.createSnapshot(
      projectKey,
      documentId,
      options
    );

    this.logger.info(
      'UnifiedSnapshot',
      `Created local snapshot "${name}" for ${documentId}`
    );

    // Try to sync to server if online
    if (!this.syncFactory.isLocalMode()) {
      await this.syncSnapshotToServer(localSnapshot);
    }

    await this.updatePendingCount();
    return localSnapshot;
  }

  /**
   * Create snapshots for multiple documents at once.
   * Useful for auto-backup before import.
   *
   * @param documentIds Array of document element IDs
   * @param namePrefix Prefix for snapshot names
   * @returns Array of created snapshots
   */
  async createBulkSnapshots(
    documentIds: string[],
    namePrefix: string
  ): Promise<StoredSnapshot[]> {
    const snapshots: StoredSnapshot[] = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    for (const docId of documentIds) {
      try {
        const element = this.projectState.elements().find(e => e.id === docId);
        const name = `${namePrefix} - ${element?.name ?? docId} (${timestamp})`;
        const snapshot = await this.createSnapshot(docId, name);
        snapshots.push(snapshot);
      } catch (err) {
        this.logger.warn(
          'UnifiedSnapshot',
          `Failed to create backup snapshot for ${docId}`,
          err
        );
      }
    }

    return snapshots;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // List Snapshots
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * List all snapshots for a document.
   *
   * Returns merged list of local and server snapshots.
   *
   * @param documentId Document element ID
   * @returns Array of unified snapshots
   */
  async listSnapshots(documentId: string): Promise<UnifiedSnapshot[]> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    const projectKey = `${project.username}/${project.slug}`;

    // Get local snapshots
    const localSnapshots = await this.localSnapshots.listSnapshotsForDocument(
      projectKey,
      documentId
    );

    // Get server snapshots if online
    let serverSnapshots: DocumentSnapshot[] = [];
    if (!this.syncFactory.isLocalMode()) {
      try {
        serverSnapshots = await firstValueFrom(
          this.snapshotsApi.listProjectSnapshots(project.username, project.slug)
        );
        // Filter to just this document
        serverSnapshots = serverSnapshots.filter(
          s => s.documentId === documentId
        );
      } catch (err) {
        this.logger.warn(
          'UnifiedSnapshot',
          'Failed to fetch server snapshots',
          err
        );
      }
    }

    // Merge local and server snapshots
    return this.mergeSnapshots(localSnapshots, serverSnapshots);
  }

  /**
   * List all snapshots for the current project.
   *
   * @returns Array of unified snapshots
   */
  async listProjectSnapshots(): Promise<UnifiedSnapshot[]> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    const projectKey = `${project.username}/${project.slug}`;

    // Get local snapshots
    const localSnapshots =
      await this.localSnapshots.listSnapshotsForProject(projectKey);

    // Get server snapshots if online
    let serverSnapshots: DocumentSnapshot[] = [];
    if (!this.syncFactory.isLocalMode()) {
      try {
        serverSnapshots = await firstValueFrom(
          this.snapshotsApi.listProjectSnapshots(project.username, project.slug)
        );
      } catch (err) {
        this.logger.warn(
          'UnifiedSnapshot',
          'Failed to fetch server snapshots',
          err
        );
      }
    }

    // Merge local and server snapshots
    return this.mergeSnapshots(localSnapshots, serverSnapshots);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Get Snapshot
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get full snapshot data for restore.
   *
   * Tries local first, then server.
   *
   * @param snapshotId Snapshot ID (local composite ID or server ID)
   * @returns Full snapshot data or undefined
   */
  async getSnapshotForRestore(
    snapshotId: string
  ): Promise<StoredSnapshot | undefined> {
    // Try local first
    const localSnapshot = await this.localSnapshots.getSnapshotById(snapshotId);
    if (localSnapshot) {
      return localSnapshot;
    }

    // Try to fetch from server
    const project = this.projectState.project();
    if (project && !this.syncFactory.isLocalMode()) {
      try {
        const serverSnapshot = await firstValueFrom(
          this.snapshotsApi.previewProjectSnapshot(
            project.username,
            project.slug,
            snapshotId
          )
        );

        // Convert to StoredSnapshot format
        return this.serverSnapshotToLocal(serverSnapshot);
      } catch (err) {
        this.logger.warn(
          'UnifiedSnapshot',
          `Failed to fetch snapshot ${snapshotId} from server`,
          err
        );
      }
    }

    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Restore Snapshot
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Restore a document from a snapshot.
   *
   * This applies the snapshot's content to the document using forward
   * CRDT operations - clearing existing content and inserting new content.
   * This is the CRDT-correct way to "restore" - it maintains the forward
   * operation chain so other collaborators' clients will properly merge.
   *
   * @param documentId Document element ID
   * @param snapshotId Snapshot ID to restore from
   * @returns Whether restore was successful
   */
  async restoreFromSnapshot(
    documentId: string,
    snapshotId: string
  ): Promise<boolean> {
    const snapshot = await this.getSnapshotForRestore(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    // Get project info for element ID extraction
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    // Extract the element ID from documentId (which may be full ID or just element ID)
    const expectedPrefix = `${project.username}:${project.slug}:`;
    const elementId = documentId.startsWith(expectedPrefix)
      ? documentId.slice(expectedPrefix.length)
      : documentId;

    // Verify snapshot belongs to this document (compare element IDs)
    const snapshotElementId = snapshot.documentId.startsWith(expectedPrefix)
      ? snapshot.documentId.slice(expectedPrefix.length)
      : snapshot.documentId;

    if (snapshotElementId !== elementId) {
      throw new Error(
        `Snapshot ${snapshotId} is for document ${snapshot.documentId}, not ${documentId}`
      );
    }

    // Check if this is a worldbuilding element
    const element = this.projectState.elements().find(e => e.id === elementId);
    const isWorldbuilding = element && this.isWorldbuildingType(element.type);

    // Restore prose content if available
    if (snapshot.xmlContent) {
      const ydoc = await this.getDocumentYDoc(documentId);
      if (ydoc) {
        const prosemirror = ydoc.getXmlFragment('prosemirror');
        applyXmlToFragment(ydoc, prosemirror, snapshot.xmlContent);
        this.logger.info(
          'UnifiedSnapshot',
          `Restored document ${elementId} from snapshot "${snapshot.name}" using XML content`
        );
      } else if (!isWorldbuilding) {
        // For non-WB elements, prose content is required
        throw new Error(`Document ${elementId} not found or not loaded`);
      }
    } else if (!isWorldbuilding) {
      // For non-WB elements, must have content to restore
      throw new Error(`Snapshot ${snapshotId} has no content to restore`);
    }

    // Restore worldbuilding data if available
    if (snapshot.worldbuildingData && isWorldbuilding) {
      this.logger.debug(
        'UnifiedSnapshot',
        `Restoring worldbuilding data for ${elementId}`,
        { worldbuildingData: snapshot.worldbuildingData }
      );
      const wbYdoc = this.getWorldbuildingYDoc(elementId);
      if (wbYdoc) {
        const dataMap = wbYdoc.getMap<unknown>('worldbuilding');
        this.logger.debug(
          'UnifiedSnapshot',
          `Before restore - dataMap contents:`,
          { dataMapBefore: dataMap.toJSON() }
        );
        applyJsonToYjsMap(wbYdoc, dataMap, snapshot.worldbuildingData);
        this.logger.debug(
          'UnifiedSnapshot',
          `After restore - dataMap contents:`,
          { dataMapAfter: dataMap.toJSON() }
        );
        this.logger.info(
          'UnifiedSnapshot',
          `Restored worldbuilding data for ${elementId}`
        );
      } else {
        throw new Error(
          `Worldbuilding document ${elementId} not found or not loaded`
        );
      }
    } else if (isWorldbuilding && !snapshot.worldbuildingData) {
      this.logger.warn(
        'UnifiedSnapshot',
        `No worldbuilding data in snapshot for WB element ${elementId}`
      );
    }

    return true;
  }

  /**
   * Restore document content from XML string directly.
   *
   * Used by import to restore document content using forward CRDT operations.
   * This is the CRDT-correct way to apply imported content.
   *
   * @param documentId Document element ID
   * @param xmlContent Document content as XML string
   * @param worldbuildingData Optional worldbuilding data as JSON
   */
  async restoreFromContent(
    documentId: string,
    xmlContent: string,
    worldbuildingData?: Record<string, unknown>
  ): Promise<void> {
    // Get or create the document's Yjs doc
    const ydoc = await this.getDocumentYDoc(documentId);
    if (!ydoc) {
      throw new Error(`Document ${documentId} not found or not loaded`);
    }

    // Apply the XML content as forward CRDT operations
    const prosemirror = ydoc.getXmlFragment('prosemirror');
    applyXmlToFragment(ydoc, prosemirror, xmlContent);

    this.logger.debug(
      'UnifiedSnapshot',
      `Applied XML content to document ${documentId}`
    );

    // Handle worldbuilding data if present
    if (worldbuildingData) {
      const wbYdoc = this.getWorldbuildingYDoc(documentId);
      if (wbYdoc) {
        const dataMap = wbYdoc.getMap<unknown>('worldbuilding');
        applyJsonToYjsMap(wbYdoc, dataMap, worldbuildingData);
        this.logger.debug(
          'UnifiedSnapshot',
          `Applied worldbuilding data to ${documentId}`
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Delete Snapshot
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Delete a snapshot.
   *
   * Deletes from local storage and server (if synced and online).
   *
   * @param snapshotId Snapshot ID
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    // Get local snapshot to check if it's synced
    const localSnapshot = await this.localSnapshots.getSnapshotById(snapshotId);

    // Delete from local storage
    await this.localSnapshots.deleteSnapshotById(snapshotId);

    // Delete from server if synced and online
    if (
      localSnapshot?.synced &&
      localSnapshot.serverId &&
      !this.syncFactory.isLocalMode()
    ) {
      try {
        await firstValueFrom(
          this.snapshotsApi.deleteProjectSnapshot(
            project.username,
            project.slug,
            localSnapshot.serverId
          )
        );
      } catch (err) {
        this.logger.warn(
          'UnifiedSnapshot',
          `Failed to delete snapshot from server: ${localSnapshot.serverId}`,
          err
        );
      }
    }

    // If it was only a server snapshot (snapshotId is the server ID)
    if (!localSnapshot && !this.syncFactory.isLocalMode()) {
      try {
        await firstValueFrom(
          this.snapshotsApi.deleteProjectSnapshot(
            project.username,
            project.slug,
            snapshotId
          )
        );
      } catch (err) {
        this.logger.warn(
          'UnifiedSnapshot',
          `Failed to delete server snapshot: ${snapshotId}`,
          err
        );
      }
    }

    await this.updatePendingCount();
    this.logger.info('UnifiedSnapshot', `Deleted snapshot ${snapshotId}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sync Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Sync all pending snapshots to server.
   *
   * Called when coming back online or periodically.
   */
  async syncPendingSnapshots(): Promise<void> {
    if (this.syncFactory.isLocalMode()) {
      return;
    }

    const project = this.projectState.project();
    if (!project) {
      return;
    }

    this.isSyncing.set(true);

    try {
      const unsynced = await this.localSnapshots.getUnsyncedSnapshots();
      const projectKey = `${project.username}/${project.slug}`;

      // Filter to current project
      const projectUnsynced = unsynced.filter(s =>
        s.id.startsWith(`${projectKey}:`)
      );

      for (const snapshot of projectUnsynced) {
        await this.syncSnapshotToServer(snapshot);
      }

      await this.updatePendingCount();
      this.logger.info(
        'UnifiedSnapshot',
        `Synced ${projectUnsynced.length} snapshots to server`
      );
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Sync a single snapshot to server.
   *
   * Note: Server API still uses yDocState format. For new-format snapshots
   * (with xmlContent), we skip syncing until the backend is updated.
   */
  private async syncSnapshotToServer(snapshot: StoredSnapshot): Promise<void> {
    const project = this.projectState.project();
    if (!project || this.syncFactory.isLocalMode()) {
      return;
    }

    // Sync to server
    try {
      const request: CreateSnapshotRequest = {
        documentId: snapshot.documentId,
        name: snapshot.name,
        description: snapshot.description,
        xmlContent: snapshot.xmlContent,
        worldbuildingData: snapshot.worldbuildingData,
        wordCount: snapshot.wordCount,
        metadata: snapshot.metadata as Record<string, unknown>,
      };

      const serverSnapshot = await firstValueFrom(
        this.snapshotsApi.createProjectSnapshot(
          project.username,
          project.slug,
          request
        )
      );

      // Mark as synced with server ID
      await this.localSnapshots.markSynced(snapshot.id, serverSnapshot.id);

      this.logger.debug(
        'UnifiedSnapshot',
        `Synced snapshot ${snapshot.id} to server as ${serverSnapshot.id}`
      );
    } catch (err) {
      this.logger.warn(
        'UnifiedSnapshot',
        `Failed to sync snapshot ${snapshot.id} to server`,
        err
      );
      // Don't throw - we'll try again later
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Export/Import Support
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all snapshots for export.
   *
   * @returns Array of snapshots with full data for archiving
   */
  async getSnapshotsForExport(): Promise<StoredSnapshot[]> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    const projectKey = `${project.username}/${project.slug}`;
    return this.localSnapshots.getSnapshotsForExport(projectKey);
  }

  /**
   * Import snapshots from archive.
   *
   * @param snapshots Array of snapshot data from archive
   */
  async importSnapshots(
    snapshots: Array<{
      documentId: string;
      name: string;
      description?: string;
      xmlContent?: string;
      worldbuildingData?: Record<string, unknown>;
      wordCount?: number;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }>
  ): Promise<StoredSnapshot[]> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    const projectKey = `${project.username}/${project.slug}`;
    const imported: StoredSnapshot[] = [];

    for (const snapshot of snapshots) {
      const stored = await this.localSnapshots.importSnapshot(
        projectKey,
        snapshot
      );
      imported.push(stored);
    }

    // Try to sync to server if online
    if (!this.syncFactory.isLocalMode()) {
      await this.syncPendingSnapshots();
    }

    return imported;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update the pending sync count signal.
   */
  private async updatePendingCount(): Promise<void> {
    try {
      const unsynced = await this.localSnapshots.getUnsyncedSnapshots();
      this.pendingCount.set(unsynced.length);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get the Yjs document for a prose document.
   * @param documentId - The document ID, can be either:
   *   - Element ID only (e.g., 'char-elara')
   *   - Full document ID (e.g., 'username:slug:char-elara')
   */
  private getDocumentYDoc(documentId: string): Promise<Y.Doc | null> {
    const project = this.projectState.project();
    if (!project) {
      return Promise.resolve(null);
    }

    // Check if documentId already has the full prefix
    const expectedPrefix = `${project.username}:${project.slug}:`;
    const fullDocId = documentId.startsWith(expectedPrefix)
      ? documentId
      : `${expectedPrefix}${documentId}`;

    return this.documentService.getYDoc(fullDocId);
  }

  /**
   * Get the Yjs document for worldbuilding data.
   */
  private getWorldbuildingYDoc(elementId: string): Y.Doc | null {
    const project = this.projectState.project();
    if (!project) {
      return null;
    }
    return this.worldbuildingService.getYDoc(
      elementId,
      project.username,
      project.slug
    );
  }

  /**
   * Check if an element type is a worldbuilding type.
   */
  private isWorldbuildingType(type: string): boolean {
    return type === 'WORLDBUILDING';
  }

  /**
   * Calculate word count from a Yjs document.
   */
  private calculateWordCount(ydoc: Y.Doc): number {
    try {
      const prosemirror = ydoc.getXmlFragment('prosemirror');
      // Extract text content from XmlFragment by recursively getting text nodes
      const text = this.extractTextFromXmlFragment(prosemirror);
      // Simple word count - split on whitespace
      return text.split(/\s+/).filter(w => w.length > 0).length;
    } catch {
      return 0;
    }
  }

  /**
   * Recursively extract text content from an XmlFragment or XmlElement.
   */
  private extractTextFromXmlFragment(
    node: Y.XmlFragment | Y.XmlElement
  ): string {
    let text = '';
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText) {
        text += child.toString();
      } else if (
        child instanceof Y.XmlElement ||
        child instanceof Y.XmlFragment
      ) {
        text += this.extractTextFromXmlFragment(child);
      }
    }
    return text;
  }

  /**
   * Merge local and server snapshots into unified list.
   */
  private mergeSnapshots(
    local: SnapshotInfo[],
    server: DocumentSnapshot[]
  ): UnifiedSnapshot[] {
    const merged: UnifiedSnapshot[] = [];
    const serverIdsSeen = new Set<string>();

    // Add local snapshots first
    for (const snap of local) {
      merged.push({
        id: snap.id,
        documentId: snap.documentId,
        name: snap.name,
        description: snap.description,
        wordCount: snap.wordCount,
        createdAt: snap.createdAt,
        isLocal: true,
        isSynced: snap.synced,
        serverId: snap.serverId,
      });

      if (snap.serverId) {
        serverIdsSeen.add(snap.serverId);
      }
    }

    // Add server-only snapshots
    for (const snap of server) {
      if (!serverIdsSeen.has(snap.id)) {
        merged.push({
          id: snap.id,
          documentId: snap.documentId,
          name: snap.name,
          description: snap.description ?? undefined,
          wordCount: snap.wordCount ?? undefined,
          createdAt: snap.createdAt,
          isLocal: false,
          isSynced: true,
          serverId: snap.id,
        });
      }
    }

    // Sort by creation time, newest first
    return merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Convert server snapshot to local format.
   *
   * Server snapshots use the legacy yDocState format. We convert them
   * to StoredSnapshot with empty xmlContent for now, since restore
   * will fall back to using yDocState if xmlContent is empty.
   */
  /**
   * Convert server snapshot to local format.
   */
  private serverSnapshotToLocal(
    server: SnapshotWithContent
  ): StoredSnapshot | undefined {
    return {
      id: server.id,
      projectKey: '', // Not available from server
      documentId: server.documentId,
      name: server.name,
      description: server.description ?? undefined,
      xmlContent: server.xmlContent ?? '',
      worldbuildingData: server.worldbuildingData as
        | Record<string, unknown>
        | undefined,
      wordCount: server.wordCount ?? undefined,
      metadata: server.metadata as Record<string, unknown> | undefined,
      createdAt: server.createdAt,
      synced: true,
      serverId: server.id,
    };
  }
}
