import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateSnapshotDto,
  DocumentSnapshotsAPIService,
  PaginatedSnapshotsDto,
  RestoreSnapshotDto,
  SnapshotDto,
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
  private snapshotsApi = inject(DocumentSnapshotsAPIService);
  private projectState = inject(ProjectStateService);

  /**
   * Create a new snapshot of a document
   * @param docId The document ID (without username:slug prefix)
   * @param data The snapshot data (name and optional description)
   * @returns Observable of the created snapshot
   */
  createSnapshot(
    docId: string,
    data: CreateSnapshotDto
  ): Observable<SnapshotDto> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.documentSnapshotControllerCreateSnapshot(
      project.username,
      project.slug,
      docId,
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
  ): Observable<PaginatedSnapshotsDto> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.documentSnapshotControllerListSnapshots(
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
  getSnapshot(docId: string, snapshotId: string): Observable<SnapshotDto> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    // OpenAPI generator bug - parameters are in wrong order
    return this.snapshotsApi.documentSnapshotControllerGetSnapshot(
      snapshotId,
      docId,
      project.slug,
      project.username
    );
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
  ): Observable<RestoreSnapshotDto> {
    const project = this.projectState.project();
    if (!project) {
      throw new Error('No active project');
    }

    return this.snapshotsApi.documentSnapshotControllerRestoreSnapshot(
      project.username,
      project.slug,
      docId,
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

    // OpenAPI generator bug - parameters are in wrong order
    return this.snapshotsApi.documentSnapshotControllerDeleteSnapshot(
      snapshotId,
      docId,
      project.slug,
      project.username
    );
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

    // OpenAPI generator bug - parameters are in wrong order
    return this.snapshotsApi.documentSnapshotControllerPreviewSnapshot(
      snapshotId,
      docId,
      project.slug,
      project.username
    );
  }
}
