import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Element, Project, ProjectsService } from '@inkweld/index';
import JSZip from '@progress/jszip-esm';
import { firstValueFrom } from 'rxjs';

import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { ElementTag, TagDefinition } from '../../components/tags/tag.model';
import {
  ARCHIVE_VERSION,
  ArchiveDocumentContent,
  ArchiveElement,
  ArchiveManifest,
  ArchiveMediaFile,
  ArchiveProgress,
  ArchiveSnapshot,
  ArchiveWorldbuildingData,
  ImportPhase,
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../../models/project-archive';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectService } from '../offline/offline-project.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { OfflineSnapshotService } from '../offline/offline-snapshot.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { DocumentImportService } from './document-import.service';

/**
 * Result of slug validation.
 */
export interface SlugValidationResult {
  valid: boolean;
  available: boolean;
  suggestion?: string;
  error?: string;
}

/**
 * Options for project import.
 */
export interface ImportOptions {
  /** Target slug for the imported project (user will be prompted if not provided) */
  slug?: string;
  /** Target username - defaults to current user */
  username?: string;
}

/**
 * Service for importing projects from archive files.
 *
 * Import behavior:
 * - Offline mode: Creates project locally using OfflineProjectService
 * - Server mode: Creates project via API, uploads media, syncs documents
 *
 * The import process:
 * 1. Validate and extract archive
 * 2. Prompt user for slug (with availability check)
 * 3. Create project (offline or server)
 * 4. Import elements structure
 * 5. Import document contents
 * 6. Import worldbuilding data
 * 7. Import schemas, relationships, publish plans
 * 8. Import media files
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectImportService {
  private logger = inject(LoggerService);
  private http = inject(HttpClient);
  private syncFactory = inject(ElementSyncProviderFactory);
  private offlineProject = inject(OfflineProjectService);
  private offlineElements = inject(OfflineProjectElementsService);
  private offlineStorage = inject(OfflineStorageService);
  private offlineSnapshots = inject(OfflineSnapshotService);
  private projectsService = inject(ProjectsService);
  private documentImport = inject(DocumentImportService);

  /** Current import progress */
  readonly progress = signal<ArchiveProgress>({
    phase: ImportPhase.Initializing,
    progress: 0,
    message: 'Ready',
  });

  /** Whether an import is in progress */
  readonly isImporting = signal(false);

  /** Error from last import attempt */
  readonly error = signal<string | undefined>(undefined);

  /**
   * Import a project from a ZIP archive file.
   *
   * @param file - The ZIP file to import
   * @param options - Import options (slug, username)
   * @returns The created project
   * @throws ProjectArchiveError if import fails
   */
  async importProject(
    file: File,
    options: ImportOptions = {}
  ): Promise<Project> {
    this.isImporting.set(true);
    this.error.set(undefined);

    try {
      // Phase 1: Load and validate archive
      this.updateProgress(ImportPhase.LoadingArchive, 5, 'Loading archive...');
      const archive = await this.loadArchive(file);

      // Phase 2: Validate archive structure
      this.updateProgress(
        ImportPhase.ValidatingArchive,
        10,
        'Validating archive...'
      );
      this.validateArchive(archive);

      // Phase 3: Determine slug (must be provided via options for now)
      if (!options.slug) {
        throw new ProjectArchiveError(
          ProjectArchiveErrorType.ValidationFailed,
          'Slug must be provided for import. Use the dialog to select a slug.'
        );
      }

      const slug = options.slug;

      // Phase 4: Create the project
      this.updateProgress(
        ImportPhase.CreatingProject,
        15,
        'Creating project...'
      );
      const project = await this.createProject(archive, slug);
      const projectKey = `${project.username}/${project.slug}`;

      try {
        // Phase 5: Import elements
        this.updateProgress(
          ImportPhase.ImportingElements,
          25,
          'Importing elements...'
        );
        await this.importElements(
          archive.elements,
          project.username,
          project.slug
        );

        // Phase 6: Import documents
        this.updateProgress(
          ImportPhase.ImportingDocuments,
          40,
          'Importing documents...'
        );
        await this.importDocuments(
          archive.documents,
          project.username,
          project.slug
        );

        // Phase 7: Import worldbuilding data
        this.updateProgress(
          ImportPhase.ImportingWorldbuilding,
          55,
          'Importing worldbuilding data...'
        );
        await this.importWorldbuilding(
          archive.worldbuilding,
          project.username,
          project.slug
        );

        // Phase 8: Import additional project data
        this.updateProgress(
          ImportPhase.ImportingData,
          70,
          'Importing project data...'
        );
        await this.importProjectData(archive, project.username, project.slug);

        // Phase 9: Import snapshots
        if (archive.snapshots && archive.snapshots.length > 0) {
          this.updateProgress(
            ImportPhase.ImportingSnapshots,
            78,
            'Importing snapshots...'
          );
          await this.importSnapshots(archive.snapshots, projectKey);
        }

        // Phase 10: Import media
        this.updateProgress(
          ImportPhase.ImportingMedia,
          85,
          'Importing media...'
        );
        await this.importMedia(
          archive,
          file,
          projectKey,
          project.username,
          project.slug
        );

        this.updateProgress(ImportPhase.Complete, 100, 'Import complete!');
        this.logger.info(
          'ProjectImport',
          `Imported project ${projectKey} from ${file.name}`
        );

        return project;
      } catch (err) {
        // Cleanup on failure - try to delete the partially created project
        this.logger.warn(
          'ProjectImport',
          `Import failed, attempting cleanup for ${projectKey}`,
          err
        );
        await this.cleanupFailedImport(project.username, project.slug);
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      this.error.set(message);
      this.logger.error('ProjectImport', 'Import failed', err);

      if (err instanceof ProjectArchiveError) {
        throw err;
      }
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.StorageError,
        message,
        err
      );
    } finally {
      this.isImporting.set(false);
    }
  }

  /**
   * Validate a slug for availability.
   *
   * @param slug - The slug to validate
   * @param username - The username context (for offline validation)
   * @returns Validation result with availability status
   */
  validateSlug(slug: string, username?: string): SlugValidationResult {
    // Basic format validation
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return {
        valid: false,
        available: false,
        error: 'Slug must be lowercase letters, numbers, and hyphens only',
        suggestion: this.slugify(slug),
      };
    }

    if (slug.length < 3) {
      return {
        valid: false,
        available: false,
        error: 'Slug must be at least 3 characters',
      };
    }

    if (slug.length > 50) {
      return {
        valid: false,
        available: false,
        error: 'Slug must be 50 characters or less',
      };
    }

    // Check availability
    const isOffline = this.syncFactory.isOfflineMode();
    if (isOffline) {
      // Check offline projects
      const existing = this.offlineProject.getProject(username || '', slug);
      return {
        valid: true,
        available: !existing,
        error: existing ? 'A project with this slug already exists' : undefined,
      };
    } else {
      // In server mode, we'll rely on the server to tell us if slug is taken
      // when we create the project
      return {
        valid: true,
        available: true,
      };
    }
  }

  /**
   * Generate a slug suggestion from a title.
   */
  suggestSlug(title: string): string {
    return this.slugify(title);
  }

  /**
   * Extract and preview archive metadata without importing.
   */
  async previewArchive(file: File): Promise<{
    manifest: ArchiveManifest;
    project: ProjectArchive['project'];
    counts: {
      elements: number;
      documents: number;
      worldbuildingEntries: number;
      schemas: number;
      mediaFiles: number;
    };
  }> {
    const archive = await this.loadArchive(file);
    return {
      manifest: archive.manifest,
      project: archive.project,
      counts: {
        elements: archive.elements.length,
        documents: archive.documents.length,
        worldbuildingEntries: archive.worldbuilding.length,
        schemas: archive.schemas.length,
        mediaFiles: archive.media.length,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Archive Loading & Validation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Load and parse the archive from a file.
   */
  private async loadArchive(file: File): Promise<ProjectArchive> {
    const zip = await new JSZip().loadAsync(file);

    // Read required JSON files
    const manifestJson = await this.readJsonFile<ArchiveManifest>(
      zip,
      'manifest.json'
    );
    const projectJson = await this.readJsonFile<ProjectArchive['project']>(
      zip,
      'project.json'
    );
    const elementsJson = await this.readJsonFile<ArchiveElement[]>(
      zip,
      'elements.json'
    );
    const documentsJson = await this.readJsonFile<ArchiveDocumentContent[]>(
      zip,
      'documents.json'
    );
    const worldbuildingJson = await this.readJsonFile<
      ArchiveWorldbuildingData[]
    >(zip, 'worldbuilding.json');

    // Read optional JSON files
    const schemasJson = await this.readJsonFile<ElementTypeSchema[]>(
      zip,
      'schemas.json',
      []
    );
    const relationshipsJson = await this.readJsonFile<ElementRelationship[]>(
      zip,
      'relationships.json',
      []
    );
    const customTypesJson = await this.readJsonFile<
      RelationshipTypeDefinition[]
    >(zip, 'relationship-types.json', []);
    const tagsJson = await this.readJsonFile<TagDefinition[]>(
      zip,
      'tags.json',
      []
    );
    const elementTagsJson = await this.readJsonFile<ElementTag[]>(
      zip,
      'element-tags.json',
      []
    );
    const publishPlansJson = await this.readJsonFile<PublishPlan[]>(
      zip,
      'publish-plans.json',
      []
    );
    const mediaIndexJson = await this.readJsonFile<ArchiveMediaFile[]>(
      zip,
      'media-index.json',
      []
    );

    // Read optional snapshots file
    const snapshotsJson = await this.readJsonFile<ArchiveSnapshot[]>(
      zip,
      'snapshots.json',
      []
    );

    return {
      manifest: manifestJson,
      project: projectJson,
      elements: elementsJson,
      documents: documentsJson,
      worldbuilding: worldbuildingJson,
      schemas: schemasJson,
      relationships: relationshipsJson,
      customRelationshipTypes: customTypesJson,
      tags: tagsJson,
      elementTags: elementTagsJson,
      publishPlans: publishPlansJson,
      media: mediaIndexJson,
      snapshots: snapshotsJson,
    };
  }

  /**
   * Read and parse a JSON file from the ZIP.
   */
  private async readJsonFile<T>(
    zip: JSZip,
    filename: string,
    defaultValue?: T
  ): Promise<T> {
    const file = zip.file(filename);
    if (!file) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.CorruptedArchive,
        `Missing required file: ${filename}`
      );
    }

    try {
      const content = await file.async('string');
      return JSON.parse(content) as T;
    } catch (err) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.CorruptedArchive,
        `Failed to parse ${filename}`,
        err
      );
    }
  }

  /**
   * Validate archive structure and version.
   */
  private validateArchive(archive: ProjectArchive): void {
    // Check version compatibility
    if (archive.manifest.version > ARCHIVE_VERSION) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.UnsupportedVersion,
        `Archive version ${archive.manifest.version} is newer than supported version ${ARCHIVE_VERSION}`
      );
    }

    // Validate required project fields
    if (!archive.project.title) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'Archive project is missing title'
      );
    }

    // Validate elements have required fields
    for (const elem of archive.elements) {
      if (!elem.id || !elem.name || elem.type === undefined) {
        throw new ProjectArchiveError(
          ProjectArchiveErrorType.ValidationFailed,
          `Invalid element in archive: ${JSON.stringify(elem)}`
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Creation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new project (offline or server mode).
   */
  private async createProject(
    archive: ProjectArchive,
    slug: string
  ): Promise<Project> {
    const isOffline = this.syncFactory.isOfflineMode();

    if (isOffline) {
      return this.offlineProject.createProject({
        title: archive.project.title,
        description: archive.project.description ?? '',
        slug,
      });
    } else {
      // Create via API
      return firstValueFrom(
        this.projectsService.createProject({
          title: archive.project.title,
          description: archive.project.description ?? '',
          slug,
        })
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Element Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Import elements structure.
   */
  private async importElements(
    elements: ArchiveElement[],
    username: string,
    slug: string
  ): Promise<void> {
    // Convert archive elements to full Element objects
    const fullElements: Element[] = elements.map(ae => ({
      id: ae.id,
      name: ae.name,
      type: ae.type,
      schemaId: ae.schemaId ?? undefined,
      order: ae.order,
      level: ae.level,
      parentId: ae.parentId ?? null,
      expandable: ae.expandable ?? false,
      version: ae.version ?? 1,
      metadata: ae.metadata,
    }));

    // Save to offline storage (works for both modes as starting point)
    await this.offlineElements.saveElements(username, slug, fullElements);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Import document contents.
   */
  private async importDocuments(
    documents: ArchiveDocumentContent[],
    username: string,
    slug: string
  ): Promise<void> {
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      this.updateProgress(
        ImportPhase.ImportingDocuments,
        40 + (15 * i) / documents.length,
        'Importing documents...',
        `Document ${i + 1} of ${documents.length}`,
        i,
        documents.length
      );

      const documentId = `${username}:${slug}:${doc.elementId}`;
      await this.documentImport.writeDocumentContent(documentId, doc.content);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Worldbuilding Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Import worldbuilding data.
   */
  private async importWorldbuilding(
    worldbuilding: ArchiveWorldbuildingData[],
    username: string,
    slug: string
  ): Promise<void> {
    for (let i = 0; i < worldbuilding.length; i++) {
      const wb = worldbuilding[i];
      this.updateProgress(
        ImportPhase.ImportingWorldbuilding,
        55 + (15 * i) / worldbuilding.length,
        'Importing worldbuilding data...',
        `Element ${i + 1} of ${worldbuilding.length}`,
        i,
        worldbuilding.length
      );

      await this.documentImport.writeWorldbuildingData(wb, username, slug);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Additional Project Data Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Import schemas, relationships, custom types, and publish plans.
   */
  private async importProjectData(
    archive: ProjectArchive,
    username: string,
    slug: string
  ): Promise<void> {
    // Import schemas
    if (archive.schemas.length > 0) {
      await this.offlineElements.saveSchemas(username, slug, archive.schemas);
    }

    // Import relationships
    if (archive.relationships.length > 0) {
      await this.offlineElements.saveRelationships(
        username,
        slug,
        archive.relationships
      );
    }

    // Import custom relationship types
    if (archive.customRelationshipTypes.length > 0) {
      await this.offlineElements.saveCustomRelationshipTypes(
        username,
        slug,
        archive.customRelationshipTypes
      );
    }

    // Import tags
    if (archive.tags.length > 0) {
      await this.offlineElements.saveCustomTags(username, slug, archive.tags);
    }

    // Import element tag assignments
    if (archive.elementTags.length > 0) {
      await this.offlineElements.saveElementTags(
        username,
        slug,
        archive.elementTags
      );
    }

    // Import publish plans
    if (archive.publishPlans.length > 0) {
      await this.offlineElements.savePublishPlans(
        username,
        slug,
        archive.publishPlans
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Snapshot Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Import snapshots from the archive.
   */
  private async importSnapshots(
    snapshots: ArchiveSnapshot[],
    projectKey: string
  ): Promise<void> {
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];

      this.updateProgress(
        ImportPhase.ImportingSnapshots,
        78 + (5 * i) / snapshots.length,
        'Importing snapshots...',
        `Snapshot ${i + 1} of ${snapshots.length}`,
        i,
        snapshots.length
      );

      try {
        await this.offlineSnapshots.importSnapshot(projectKey, {
          documentId: snapshot.documentId,
          name: snapshot.name,
          description: snapshot.description,
          // New format
          xmlContent: snapshot.xmlContent,
          worldbuildingData: snapshot.worldbuildingData,
          wordCount: snapshot.wordCount,
          metadata: snapshot.metadata,
          createdAt: snapshot.createdAt,
        });
      } catch (err) {
        this.logger.warn(
          'ProjectImport',
          `Failed to import snapshot for ${snapshot.documentId}`,
          err
        );
        // Continue with other snapshots
      }
    }

    this.logger.info('ProjectImport', `Imported ${snapshots.length} snapshots`);
  }

  /**
   * Convert base64 string to Uint8Array.
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Media Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Import media files from the archive.
   */
  private async importMedia(
    archive: ProjectArchive,
    file: File,
    projectKey: string,
    username: string,
    slug: string
  ): Promise<void> {
    if (archive.media.length === 0) {
      return;
    }

    const zip = await new JSZip().loadAsync(file);
    const isOffline = this.syncFactory.isOfflineMode();

    for (let i = 0; i < archive.media.length; i++) {
      const media = archive.media[i];
      this.updateProgress(
        ImportPhase.ImportingMedia,
        85 + (10 * i) / archive.media.length,
        'Importing media...',
        `File ${i + 1} of ${archive.media.length}`,
        i,
        archive.media.length
      );

      const mediaFile = zip.file(media.archivePath);
      if (!mediaFile) {
        this.logger.warn(
          'ProjectImport',
          `Media file not found in archive: ${media.archivePath}`
        );
        continue;
      }

      const blob = await mediaFile.async('blob');

      // Save to local IndexedDB storage
      await this.offlineStorage.saveMedia(
        projectKey,
        media.mediaId,
        blob,
        media.filename
      );

      // In server mode, upload cover image
      if (!isOffline && media.mediaId === 'cover') {
        try {
          await this.uploadCoverImage(username, slug, blob);
        } catch (err) {
          this.logger.warn(
            'ProjectImport',
            `Failed to upload cover image for ${projectKey}`,
            err
          );
          // Don't fail the entire import for cover upload failure
        }
      }
    }
  }

  /**
   * Upload cover image to server using FormData.
   */
  private async uploadCoverImage(
    username: string,
    slug: string,
    blob: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append('cover', blob, 'cover.jpg');

    await firstValueFrom(
      this.http.post(`/api/v1/projects/${username}/${slug}/cover`, formData)
    );

    this.logger.debug(
      'ProjectImport',
      `Uploaded cover image for ${username}/${slug}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Clean up a partially imported project on failure.
   */
  private async cleanupFailedImport(
    username: string,
    slug: string
  ): Promise<void> {
    try {
      const isOffline = this.syncFactory.isOfflineMode();
      if (isOffline) {
        this.offlineProject.deleteProject(username, slug);
      } else {
        await firstValueFrom(
          this.projectsService.deleteProject(username, slug)
        );
      }
    } catch (err) {
      this.logger.warn(
        'ProjectImport',
        `Failed to cleanup project ${username}/${slug}`,
        err
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update the progress signal.
   */
  private updateProgress(
    phase: ImportPhase,
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
   * Convert a string to a URL-friendly slug.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }
}
