import { inject, Injectable, signal } from '@angular/core';

import { Project } from '@inkweld/index';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { SetupService } from '../core/setup.service';

const OFFLINE_PROJECTS_STORAGE_KEY = 'inkweld-offline-projects';

@Injectable({
  providedIn: 'root',
})
export class OfflineProjectService {
  private setupService = inject(SetupService);
  private offlineElementsService = inject(OfflineProjectElementsService);

  readonly projects = signal<Project[]>([]);
  readonly isLoading = signal(false);
  readonly initialized = signal(false);

  constructor() {
    this.loadOfflineProjects();
  }

  /**
   * Load all offline projects
   */
  loadProjects(): void {
    if (!this.initialized()) {
      this.loadOfflineProjects();
      this.initialized.set(true);
    }
  }

  /**
   * Force reload of offline projects from localStorage
   * Useful when projects have been added externally (e.g., in tests)
   */
  reloadProjects(): void {
    this.loadOfflineProjects();
  }

  /**
   * Get a specific project
   */
  getProject(username: string, slug: string): Project | null {
    const projects = this.projects();
    return (
      projects.find(p => p.username === username && p.slug === slug) || null
    );
  }

  /**
   * Create a new project
   */
  async createProject(projectData: Partial<Project>): Promise<Project> {
    this.isLoading.set(true);

    const userProfile = this.setupService.getOfflineUserProfile();
    if (!userProfile) {
      throw new Error('No offline user profile found');
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: projectData.id || `offline-${crypto.randomUUID()}`,
      title: projectData.title || 'Untitled Project',
      description: projectData.description || '',
      slug:
        projectData.slug ||
        this.generateSlug(projectData.title || 'untitled-project'),
      username: userProfile.username,
      coverImage: null, // No cover by default
      createdDate: now,
      updatedDate: now,
      ...projectData,
    };

    try {
      const projects = this.projects();

      // Check for duplicate slug
      if (
        projects.some(
          p => p.slug === project.slug && p.username === project.username
        )
      ) {
        throw new Error('A project with this slug already exists');
      }

      const updatedProjects = [...projects, project];
      this.projects.set(updatedProjects);
      this.saveProjects(updatedProjects);

      // Create default project structure (now async)
      await this.offlineElementsService.createDefaultStructure(
        project.username,
        project.slug
      );

      return project;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Update an existing project
   */
  updateProject(
    username: string,
    slug: string,
    updates: Partial<Project>
  ): Project {
    this.isLoading.set(true);

    try {
      const projects = this.projects();
      const projectIndex = projects.findIndex(
        p => p.username === username && p.slug === slug
      );

      if (projectIndex === -1) {
        throw new Error('Project not found');
      }

      const updatedProject: Project = {
        ...projects[projectIndex],
        ...updates,
        updatedDate: new Date().toISOString(),
      };

      const updatedProjects = [...projects];
      updatedProjects[projectIndex] = updatedProject;

      this.projects.set(updatedProjects);
      this.saveProjects(updatedProjects);

      return updatedProject;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Delete a project
   */
  deleteProject(username: string, slug: string): void {
    this.isLoading.set(true);

    try {
      const projects = this.projects();
      const updatedProjects = projects.filter(
        p => !(p.username === username && p.slug === slug)
      );

      this.projects.set(updatedProjects);
      this.saveProjects(updatedProjects);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Get projects by username
   */
  getProjectsByUsername(username: string): Project[] {
    return this.projects().filter(p => p.username === username);
  }

  /**
   * Import projects from an export
   */
  importProjects(importedProjects: Project[]): void {
    const currentProjects = this.projects();
    const userProfile = this.setupService.getOfflineUserProfile();

    if (!userProfile) {
      throw new Error('No offline user profile found');
    }

    // Update imported projects to use current user
    const updatedImports = importedProjects.map(project => ({
      ...project,
      username: userProfile.username,
      createdDate: project.createdDate || new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    }));

    // Merge with existing projects, avoiding duplicates
    const mergedProjects = [...currentProjects];
    for (const importedProject of updatedImports) {
      const existingIndex = mergedProjects.findIndex(
        p =>
          p.slug === importedProject.slug &&
          p.username === importedProject.username
      );

      if (existingIndex >= 0) {
        // Update existing project
        mergedProjects[existingIndex] = importedProject;
      } else {
        // Add new project
        mergedProjects.push(importedProject);
      }
    }

    this.projects.set(mergedProjects);
    this.saveProjects(mergedProjects);
  }

  private loadOfflineProjects(): void {
    const projects = this.getStoredProjects();
    this.projects.set(projects);
    this.initialized.set(true);
  }

  private getStoredProjects(): Project[] {
    try {
      const stored = localStorage.getItem(OFFLINE_PROJECTS_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Project[]) : [];
    } catch (error) {
      console.error('Failed to load offline projects:', error);
      return [];
    }
  }

  private saveProjects(projects: Project[]): void {
    try {
      localStorage.setItem(
        OFFLINE_PROJECTS_STORAGE_KEY,
        JSON.stringify(projects)
      );
    } catch (error) {
      console.error('Failed to save offline projects:', error);
      throw error;
    }
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50);
  }
}
