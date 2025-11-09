import { computed, inject, Injectable } from '@angular/core';

import { Project } from '../../api-client/model/project';
import { OfflineProjectService } from './offline-project.service';
import { ProjectService } from './project.service';
import { SetupService } from './setup.service';

@Injectable({
  providedIn: 'root',
})
export class UnifiedProjectService {
  private setupService = inject(SetupService);
  private projectService = inject(ProjectService);
  private offlineProjectService = inject(OfflineProjectService);

  readonly projects = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.projects();
    }
    return this.projectService.projects();
  });

  readonly isLoading = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.isLoading();
    }
    return this.projectService.isLoading();
  });

  readonly hasProjects = computed(() => this.projects().length > 0);

  readonly initialized = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.initialized();
    }
    return this.projectService.initialized();
  });

  readonly error = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return undefined; // Offline mode doesn't have network errors
    }
    return this.projectService.error();
  });

  async loadProjects(): Promise<void> {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      this.offlineProjectService.loadProjects();
      return Promise.resolve();
    } else if (mode === 'server') {
      return this.projectService.loadAllProjects();
    }
  }

  async getProject(username: string, slug: string): Promise<Project | null> {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.getProject(username, slug);
    } else if (mode === 'server') {
      return this.projectService.getProjectByUsernameAndSlug(username, slug);
    }
    return null;
  }

  async createProject(projectData: Partial<Project>): Promise<Project> {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.createProject(projectData);
    } else if (mode === 'server') {
      // For server mode, we need to provide required fields
      const fullProjectData: Project = {
        title: projectData.title || 'Untitled Project',
        description: projectData.description || '',
        slug: projectData.slug || 'untitled-project',
        username: projectData.username || 'unknown',
        createdDate: projectData.createdDate || new Date().toISOString(),
        updatedDate: projectData.updatedDate || new Date().toISOString(),
        ...projectData,
      };
      return this.projectService.createProject(fullProjectData);
    }
    throw new Error('No mode configured');
  }

  async updateProject(
    username: string,
    slug: string,
    updates: Partial<Project>
  ): Promise<Project> {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.updateProject(username, slug, updates);
    } else if (mode === 'server') {
      // For server mode, get the existing project and merge updates
      const existing = await this.projectService.getProjectByUsernameAndSlug(
        username,
        slug
      );
      const fullProjectData: Project = {
        ...existing,
        ...updates,
        updatedDate: new Date().toISOString(),
      };
      return this.projectService.updateProject(username, slug, fullProjectData);
    }
    throw new Error('No mode configured');
  }

  async deleteProject(username: string, slug: string): Promise<void> {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.deleteProject(username, slug);
    } else if (mode === 'server') {
      return this.projectService.deleteProject(username, slug);
    }
  }

  getProjectsByUsername(username: string): Project[] {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      return this.offlineProjectService.getProjectsByUsername(username);
    } else if (mode === 'server') {
      return this.projects().filter(p => p.username === username);
    }
    return [];
  }

  importProjects(importedProjects: Project[]): void {
    const mode = this.setupService.getMode();
    if (mode === 'offline') {
      this.offlineProjectService.importProjects(importedProjects);
    } else {
      // Server mode import would need to be implemented differently
      throw new Error('Import not yet supported in server mode');
    }
  }

  getMode(): 'server' | 'offline' | null {
    return this.setupService.getMode();
  }
}




