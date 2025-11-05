import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Y from 'yjs';
import { DocumentSnapshotEntity } from './document-snapshot.entity.js';
import { ProjectEntity } from '../project.entity.js';
import { UserEntity } from '../../user/user.entity.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { DocumentRendererService } from '../document/document-renderer.service.js';
import {
  CreateSnapshotDto,
  SnapshotDto,
  ListSnapshotsQuery,
  PaginatedSnapshotsDto,
  RestoreSnapshotDto,
} from './document-snapshot.dto.js';

/**
 * Service for managing document snapshots
 * Handles creation, restoration, and querying of document version snapshots
 */
@Injectable()
export class DocumentSnapshotService {
  private readonly logger = new Logger(DocumentSnapshotService.name);

  constructor(
    @InjectRepository(DocumentSnapshotEntity)
    private snapshotRepository: Repository<DocumentSnapshotEntity>,
    @InjectRepository(ProjectEntity)
    private projectRepository: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private levelDBManager: LevelDBManagerService,
    private documentRenderer: DocumentRendererService,
  ) {}

  /**
   * Create a snapshot of the current document state
   */
  async createSnapshot(
    username: string,
    projectSlug: string,
    docId: string,
    userId: string,
    data: CreateSnapshotDto,
  ): Promise<SnapshotDto> {
    this.logger.log(
      `Creating snapshot for ${username}/${projectSlug}/docs/${docId}`,
    );

    // 1. Get project and verify it exists
    const project = await this.getProjectOrFail(username, projectSlug);

    // 2. Get user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 3. Verify user has access to project (project owner or collaborator)
    if (project.user.id !== userId) {
      // TODO: Add collaborator check when that feature exists
      throw new ForbiddenException('You do not have access to this project');
    }

    // 4. Load current Yjs document
    // The docId parameter is the FULL document ID from the URL path
    const documentId = docId;

    this.logger.debug(`Creating snapshot for document "${documentId}" (username="${username}", projectSlug="${projectSlug}", docId="${docId}")`);

    const db = await this.levelDBManager.getProjectDatabase(
      username,
      projectSlug,
    );
    const ydoc = await db.getYDoc(documentId);

    // 5. Encode Yjs state and state vector
    const yDocState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const stateVector = Buffer.from(Y.encodeStateVector(ydoc));

    // 6. Calculate word count
    const wordCount = this.calculateWordCount(ydoc);

    // 7. Save snapshot
    const snapshot = this.snapshotRepository.create({
      documentId,
      project,
      user,
      name: data.name,
      description: data.description,
      yDocState,
      stateVector,
      wordCount,
      metadata: {},
    });

    await this.snapshotRepository.save(snapshot);

    this.logger.log(`Created snapshot ${snapshot.id} for document ${documentId}`);

    return this.toDto(snapshot);
  }

  /**
   * List all snapshots for a document
   */
  async listSnapshots(
    _username: string,
    _projectSlug: string,
    docId: string,
    query: ListSnapshotsQuery,
  ): Promise<PaginatedSnapshotsDto> {
    // The docId parameter is the FULL document ID from the URL path
    const documentId = docId;

    this.logger.log(`Listing snapshots for document ${documentId}`);

    // Validate limit doesn't exceed maximum
    const limit = Math.min(query.limit || 50, 100);

    const [snapshots, total] = await this.snapshotRepository.findAndCount({
      where: { documentId },
      relations: ['user'],
      order: { [query.orderBy || 'createdAt']: query.order || 'DESC' },
      take: limit,
      skip: query.offset || 0,
    });

    return {
      snapshots: snapshots.map((s) => this.toDto(s)),
      total,
      limit,
      offset: query.offset || 0,
    };
  }

  /**
   * Get a specific snapshot by ID
   */
  async getSnapshot(snapshotId: string): Promise<SnapshotDto> {
    const snapshot = await this.getSnapshotOrFail(snapshotId);
    return this.toDto(snapshot);
  }

