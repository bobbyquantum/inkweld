import { inject, Injectable, signal } from '@angular/core';
import {
  GetApiV1ProjectsUsernameSlugElements200ResponseInner,
  GetApiV1ProjectsUsernameSlugElements200ResponseInnerType,
  Project,
} from '@inkweld/index';
import JSZip from '@progress/jszip-esm';
import { firstValueFrom } from 'rxjs';

import {
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../models/project-archive';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';

const CURRENT_ARCHIVE_VERSION = 1;

@Injectable({
  providedIn: 'root',
})
export class ProjectImportExportService {
  private projectStateService = inject(ProjectStateService);
  private documentService = inject(DocumentService);

  /** Progress of the current import/export operation (0-100) */
  readonly progress = signal<number>(0);

  /** Whether an import/export operation is in progress */
  readonly isProcessing = signal<boolean>(false);

  /** Any error that occurred during import/export */
  readonly error = signal<string | undefined>(undefined);

  /**
   * Exports the current project as a downloadable JSON file
   * @throws ProjectArchiveError if export fails
   */
  async exportProject(): Promise<void> {
    if (!this.projectStateService.project()) {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'No project is currently loaded'
      );
      this.error.set(error.message);
      throw error;
    }

    try {
      this.isProcessing.set(true);
      this.error.set(undefined);
      this.progress.set(0);

      const archive = await this.createProjectArchive();

      // Convert to JSON and create blob
      const json = JSON.stringify(archive, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      // Generate filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];
      const filename = `${archive.project.slug}_${timestamp}.json`;

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      // Trigger download
      await this.triggerDownload(link, url);

      this.progress.set(100);
    } catch (error) {
      this.handleExportError(error, 'Failed to export project');
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Exports the current project as a downloadable ZIP file
   * @throws ProjectArchiveError if export fails
   */
  async exportProjectZip(): Promise<void> {
    if (!this.projectStateService.project()) {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'No project is currently loaded'
      );
      this.error.set(error.message);
      throw error;
    }

    try {
      this.isProcessing.set(true);
      this.error.set(undefined);
      this.progress.set(0);

      const archive = await this.createProjectArchive();

      // Convert to JSON
      const json = JSON.stringify(archive, null, 2);

      // Create ZIP archive
      const zip = new JSZip();
      zip.file('project.json', json);
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      });

      // Generate filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];
      const filename = `${archive.project.slug}_${timestamp}.zip`;

      // Create download link and trigger download
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      // Trigger download
      await this.triggerDownload(link, url);

      this.progress.set(100);
    } catch (error) {
      this.handleExportError(error, 'Failed to export project as zip');
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Imports a project from a JSON file
   * @param file The JSON file to import
   * @throws ProjectArchiveError if import fails or validation fails
   */
  async importProject(file: File): Promise<void> {
    try {
      this.isProcessing.set(true);
      this.error.set(undefined);
      this.progress.set(0);

      // Read and parse the file
      const text = await file.text();
      this.progress.set(30);

      const archive = this.importProjectArchiveFromJson(text);
      this.progress.set(60);

      // Update project state
      this.updateProjectState(archive);

      this.progress.set(100);
    } catch (error) {
      this.handleImportError(error, 'Failed to import project');
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Imports a project from a ZIP file
   * @param file The ZIP file to import
   * @throws ProjectArchiveError if import fails or validation fails
   */
  async importProjectZip(file: File): Promise<void> {
    if (!file) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'No file provided for import'
      );
    }

    try {
      this.isProcessing.set(true);
      this.error.set(undefined);
      this.progress.set(0);

      // Read the zip file as a blob
      const buffer = await file.arrayBuffer();
      const zip = await new JSZip().loadAsync(buffer);
      this.progress.set(30);

      // Extract the project.json file
      const projectFile = zip.file('project.json');
      if (!projectFile) {
        throw new ProjectArchiveError(
          ProjectArchiveErrorType.InvalidFormat,
          'ZIP archive does not contain project.json'
        );
      }
      const text = await projectFile.async('text');

      const archive = this.importProjectArchiveFromJson(text);

      this.progress.set(60);

      // Update project state
      this.updateProjectState(archive);

      this.progress.set(100);
    } catch (error) {
      this.handleImportError(error, 'Failed to import project from zip');
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Creates a ProjectArchive object from the current project state
   * @private
   */
  private async createProjectArchive(): Promise<ProjectArchive> {
    const currentProject = this.projectStateService.project()!; // Assume project exists as exportProject and exportProjectZip check for it
    const allElements = this.projectStateService.elements();
    // Only export FOLDER and ITEM types, exclude worldbuilding elements
    const elements = allElements.filter(
      elem =>
        elem.type ===
          GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder ||
        elem.type ===
          GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item
    );

    const archive: ProjectArchive = {
      version: CURRENT_ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
      project: {
        title: currentProject.title,
        description: currentProject.description || '',
        slug: currentProject.slug,
      },
      elements: elements.map(elem => ({
        id: elem.id,
        name: elem.name,
        type: elem.type,
        order: elem.order,
        parentId: null,
        level: elem.level,
        version: elem.version,
        expandable: elem.expandable,
        metadata: elem.metadata,
      })),
    };

    archive.elements = await Promise.all(
      elements.map(async elem => {
        const elementArchive = archive.elements.find(e => e.id === elem.id)!;
        if (
          elem.type ===
          GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item
        ) {
          const content = await firstValueFrom(
            this.documentService.exportDocument(elem.id)
          );
          return { ...elementArchive, content };
        }
        return elementArchive;
      })
    );
    return archive;
  }

  /**
   * Imports a project archive from a JSON string and validates it
   * @param text JSON string content of the archive
   * @private
   * @throws ProjectArchiveError if validation fails
   * @returns Validated ProjectArchive object
   */
  private importProjectArchiveFromJson(text: string): ProjectArchive {
    // Removed async here
    let archive: ProjectArchive;
    try {
      const parsed = JSON.parse(text) as unknown;
      this.validateArchive(parsed);
      archive = parsed;
    } catch (error) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        error instanceof Error
          ? error.message
          : 'Invalid JSON format in project.json'
      );
    }
    return archive;
  }

  /**
   * Updates the project state with the imported archive data
   * @param archive Validated ProjectArchive object
   * @private
   */
  private updateProjectState(archive: ProjectArchive): void {
    // Convert archive to DTO format
    const Project: Project = {
      id: crypto.randomUUID(), // Generate new ID
      title: archive.project.title,
      description: archive.project.description || '',
      slug: archive.project.slug,
      username: 'not set',
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    const elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
      archive.elements.map(elem => ({
        id: elem.id || crypto.randomUUID(), // Generate new ID if not provided
        name: elem.name,
        type: elem.type,
        order: elem.order,
        parentId: null,
        level: elem.level,
        version: elem.version!,
        expandable: elem.expandable!,
        metadata: elem.metadata,
      }));

    for (const elem of archive.elements) {
      if (
        elem.type ===
        GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item
      ) {
        const content = elem.content;
        if (!content) {
          console.warn('Document content is missing for item:', elem.id);
        } else if (typeof content !== 'string') {
          console.error('Document content is not a string:', elem.id, content);
          throw new Error('Document content is not a string');
        } else {
          this.documentService.importDocument(
            elem.id!,
            JSON.stringify(content)
          );
        }
      }
    }

    // Update project state
    this.projectStateService.updateProject(Project);
    this.projectStateService.updateElements(elements);
  }

  /**
   * Handles common export error logic
   * @param error The error object
   * @param defaultMessage Default error message
   * @private
   * @throws ProjectArchiveError
   */
  private handleExportError(error: unknown, defaultMessage: string) {
    // Changed error: any to error: unknown
    console.error('Export error:', error);
    const message = error instanceof Error ? error.message : defaultMessage;
    this.error.set(message);
    if (error instanceof ProjectArchiveError) {
      throw error;
    }
    throw new ProjectArchiveError(
      ProjectArchiveErrorType.FileSystemError,
      message,
      error
    );
  }

  /**
   * Handles common import error logic
   * @param error The error object
   * @param defaultMessage Default error message
   * @private
   * @throws ProjectArchiveError
   */
  private handleImportError(error: unknown, defaultMessage: string) {
    // Changed error: any to error: unknown
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : defaultMessage;
    this.error.set(message);
    if (error instanceof ProjectArchiveError) {
      throw error;
    }
    throw new ProjectArchiveError(
      ProjectArchiveErrorType.FileSystemError,
      message,
      error
    );
  }

  /**
   * Triggers the download of a file
   * @param link Anchor element used for download
   * @param url  URL of the file to download
   * @private
   */
  private async triggerDownload(
    link: HTMLAnchorElement,
    url: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Added return here
      try {
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve();
      } catch (error) {
        reject(
          new Error(error instanceof Error ? error.message : String(error))
        );
      }
    });
  }

  /**
   * Validates the structure and version of an imported archive
   * @throws ProjectArchiveError if validation fails
   */
  private validateArchive(archive: unknown): asserts archive is ProjectArchive {
    if (!archive || typeof archive !== 'object') {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        'Invalid archive format'
      );
    }

    const { version, project, elements } = archive as Partial<ProjectArchive>;

    if (typeof version !== 'number') {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        'Missing or invalid version number'
      );
    }

    if (version > CURRENT_ARCHIVE_VERSION) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.VersionMismatch,
        `Archive version ${version} is not supported. Current version: ${CURRENT_ARCHIVE_VERSION}`
      );
    }

    if (!project || typeof project !== 'object') {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        'Missing or invalid project data'
      );
    }

    if (!Array.isArray(elements)) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        'Missing or invalid elements array'
      );
    }

    // Validate required project fields
    const requiredFields = ['title', 'slug'] as const;
    for (const field of requiredFields) {
      if (typeof project[field] !== 'string') {
        throw new ProjectArchiveError(
          ProjectArchiveErrorType.InvalidFormat,
          `Missing or invalid project field: ${field}`
        );
      }
    }

    // Optional description field
    if (
      project.description !== undefined &&
      typeof project.description !== 'string'
    ) {
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        'Invalid project description'
      );
    }

    // Validate elements structure
    for (const [index, elem] of elements.entries()) {
      if (
        !elem ||
        typeof elem !== 'object' ||
        typeof elem.name !== 'string' ||
        !['FOLDER', 'ITEM'].includes(elem.type) ||
        typeof elem.order !== 'number' ||
        typeof elem.level !== 'number' ||
        (elem.id !== undefined && typeof elem.id !== 'string') || // Optional id must be string if present
        (elem.version !== undefined && typeof elem.version !== 'number') || // Optional version must be number if present
        (elem.expandable !== undefined && typeof elem.expandable !== 'boolean') // Optional expandable must be boolean if present
      ) {
        throw new ProjectArchiveError(
          ProjectArchiveErrorType.InvalidFormat,
          `Invalid element at index ${index}`
        );
      }
    }
  }
}
