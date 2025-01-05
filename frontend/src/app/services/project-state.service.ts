import { computed, inject, Injectable, signal } from '@angular/core';
import { ProjectAPIService, ProjectDto, ProjectElementDto } from '@worm/index';
import { firstValueFrom } from 'rxjs';

import { DocumentSyncState } from '../models/document-sync-state';
import { XsrfService } from './xsrf.service';

@Injectable({
  providedIn: 'root',
})
export class ProjectStateService {
  // Public signals
  readonly project = signal<ProjectDto>(undefined as unknown as ProjectDto);
  readonly elements = signal<ProjectElementDto[]>([]);
  readonly openFiles = signal<ProjectElementDto[]>([]);
  readonly selectedTabIndex = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | undefined>(undefined);

  // Computed signal to get sync state for a document
  readonly getSyncState = computed(() => (documentId: string) => {
    return this.documentSyncStates()?.get(documentId);
  });
  private readonly documentSyncStates = signal<Map<string, DocumentSyncState>>(
    new Map()
  );
  // Private injected services (private members come after public members)
  private readonly projectService = inject(ProjectAPIService);
  private readonly xsrfService = inject(XsrfService);

  // Methods to load project data
  async loadProject(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const project = await firstValueFrom(
        this.projectService.projectControllerGetProjectByUsernameAndSlug(
          username,
          slug
        )
      );
      this.project.set(project || null);

      if (project) {
        await this.loadProjectElements(username, slug);
      }
    } catch (err: unknown) {
      this.error.set('Failed to load project');
      console.error('Error loading project:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadProjectElements(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const elements = await firstValueFrom(
        this.projectService.projectElementControllerGetProjectElements(
          username,
          slug
        )
      );
      this.elements.set(elements || []);
    } catch (err: unknown) {
      this.error.set('Failed to load project elements');
      console.error('Error loading project elements:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  openFile(element: ProjectElementDto | null): void {
    if (!element?.id) return;

    const files = this.openFiles();
    const alreadyOpen = files.some(f => f.id === element.id);
    if (!alreadyOpen) {
      this.openFiles.update(files => [...files, element]);
      // Set initial sync state to Unavailable
      this.updateSyncState(element.id, DocumentSyncState.Unavailable);
    }
    const index = this.openFiles().findIndex(f => f.id === element.id);
    this.selectedTabIndex.set(index);
  }

  closeFile(index: number): void {
    const files = this.openFiles();
    const file = files[index];
    if (file?.id) {
      // Set sync state to unavailable when closing file
      this.updateSyncState(file.id, DocumentSyncState.Unavailable);
    }
    this.openFiles.update(files => files.filter((_, i) => i !== index));
    const filesLength = this.openFiles().length;
    if (this.selectedTabIndex() >= filesLength) {
      this.selectedTabIndex.set(filesLength - 1);
    }
  }

  updateSyncState(
    documentId: string,
    state: DocumentSyncState | undefined
  ): void {
    if (!documentId) return;

    this.documentSyncStates.update(states => {
      const newStates = new Map(states);
      if (state === undefined) {
        newStates.delete(documentId);
        return newStates;
      }

      // Only update state if document exists in open files
      const fileExists = this.openFiles().some(f => f.id === documentId);
      if (fileExists) {
        newStates.set(documentId, state);
      }
      return newStates;
    });
  }

  // Method to update elements locally (e.g., for drag-and-drop operations)
  updateElements(elements: ProjectElementDto[]): void {
    this.elements.set(elements);
  }

  // Method to save project elements
  async saveProjectElements(
    username: string,
    slug: string,
    elements: ProjectElementDto[]
  ): Promise<void> {
    this.isSaving.set(true);
    this.error.set(undefined);

    try {
      const updatedElements = await firstValueFrom(
        this.projectService.projectElementControllerDinsertElements(
          username,
          slug,
          this.xsrfService.getXsrfToken(),
          elements
        )
      );
      this.elements.set(updatedElements || []);
    } catch (err: unknown) {
      this.error.set('Failed to save project elements');
      console.error('Error saving project elements:', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