  /**
   * Restore a document to a previous snapshot
   */
  async restoreSnapshot(
    username: string,
    projectSlug: string,
    docId: string,
    snapshotId: string,
    userId: string,
  ): Promise<RestoreSnapshotDto> {
    this.logger.log(
      `Restoring snapshot ${snapshotId} to ${username}/${projectSlug}/docs/${docId}`,
    );

    // 1. Load snapshot
    const snapshot = await this.getSnapshotOrFail(snapshotId);

    // 2. The docId parameter is the FULL document ID from the URL path
    // (e.g., "test:test44444:documentId" which includes colons)
    // Do NOT prepend username:projectSlug as that would duplicate it
    const documentId = docId;

    // Debug: Log what we're comparing
    this.logger.debug(`Comparing snapshot.documentId="${snapshot.documentId}" with received docId="${documentId}"`);

    // 3. Verify document match
    if (snapshot.documentId !== documentId) {
      this.logger.error(
        `Document ID mismatch! Snapshot has "${snapshot.documentId}" but received "${documentId}"`
      );
      throw new BadRequestException(
        'Snapshot does not belong to this document',
      );
    }

    // 4. Verify user has write access
    if (snapshot.project.user.id !== userId) {
      // TODO: Add collaborator check when that feature exists
      throw new ForbiddenException(
        'You do not have permission to restore this snapshot',
      );
    }

    // 5. Get current document from LevelDB
    const db = await this.levelDBManager.getProjectDatabase(
      username,
      projectSlug,
    );
    const ydoc = await db.getYDoc(documentId);

    // 6. Import the docs Map from y-websocket-utils to get the live document
    const { docs } = await import('../document/y-websocket-utils.js');

    // Check if there's a live WebSocket document for this ID
    const liveDoc = docs.get(documentId);

    if (liveDoc) {
      // Document has active connections - apply update to live doc so it broadcasts
      this.logger.log(`Applying snapshot to live document ${documentId} with ${liveDoc.conns.size} active connections`);

      // Debug: Log snapshot size
      this.logger.debug(`Snapshot state size: ${snapshot.yDocState.length} bytes, word count: ${snapshot.wordCount}`);

      // To restore a snapshot in Yjs, we need to work with CRDT semantics
      // The correct approach: Completely replace the document state by:
      // 1. Destroying the current document's internal state
      // 2. Applying the snapshot state to a fresh doc
      // 3. Using the y-leveldb persistence to ensure it's saved

      // To restore a snapshot in a CRDT system where updates are already distributed:
      // 1. We CANNOT just apply the old update (Yjs will ignore it - already seen those client IDs)
      // 2. We MUST create NEW updates that transform current state to snapshot state
      // 3. These updates will be broadcast to all connected clients

      // Load snapshot into temp doc to inspect its content
      const snapshotDoc = new Y.Doc();
      Y.applyUpdate(snapshotDoc, new Uint8Array(snapshot.yDocState));
      const snapshotFragment = snapshotDoc.getXmlFragment('prosemirror');

      this.logger.debug(`Snapshot fragment length: ${snapshotFragment.length}`);
      this.logger.debug(`Snapshot fragment toString: ${snapshotFragment.toString().substring(0, 200)}`);

      // Get current live doc state
      const liveFragment = liveDoc.getXmlFragment('prosemirror');
      this.logger.debug(`Live doc fragment length BEFORE restore: ${liveFragment.length}`);

      // Perform the restore in a single transaction
      // This creates ONE update that will be broadcast to all clients
      liveDoc.transact(() => {
        // 1. Clear all existing content
        while (liveFragment.length > 0) {
          liveFragment.delete(0, liveFragment.length);
        }

        // 2. Manually reconstruct the snapshot content
        // We need to clone the XML structure from the snapshot
        snapshotFragment.forEach((item) => {
          // Clone each top-level element from the snapshot
          const cloned = item.clone();
          liveFragment.push([cloned]);
        });
      });

      this.logger.debug(`Live doc fragment length AFTER restore: ${liveFragment.length}`);
      this.logger.debug(`Live doc fragment toString: ${liveFragment.toString().substring(0, 200)}`);

      // The update will be automatically persisted to LevelDB via the persistence binding
      // and broadcast to all connected WebSocket clients via the updateHandler
    } else {
      // No active connections - update LevelDB document directly
      this.logger.log(`No active connections for ${documentId}, updating LevelDB directly`);

      // Clear the document first
      ydoc.transact(() => {
        const fragment = ydoc.getXmlFragment('prosemirror');
        // Delete all existing content
        while (fragment.length > 0) {
          fragment.delete(0, fragment.length);
        }
      });

      // Apply the snapshot state
      Y.applyUpdate(ydoc, new Uint8Array(snapshot.yDocState));

      // Persist to LevelDB
      await db.storeUpdate(documentId, Y.encodeStateAsUpdate(ydoc));
    }

    this.logger.log(`Successfully restored document ${documentId} from snapshot ${snapshotId}`);

    return {
      success: true,
      documentId,
      restoredFrom: snapshotId,
      restoredAt: new Date().toISOString(),
    };
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(
    snapshotId: string,
    userId: string,
  ): Promise<{ success: boolean; deletedId: string }> {
    this.logger.log(`Deleting snapshot ${snapshotId}`);

    const snapshot = await this.getSnapshotOrFail(snapshotId);

    // Verify user has permission (creator or project owner)
    if (snapshot.user.id !== userId && snapshot.project.user.id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this snapshot',
      );
    }

    await this.snapshotRepository.remove(snapshot);

    this.logger.log(`Deleted snapshot ${snapshotId}`);

    return {
      success: true,
      deletedId: snapshotId,
    };
  }

