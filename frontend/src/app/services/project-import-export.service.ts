import { inject, Injectable, signal } from '@angular/core';
import { ProjectDto, ProjectElementDto } from '@worm/index';

import {
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../models/project-archive';
import { ProjectStateService } from './project-state.service';

const CURRENT_ARCHIVE_VERSION = 1;

@Injectable({
  providedIn: 'root',
})
export class ProjectImportExportService {
  /** Progress of the current import/export operation (0-100) */
  readonly progress = signal<number>(0);

  /** Whether an import/export operation is in progress */
  readonly isProcessing = signal<boolean>(false);

  /** Any error that occurred during import/export */
  readonly error = signal<string | undefined>(undefined);

  private projectStateService = inject(ProjectStateService);

  /**
   * Exports the current project as a downloadable JSON file
   * @throws ProjectArchiveError if export fails
   */
  async exportProject(): Promise<void> {
    const currentProject = this.projectStateService.project();
    const elements = this.projectStateService.elements();

    if (!currentProject) {
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

      // Create the archive structure
      const archive: ProjectArchive = {
        version: CURRENT_ARCHIVE_VERSION,
        exportedAt: new Date().toISOString(),
        project: {
          title: currentProject.title,
          description: currentProject.description,
          slug: currentProject.slug,
        },
        elements: elements.map(elem => ({
          id: elem.id,
          name: elem.name,
          type: elem.type,
          position: elem.position,
          level: elem.level,
          version: elem.version,
          expandable: elem.expandable,
        })),
      };

      // Simulate progress for better UX
      this.progress.set(50);

      // Convert to JSON and create blob
      const json = JSON.stringify(archive, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      // Generate filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];
      const filename = `${currentProject.slug}_${timestamp}.json`;

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      // Wrap in Promise to make this truly async
      await new Promise<void>((resolve, reject) => {
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

      this.progress.set(100);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to export project';
      this.error.set(message);
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.FileSystemError,
        message,
        error
      );
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

      let archive: ProjectArchive;
      try {
        const parsed = JSON.parse(text) as unknown;
        this.validateArchive(parsed);
        archive = parsed;
      } catch (error) {
        throw new ProjectArchiveError(
          ProjectArchiveErrorType.InvalidFormat,
          error instanceof Error ? error.message : 'Invalid JSON format'
        );
      }

      this.progress.set(60);

      // Convert archive to DTO format
      const projectDto: ProjectDto = {
        title: archive.project.title,
        description: archive.project.description,
        slug: archive.project.slug,
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      const elements: ProjectElementDto[] = archive.elements.map(elem => ({
        id: elem.id || crypto.randomUUID(), // Generate new ID if not provided
        name: elem.name,
        type: elem.type,
        position: elem.position,
        level: elem.level,
        version: elem.version,
        expandable: elem.expandable,
      }));

      // Update project state
      await this.projectStateService.updateProject(projectDto);
      this.projectStateService.updateElements(elements);

      this.progress.set(100);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to import project';
      this.error.set(message);
      if (error instanceof ProjectArchiveError) {
        throw error;
      }
      throw new ProjectArchiveError(
        ProjectArchiveErrorType.FileSystemError,
        message,
        error
      );
    } finally {
      this.isProcessing.set(false);
    }
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
        typeof elem.position !== 'number' ||
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
