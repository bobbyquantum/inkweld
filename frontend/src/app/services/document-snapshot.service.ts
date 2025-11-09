import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateSnapshotRequest,
  SnapshotsService,
  DocumentSnapshot,
  SnapshotWithContent,
  MessageResponse,
} from '../../api-client';
import type { DocumentSnapshotControllerDeleteSnapshot200Response } from '../../api-client/model/document-snapshot-controller-delete-snapshot200-response';
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

    return this.snapshotsApi.postApiSnapshotsUsernameSlug(
      project.username,
      project.slug,
      data
    );
  }

  /**
   * List snapshots for a document
   * @param docId The document ID (without username:slug prefix)
   * @param query Optional query parameters for pagination and sorting
   * @returns Observable of paginated snapshots
   */
  listSnapshots(
    docId: string,
    query?: ListSnapshotsQuery
  ): Observable<DocumentSnapshot[]> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.getApiSnapshotsUsernameSlug(
      project.username,
      project.slug,
      docId,
      query?.limit,
      query?.offset,
      query?.orderBy,
      query?.order
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

    return this.snapshotsApi.getApiSnapshotsUsernameSlugSnapshotId(
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

    return this.snapshotsApi.postApiSnapshotsUsernameSlugSnapshotIdRestore(
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
  ): Observable<DocumentSnapshotControllerDeleteSnapshot200Response> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.deleteApiSnapshotsUsernameSlugSnapshotId(
      project.username,
      project.slug,
      snapshotId
    ) as Observable<DocumentSnapshotControllerDeleteSnapshot200Response>;
  }

  /**
   * Preview a snapshot as HTML
   * Note: Generated API has incorrect parameter order (snapshotId, docId, slug, username)
   * Returns plain HTML string, not an object
   * @param docId The document ID (needed to construct the API path)
   * @param snapshotId The snapshot ID
   * @returns Observable of HTML string
   */
  previewSnapshot(docId: string, snapshotId: string): Observable<string> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.getApiSnapshotsUsernameSlugSnapshotIdPreview(
      project.username,
      project.slug,
      snapshotId
    ) as Observable<string>;
  }
}