  /**
   * Render a snapshot as HTML for preview
   */
  async renderSnapshotHtml(snapshotId: string): Promise<string> {
    this.logger.log(`Rendering snapshot ${snapshotId} as HTML`);

    const snapshot = await this.getSnapshotOrFail(snapshotId);

    // Create a temporary Y.Doc and apply the snapshot state
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(snapshot.yDocState));

    // Use the document renderer to convert to HTML
    const html = this.documentRenderer.renderDocumentAsHtml(
      ydoc,
      snapshot.name,
    );

    return html;
  }

  /**
   * Calculate word count from a Yjs document
   */
  private calculateWordCount(ydoc: Y.Doc): number {
    try {
      const fragment = ydoc.getXmlFragment('prosemirror');
      const text = this.extractText(fragment);
      const words = text.split(/\s+/).filter((w) => w.length > 0);
      return words.length;
    } catch (error) {
      this.logger.warn(`Failed to calculate word count: ${error}`);
      return 0;
    }
  }

  /**
   * Extract plain text from a ProseMirror XML fragment
   */
  private extractText(node: any): string {
    if (!node) return '';

    let text = '';

    // If it's a text node, return its content
    if (node.toString) {
      const nodeStr = node.toString();
      if (!nodeStr.startsWith('<')) {
        return nodeStr;
      }
    }

    // Recursively extract text from child nodes
    if (node.length !== undefined) {
      for (let i = 0; i < node.length; i++) {
        const child = node.get(i);
        text += this.extractText(child) + ' ';
      }
    }

    return text;
  }

  /**
   * Get project or throw 404
   */
  private async getProjectOrFail(
    username: string,
    projectSlug: string,
  ): Promise<ProjectEntity> {
    const project = await this.projectRepository.findOne({
      where: {
        slug: projectSlug,
        user: { username },
      },
      relations: ['user'],
    });

    if (!project) {
      throw new NotFoundException(
        `Project ${username}/${projectSlug} not found`,
      );
    }

    return project;
  }

  /**
   * Get snapshot or throw 404
   */
  private async getSnapshotOrFail(
    snapshotId: string,
  ): Promise<DocumentSnapshotEntity> {
    const snapshot = await this.snapshotRepository.findOne({
      where: { id: snapshotId },
      relations: ['user', 'project', 'project.user'],
    });

    if (!snapshot) {
      throw new NotFoundException(`Snapshot ${snapshotId} not found`);
    }

    return snapshot;
  }

  /**
   * Convert entity to DTO
   */
  private toDto(snapshot: DocumentSnapshotEntity): SnapshotDto {
    return {
      id: snapshot.id,
      documentId: snapshot.documentId,
      name: snapshot.name,
      description: snapshot.description,
      wordCount: snapshot.wordCount,
      createdAt: snapshot.createdAt.toISOString(),
      createdBy: {
        id: snapshot.user.id,
        username: snapshot.user.username,
      },
      metadata: snapshot.metadata,
    };
  }
}
