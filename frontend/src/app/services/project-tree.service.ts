import { computed, inject, Injectable, signal } from '@angular/core';
import { ProjectElementsAPIService } from 'worm-api-client';
import { ProjectElementDto } from 'worm-api-client';

import { XsrfService } from './xsrf.service';

export interface TreeState {
  elements: ProjectElementDto[];
  isLoading: boolean;
  isSaving: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectTreeService {
  // Public computed signals for components to consume
  readonly elements = computed(() => this.state().elements);
  readonly isLoading = computed(() => this.state().isLoading);
  readonly isSaving = computed(() => this.state().isSaving);
  readonly error = computed(() => this.state().error);

  private elementService = inject(ProjectElementsAPIService);
  private xsrfService = inject(XsrfService);

  // State signals
  private state = signal<TreeState>({
    elements: [],
    isLoading: false,
    isSaving: false,
  });

  async loadProjectElements(username: string, slug: string): Promise<void> {
    try {
      this.state.update(s => ({ ...s, isLoading: true, error: undefined }));

      const elements = await this.elementService
        .getProjectElements(username, slug)
        .toPromise();

      this.state.update(s => ({
        ...s,
        elements: elements || [],
        isLoading: false,
      }));
    } catch (error) {
      this.state.update(s => ({
        ...s,
        isLoading: false,
        error: 'Failed to load project elements',
      }));
      console.error('Error loading project elements:', error);
    }
  }

  async saveProjectElements(
    username: string,
    slug: string,
    elements: ProjectElementDto[]
  ): Promise<void> {
    try {
      this.state.update(s => ({ ...s, isSaving: true, error: undefined }));

      const updatedElements = await this.elementService
        .dinsertElements(
          elements,
          username,
          slug,
          this.xsrfService.getXsrfToken()
        )
        .toPromise();

      this.state.update(s => ({
        ...s,
        elements: updatedElements || [],
        isSaving: false,
      }));
    } catch (error) {
      this.state.update(s => ({
        ...s,
        isSaving: false,
        error: 'Failed to save project elements',
      }));
      console.error('Error saving project elements:', error);
    }
  }

  // Helper method to update elements locally (e.g., for drag-and-drop operations)
  updateElements(elements: ProjectElementDto[]): void {
    this.state.update(s => ({ ...s, elements }));
  }
}
