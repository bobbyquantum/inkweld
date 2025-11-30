import { inject, Injectable } from '@angular/core';
import {
  CreateSnapshotRequest,
  DocumentSnapshot,
  MessageResponse,
  SnapshotsService,
  SnapshotWithContent,
} from '@inkweld/index';
import { Observable } from 'rxjs';

import { ProjectStateService } from './project-state.service';

/**
 * Query parameters for listing snapshots
 */
export interface ListSnapshotsQuery {
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'name';
  order?: 'ASC' | 'DESC';
}

/**
 * Service for managing document snapshots
 * Wraps the generated API client with project context and convenience methods
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentSnapshotService {
  private snapshotsApi = inject(SnapshotsService);
  private projectState = inject(ProjectStateService);

  /**
   * Create a new snapshot of a document
   * @param docId The document ID (without username:slug prefix)
   * @param data The snapshot data (name and optional description)
   * @returns Observable of the created snapshot
   */
  createSnapshot(
    docId: string,
    data: CreateSnapshotRequest
  ): Observable<DocumentSnapshot> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.createProjectSnapshot(
      project.username,
      project.slug,
      data
    );
  }

  /**
   * List snapshots for a document
   * @param _docId The document ID (without username:slug prefix)
   * @param _query Optional query parameters for pagination and sorting
   * @returns Observable of paginated snapshots
   */
  listSnapshots(
    _docId: string,
    _query?: ListSnapshotsQuery
  ): Observable<DocumentSnapshot[]> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    // TODO: Backend API doesn't support query parameters yet (limit, offset, orderBy, order, docId)
    // The API returns all snapshots for a project, not filtered by docId
    return this.snapshotsApi.listProjectSnapshots(
      project.username,
      project.slug
    );
  }

  /**
   * Get a single snapshot by ID
   * Note: Generated API has incorrect parameter order (snapshotId, docId, slug, username)
   * @param docId The document ID (needed to construct the API path)
   * @param snapshotId The snapshot ID
   * @returns Observable of the snapshot
   */
  getSnapshot(docId: string, snapshotId: string): Observable<DocumentSnapshot> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.getProjectSnapshot(
      project.username,
      project.slug,
      snapshotId
    ) as Observable<DocumentSnapshot>;
  }

  /**
   * Restore a document from a snapshot
   * @param docId The document ID (without username:slug prefix)
   * @param snapshotId The snapshot ID to restore from
   * @returns Observable of the restore result
   */
  restoreSnapshot(
    docId: string,
    snapshotId: string
  ): Observable<MessageResponse> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.restoreProjectSnapshot(
      project.username,
      project.slug,
      snapshotId
    );
  }

  /**
   * Delete a snapshot
   * Note: Generated API has incorrect parameter order (snapshotId, docId, slug, username)
   * @param docId The document ID (needed to construct the API path)
   * @param snapshotId The snapshot ID to delete
   * @returns Observable of the delete result
   */
  deleteSnapshot(
    docId: string,
    snapshotId: string
  ): Observable<MessageResponse> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.deleteProjectSnapshot(
      project.username,
      project.slug,
      snapshotId
    );
  }

  /**
   * Preview a snapshot as HTML
   * Note: API now returns SnapshotWithContent, not HTML directly
   * @param docId The document ID (needed to construct the API path)
   * @param snapshotId The snapshot ID
   * @returns Observable of SnapshotWithContent (contains yDocState, not HTML)
   */
  previewSnapshot(
    docId: string,
    snapshotId: string
  ): Observable<SnapshotWithContent> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.previewProjectSnapshot(
      project.username,
      project.slug,
      snapshotId
    );
  }
}
