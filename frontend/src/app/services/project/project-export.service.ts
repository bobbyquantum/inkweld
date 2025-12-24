import { inject, Injectable, signal } from '@angular/core';
import { Element, ElementType, ImagesService } from '@inkweld/index';
import JSZip from '@progress/jszip-esm';
import { firstValueFrom } from 'rxjs';

import { ElementRelationship } from '../../components/element-ref/element-ref.model';
import {
  ARCHIVE_VERSION,
  ArchiveDocumentContent,
  ArchiveElement,
  ArchiveManifest,
  ArchiveMediaFile,
  ArchiveProgress,
  ArchiveSnapshot,
  ArchiveWorldbuildingData,
  ExportPhase,
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../../models/project-archive';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { OfflineSnapshotService } from '../offline/offline-snapshot.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';

/**
 * Worldbuilding element types that have their own Yjs documents.
 */
const WORLDBUILDING_TYPES = [ElementType.Worldbuilding];

/**
 * Check if an element type is a worldbuilding type.
 */
function isWorldbuildingType(type: ElementType): boolean {
  return WORLDBUILDING_TYPES.includes(type);
}

/**
 * Service for exporting projects to archive files.
 *
 * Export behavior:
 * - Server mode: Ensures all documents are synced and downloads media from server before packaging
 * - Offline mode: Everything is already local, just packages it up
 *
 * The export creates a ZIP file containing:
 * - manifest.json - Archive metadata
 * - project.json - Project info
 * - elements.json - Element tree
 * - documents.json - Document content (ProseMirror JSON)
 * - worldbuilding.json - Worldbuilding data
 * - schemas.json - Worldbuilding templates
 * - relationships.json - Element relationships
 * - relationship-types.json - Custom relationship types
 * - publish-plans.json - Publish plans
 * - media/ - Media files (cover, inline images)
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectExportService {
  private logger = inject(LoggerService);
  private projectState = inject(ProjectStateService);
  private documentService = inject(DocumentService);
  private worldbuildingService = inject(WorldbuildingService);
  private offlineElements = inject(OfflineProjectElementsService);
  private offlineStorage = inject(OfflineStorageService);
  private offlineSnapshots = inject(OfflineSnapshotService);
  private syncFactory = inject(ElementSyncProviderFactory);
  private imagesService = inject(ImagesService);

  /** Current export progress */
  readonly progress = signal<ArchiveProgress>({
    phase: ExportPhase.Initializing,
    progress: 0,
    message: 'Ready',
  });

  /** Whether an export is in progress */
  readonly isExporting = signal(false);

  /** Error from last export attempt */
  readonly error = signal<string | undefined>(undefined);

  /**
   * Export the current project to a ZIP archive.
   *
   * @throws ProjectArchiveError if export fails
   */
  async exportProject(): Promise<void> {
    const project = this.projectState.project();
    if (!project) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'No project is currently loaded'
      );
    }

    const { username, slug } = project;
    if (!username || !slug) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'Project must have username and slug'
      );
    }

    this.isExporting.set(true);
    this.error.set(undefined);

    try {
      const isOffline = this.syncFactory.isOfflineMode();
      const projectKey = `${username}/${slug}`;

      // Phase 1: In server mode, ensure everything is synced
      if (!isOffline) {
        this.ensureDocumentsSynced(username, slug);
        await this.ensureMediaDownloaded(username, slug, projectKey);
      }

      // Phase 2: Gather all project data
      this.updateProgress(
        ExportPhase.PackagingElements,
        20,
        'Packaging elements...'
      );
      const elements = await this.getElements(username, slug);

      this.updateProgress(
        ExportPhase.PackagingDocuments,
        35,
        'Packaging documents...'
      );
      const documents = await this.getDocumentContent(elements, username, slug);

      this.updateProgress(
        ExportPhase.PackagingWorldbuilding,
        50,
        'Packaging worldbuilding data...'
      );
      const worldbuilding = await this.getWorldbuildingData(
        elements,
        username,
        slug
      );

      // Get additional project data
      const schemas = await this.getSchemas();
      const relationships = await this.getRelationships(username, slug);
      const customRelationshipTypes = await this.getCustomRelationshipTypes(
        username,
        slug
      );
      const tags = await this.getTags(username, slug);
      const elementTags = await this.getElementTags(username, slug);
      const publishPlans = await this.getPublishPlans(username, slug);

      // Phase 3: Get snapshots
      this.updateProgress(
        ExportPhase.PackagingSnapshots,
        55,
        'Packaging snapshots...'
      );
      const snapshots = await this.getSnapshots(projectKey);

      // Phase 4: Get media files
      this.updateProgress(
        ExportPhase.PackagingMedia,
        65,
        'Packaging media files...'
      );
      const { mediaManifest, mediaBlobs } =
        await this.getMediaFiles(projectKey);

      // Phase 5: Create archive
      this.updateProgress(
        ExportPhase.CreatingArchive,
        80,
        'Creating archive...'
      );

      const archive: ProjectArchive = {
        manifest: this.createManifest(project.title, slug),
        project: {
          title: project.title,
          description: project.description ?? undefined,
          slug: slug,
          hasCover: mediaManifest.some(m => m.mediaId === 'cover'),
        },
        elements: elements.map(e => this.elementToArchive(e)),
        documents,
        worldbuilding,
        schemas,
        relationships,
        customRelationshipTypes,
        tags,
        elementTags,
        publishPlans,
        media: mediaManifest,
        snapshots,
      };

      // Create ZIP
      const zip = this.createZip(archive, mediaBlobs);

      // Generate filename and trigger download
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];
      const filename = `${slug}_${timestamp}.inkweld.zip`;

      this.updateProgress(ExportPhase.Complete, 100, 'Export complete!');
      await this.downloadZip(zip, filename);

      this.logger.info(
        'ProjectExport',
        `Exported project ${projectKey} to ${filename}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      this.error.set(message);
      this.logger.error('ProjectExport', 'Export failed', err);

      if (err instanceof ProjectArchiveError) {
        throw err;
      }
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.StorageError,
        message,
        err
      );
    } finally {
      this.isExporting.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sync Verification (Server Mode Only)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Ensure all documents are synced before export.
   * In server mode, we need to make sure we have the latest content.
   */
  private ensureDocumentsSynced(username: string, slug: string): void {
    this.updateProgress(
      ExportPhase.SyncingDocuments,
      5,
      'Checking document sync status...'
    );

    const elements = this.projectState.elements();
    const documentElements = elements.filter(e => e.type === ElementType.Item);

    // Check each document for unsynced changes
    const unsyncedDocs: string[] = [];
    for (const elem of documentElements) {
      const docId = `${username}:${slug}:${elem.id}`;
      if (this.documentService.hasUnsyncedChanges(docId)) {
        unsyncedDocs.push(elem.name);
      }
    }

    if (unsyncedDocs.length > 0) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.SyncRequired,
        `The following documents have unsynced changes: ${unsyncedDocs.join(', ')}. Please wait for sync to complete.`,
        { unsyncedDocs }
      );
    }

    this.logger.debug('ProjectExport', 'All documents are synced');
  }

  /**
   * Ensure all media is downloaded from server.
   * Downloads cover image if not already cached locally.
   */
  private async ensureMediaDownloaded(
    username: string,
    slug: string,
    projectKey: string
  ): Promise<void> {
    this.updateProgress(ExportPhase.DownloadingMedia, 10, 'Checking media...');

    // Check if we have the cover image locally
    const hasCover = await this.offlineStorage.hasMedia(projectKey, 'cover');
    if (!hasCover) {
      this.updateProgress(
        ExportPhase.DownloadingMedia,
        12,
        'Downloading cover image...'
      );
      try {
        // Download cover from server
        const coverBlob = await firstValueFrom(
          this.imagesService.getProjectCover(username, slug)
        );
        if (coverBlob) {
          await this.offlineStorage.saveMedia(
            projectKey,
            'cover',
            coverBlob,
            'cover.jpg'
          );
          this.logger.debug(
            'ProjectExport',
            'Downloaded cover image from server'
          );
        }
      } catch {
        // Cover might not exist, that's OK
        this.logger.debug('ProjectExport', 'No cover image on server');
      }
    }

    // For inline images, we assume they're already in IndexedDB if they exist
    // (they're uploaded when pasted and should be synced)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Gathering
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get project elements from the appropriate source.
   */
  private async getElements(
    username: string,
    slug: string
  ): Promise<Element[]> {
    if (this.syncFactory.isOfflineMode()) {
      await this.offlineElements.loadElements(username, slug);
      return this.offlineElements.elements();
    }
    return this.projectState.elements();
  }

  /**
   * Get document content for all ITEM elements.
   */
  private async getDocumentContent(
    elements: Element[],
    username: string,
    slug: string
  ): Promise<ArchiveDocumentContent[]> {
    const documents: ArchiveDocumentContent[] = [];
    const itemElements = elements.filter(e => e.type === ElementType.Item);

    for (let i = 0; i < itemElements.length; i++) {
      const elem = itemElements[i];
      this.updateProgress(
        ExportPhase.PackagingDocuments,
        35 + (15 * i) / itemElements.length,
        'Packaging documents...',
        `Document ${i + 1} of ${itemElements.length}`,
        i,
        itemElements.length
      );

      const docId = `${username}:${slug}:${elem.id}`;
      try {
        const content = await this.documentService.getDocumentContent(docId);
        if (content !== null) {
          documents.push({
            elementId: elem.id,
            content,
          });
        }
      } catch (err) {
        this.logger.warn(
          'ProjectExport',
          `Failed to get content for document ${elem.id}`,
          err
        );
      }
    }

    return documents;
  }

  /**
   * Get worldbuilding data for all worldbuilding elements.
   */
  private async getWorldbuildingData(
    elements: Element[],
    username: string,
    slug: string
  ): Promise<ArchiveWorldbuildingData[]> {
    const worldbuilding: ArchiveWorldbuildingData[] = [];
    const wbElements = elements.filter(e => isWorldbuildingType(e.type));

    for (let i = 0; i < wbElements.length; i++) {
      const elem = wbElements[i];
      this.updateProgress(
        ExportPhase.PackagingWorldbuilding,
        50 + (10 * i) / wbElements.length,
        'Packaging worldbuilding data...',
        `Element ${i + 1} of ${wbElements.length}`,
        i,
        wbElements.length
      );

      try {
        const data = await this.worldbuildingService.getWorldbuildingData(
          elem.id,
          username,
          slug
        );
        if (data) {
          const schemaId = (data['schemaId'] as string) || elem.schemaId || '';
          worldbuilding.push({
            elementId: elem.id,
            schemaId,
            data: this.flattenYjsData(data),
          });
        }
      } catch (err) {
        this.logger.warn(
          'ProjectExport',
          `Failed to get worldbuilding data for ${elem.id}`,
          err
        );
      }
    }

    return worldbuilding;
  }

  /**
   * Flatten Yjs data to plain JSON.
   * Converts Y.Array to arrays and Y.Map to objects.
   */
  private flattenYjsData(
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value.map((item: unknown) =>
          typeof item === 'object' && item !== null
            ? this.flattenYjsData(item as Record<string, unknown>)
            : item
        );
      } else if (
        typeof value === 'object' &&
        'toArray' in value &&
        typeof (value as { toArray?: () => unknown[] }).toArray === 'function'
      ) {
        // Y.Array - use explicit cast to avoid unsafe function call
        const toArrayFn = (value as { toArray: () => unknown[] }).toArray.bind(
          value
        );
        result[key] = toArrayFn().map((item: unknown) =>
          typeof item === 'object' && item !== null
            ? this.flattenYjsData(item as Record<string, unknown>)
            : item
        );
      } else if (
        typeof value === 'object' &&
        'toJSON' in value &&
        typeof (value as { toJSON?: () => unknown }).toJSON === 'function'
      ) {
        // Y.Map or other Yjs type - use explicit cast to avoid unsafe function call
        const toJSONFn = (
          value as { toJSON: () => Record<string, unknown> }
        ).toJSON.bind(value);
        result[key] = this.flattenYjsData(toJSONFn());
      } else if (typeof value === 'object') {
        result[key] = this.flattenYjsData(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Get worldbuilding schemas.
   */
  private getSchemas(): ElementTypeSchema[] | Promise<ElementTypeSchema[]> {
    if (this.syncFactory.isOfflineMode()) {
      return this.offlineElements.schemas();
    }
    return this.worldbuildingService.getAllSchemas();
  }

  /**
   * Get element relationships.
   */
  private async getRelationships(
    username: string,
    slug: string
  ): Promise<ElementRelationship[]> {
    if (this.syncFactory.isOfflineMode()) {
      return this.offlineElements.relationships();
    }
    // In server mode, relationships are also in the sync provider
    await this.offlineElements.loadElements(username, slug);
    return this.offlineElements.relationships();
  }

  /**
   * Get custom relationship types.
   */
  private async getCustomRelationshipTypes(username: string, slug: string) {
    if (this.syncFactory.isOfflineMode()) {
      return this.offlineElements.customRelationshipTypes();
    }
    await this.offlineElements.loadElements(username, slug);
    return this.offlineElements.customRelationshipTypes();
  }

  /**
   * Get tag definitions.
   */
  private async getTags(username: string, slug: string) {
    if (this.syncFactory.isOfflineMode()) {
      return this.offlineElements.customTags();
    }
    await this.offlineElements.loadElements(username, slug);
    return this.offlineElements.customTags();
  }

  /**
   * Get element tag assignments.
   */
  private async getElementTags(username: string, slug: string) {
    if (this.syncFactory.isOfflineMode()) {
      return this.offlineElements.elementTags();
    }
    await this.offlineElements.loadElements(username, slug);
    return this.offlineElements.elementTags();
  }

  /**
   * Get publish plans.
   */
  private async getPublishPlans(
    username: string,
    slug: string
  ): Promise<PublishPlan[]> {
    if (this.syncFactory.isOfflineMode()) {
      return this.offlineElements.publishPlans();
    }
    await this.offlineElements.loadElements(username, slug);
    return this.offlineElements.publishPlans();
  }

  /**
   * Get document snapshots for export.
   * Exports both new format (xmlContent) and legacy format (yDocState) for backward compatibility.
   */
  private async getSnapshots(projectKey: string): Promise<ArchiveSnapshot[]> {
    const storedSnapshots =
      await this.offlineSnapshots.getSnapshotsForExport(projectKey);

    return storedSnapshots.map(s => ({
      documentId: s.documentId,
      name: s.name,
      description: s.description,
      // New format
      xmlContent: s.xmlContent,
      worldbuildingData: s.worldbuildingData,
      wordCount: s.wordCount,
      metadata: s.metadata,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Get media files from IndexedDB.
   */
  private async getMediaFiles(projectKey: string): Promise<{
    mediaManifest: ArchiveMediaFile[];
    mediaBlobs: Map<string, Blob>;
  }> {
    const mediaManifest: ArchiveMediaFile[] = [];
    const mediaBlobs = new Map<string, Blob>();

    // List all media for this project
    const mediaList = await this.offlineStorage.listMedia(projectKey);

    for (let i = 0; i < mediaList.length; i++) {
      const info = mediaList[i];
      this.updateProgress(
        ExportPhase.PackagingMedia,
        65 + (15 * i) / mediaList.length,
        'Packaging media files...',
        `File ${i + 1} of ${mediaList.length}`,
        i,
        mediaList.length
      );

      const blob = await this.offlineStorage.getMedia(projectKey, info.mediaId);
      if (blob) {
        const ext = this.getExtensionFromMimeType(info.mimeType);
        const archivePath = `media/${info.mediaId}${ext}`;

        mediaManifest.push({
          mediaId: info.mediaId,
          mimeType: info.mimeType,
          size: info.size,
          filename: info.filename,
          archivePath,
        });

        mediaBlobs.set(archivePath, blob);
      }
    }

    return { mediaManifest, mediaBlobs };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Archive Creation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create the archive manifest.
   */
  private createManifest(title: string, slug: string): ArchiveManifest {
    return {
      version: ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
      projectTitle: title,
      originalSlug: slug,
    };
  }

  /**
   * Convert an Element to ArchiveElement.
   */
  private elementToArchive(element: Element): ArchiveElement {
    return {
      id: element.id,
      name: element.name,
      type: element.type,
      schemaId: element.schemaId,
      order: element.order,
      level: element.level,
      parentId: element.parentId ?? null,
      expandable: element.expandable,
      version: element.version,
      metadata: element.metadata || {},
    };
  }

  /**
   * Create the ZIP archive.
   */
  private createZip(
    archive: ProjectArchive,
    mediaBlobs: Map<string, Blob>
  ): JSZip {
    const zip = new JSZip();

    // Add JSON files
    zip.file('manifest.json', JSON.stringify(archive.manifest, null, 2));
    zip.file('project.json', JSON.stringify(archive.project, null, 2));
    zip.file('elements.json', JSON.stringify(archive.elements, null, 2));
    zip.file('documents.json', JSON.stringify(archive.documents, null, 2));
    zip.file(
      'worldbuilding.json',
      JSON.stringify(archive.worldbuilding, null, 2)
    );
    zip.file('schemas.json', JSON.stringify(archive.schemas, null, 2));
    zip.file(
      'relationships.json',
      JSON.stringify(archive.relationships, null, 2)
    );
    zip.file(
      'relationship-types.json',
      JSON.stringify(archive.customRelationshipTypes, null, 2)
    );
    zip.file('tags.json', JSON.stringify(archive.tags, null, 2));
    zip.file('element-tags.json', JSON.stringify(archive.elementTags, null, 2));
    zip.file(
      'publish-plans.json',
      JSON.stringify(archive.publishPlans, null, 2)
    );
    zip.file('media-index.json', JSON.stringify(archive.media, null, 2));

    // Add snapshots if present
    if (archive.snapshots && archive.snapshots.length > 0) {
      zip.file('snapshots.json', JSON.stringify(archive.snapshots, null, 2));
    }

    // Add media files
    for (const [path, blob] of mediaBlobs) {
      zip.file(path, blob);
    }

    return zip;
  }

  /**
   * Download the ZIP file.
   */
  private async downloadZip(zip: JSZip, filename: string): Promise<void> {
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update the progress signal.
   */
  private updateProgress(
    phase: ExportPhase,
    progress: number,
    message: string,
    detail?: string,
    currentItem?: number,
    totalItems?: number
  ): void {
    this.progress.set({
      phase,
      progress,
      message,
      detail,
      currentItem,
      totalItems,
    });
  }

  /**
   * Get file extension from MIME type.
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
    };
    return mimeToExt[mimeType] || '';
  }
}
