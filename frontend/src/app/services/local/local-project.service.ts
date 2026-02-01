import { inject, Injectable, signal } from '@angular/core';
import { Project } from '@inkweld/index';

import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';
import { LocalProjectElementsService } from './local-project-elements.service';
import { ProjectSyncService } from './project-sync.service';

const LOCAL_PROJECTS_BASE_KEY = 'inkweld-local-projects';
const MIGRATED_PROJECTS_BASE_KEY = 'inkweld-migrated-projects';

/**
 * Track which projects have been migrated to which servers
 */
export interface MigratedProjectInfo {
  originalSlug: string;
  migratedSlug: string;
  serverUrl: string;
  migratedAt: string;
  migratedUsername: string;
}

@Injectable({
  providedIn: 'root',
})
export class LocalProjectService {
  private setupService = inject(SetupService);
  private storageContext = inject(StorageContextService);
  private localElementsService = inject(LocalProjectElementsService);
  private projectSyncService = inject(ProjectSyncService);

  readonly projects = signal<Project[]>([]);
  readonly migratedProjects = signal<MigratedProjectInfo[]>([]);
  readonly isLoading = signal(false);
  readonly initialized = signal(false);

  constructor() {
    this.loadLocalProjects();
    this.loadMigratedProjects();
  }

  /**
   * Get the prefixed storage key for the current context
   */
  private get storageKey(): string {
    return this.storageContext.prefixKey(LOCAL_PROJECTS_BASE_KEY);
  }

  /**
   * Get the prefixed storage key for migrated projects
   */
  private get migratedStorageKey(): string {
    return this.storageContext.prefixKey(MIGRATED_PROJECTS_BASE_KEY);
  }

  /**
   * Load all local projects
   */
  loadProjects(): void {
    if (!this.initialized()) {
      this.loadLocalProjects();
      this.loadMigratedProjects();
      this.initialized.set(true);
    }
  }

  /**
   * Force reload of local projects from localStorage
   * Useful when projects have been added externally (e.g., in tests)
   */
  reloadProjects(): void {
    this.loadLocalProjects();
    this.loadMigratedProjects();
  }

  /**
   * Get projects from the local-mode storage, regardless of current context.
   * This is used during migration when the context has already switched to server mode
   * but we still need to read the original local projects.
   */
  getLocalModeProjects(): Project[] {
    const localPrefix = this.storageContext.getPrefixForConfig('local');
    const key = `${localPrefix}${LOCAL_PROJECTS_BASE_KEY}`;
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as Project[]) : [];
    } catch (error) {
      console.error('Failed to load local mode projects:', error);
      return [];
    }
  }

  /**
   * Get migrated projects info from local-mode storage, regardless of current context.
   * This is used during migration to check which projects have already been migrated.
   */
  getLocalModeMigratedProjects(): MigratedProjectInfo[] {
    const localPrefix = this.storageContext.getPrefixForConfig('local');
    const key = `${localPrefix}${MIGRATED_PROJECTS_BASE_KEY}`;
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as MigratedProjectInfo[]) : [];
    } catch (error) {
      console.error('Failed to load local mode migrated projects:', error);
      return [];
    }
  }

  /**
   * Get non-migrated projects only (for migration flow).
   * Uses getLocalModeProjects to ensure we read from local storage
   * even when the app has switched to server mode.
   */
  getNonMigratedProjects(): Project[] {
    const migrated = this.getLocalModeMigratedProjects();
    return this.getLocalModeProjects().filter(
      p => !migrated.some(m => m.originalSlug === p.slug)
    );
  }

  /**
   * Delete a project from local-mode storage, regardless of current context.
   * This is used during migration cleanup when we're already in server mode.
   */
  deleteLocalModeProject(username: string, slug: string): void {
    const localPrefix = this.storageContext.getPrefixForConfig('local');
    const key = `${localPrefix}${LOCAL_PROJECTS_BASE_KEY}`;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return;

      const projects = JSON.parse(stored) as Project[];
      const updatedProjects = projects.filter(
        p => !(p.username === username && p.slug === slug)
      );
      localStorage.setItem(key, JSON.stringify(updatedProjects));

      // If we're currently in local mode, update the signal too
      if (this.storageContext.getActiveConfig()?.id === 'local') {
        this.projects.set(updatedProjects);
      }
    } catch (error) {
      console.error('Failed to delete local mode project:', error);
    }
  }

  /**
   * Check if a project has been migrated
   */
  isProjectMigrated(slug: string): boolean {
    return this.migratedProjects().some(m => m.originalSlug === slug);
  }

  /**
   * Mark a project as migrated
   */
  markProjectAsMigrated(
    originalSlug: string,
    migratedSlug: string,
    serverUrl: string,
    migratedUsername: string
  ): void {
    const migrated = this.migratedProjects();
    const existing = migrated.findIndex(m => m.originalSlug === originalSlug);

    const info: MigratedProjectInfo = {
      originalSlug,
      migratedSlug,
      serverUrl,
      migratedUsername,
      migratedAt: new Date().toISOString(),
    };

    if (existing >= 0) {
      migrated[existing] = info;
    } else {
      migrated.push(info);
    }

    this.migratedProjects.set([...migrated]);
    this.saveMigratedProjects(migrated);
  }

  /**
   * Get migration info for a project
   */
  getMigrationInfo(slug: string): MigratedProjectInfo | null {
    return this.migratedProjects().find(m => m.originalSlug === slug) ?? null;
  }

  private loadMigratedProjects(): void {
    try {
      const stored = localStorage.getItem(this.migratedStorageKey);
      this.migratedProjects.set(
        stored ? (JSON.parse(stored) as MigratedProjectInfo[]) : []
      );
    } catch (error) {
      console.error('Failed to load migrated projects:', error);
      this.migratedProjects.set([]);
    }
  }

  private saveMigratedProjects(migrated: MigratedProjectInfo[]): void {
    try {
      localStorage.setItem(this.migratedStorageKey, JSON.stringify(migrated));
    } catch (error) {
      console.error('Failed to save migrated projects:', error);
    }
  }

  /**
   * Create a project entry in a specific config's storage.
   * Used during migration to create the project in server-mode storage
   * while still being able to read from local-mode storage.
   *
   * @param project - The project to create
   * @param targetConfigId - The config ID to create the project in (e.g., 'local' or server config ID)
   * @param targetUsername - The username for the project in the target context
   * @param targetSlug - Optional new slug if different from project.slug
   */
  createProjectInConfig(
    project: Project,
    targetConfigId: string,
    targetUsername: string,
    targetSlug?: string
  ): void {
    const prefix = this.storageContext.getPrefixForConfig(targetConfigId);
    const targetKey = `${prefix}${LOCAL_PROJECTS_BASE_KEY}`;

    // Load existing projects from target storage
    let existingProjects: Project[] = [];
    try {
      const stored = localStorage.getItem(targetKey);
      existingProjects = stored ? (JSON.parse(stored) as Project[]) : [];
    } catch (error) {
      console.error('Failed to load projects from target storage:', error);
    }

    const now = new Date().toISOString();
    const newProject: Project = {
      ...project,
      slug: targetSlug ?? project.slug,
      username: targetUsername,
      updatedDate: now,
    };

    // Check for duplicates
    const existingIndex = existingProjects.findIndex(
      p => p.slug === newProject.slug && p.username === newProject.username
    );

    if (existingIndex >= 0) {
      // Update existing
      existingProjects[existingIndex] = newProject;
    } else {
      // Add new
      existingProjects.push(newProject);
    }

    // Save to target storage
    try {
      localStorage.setItem(targetKey, JSON.stringify(existingProjects));
    } catch (error) {
      console.error('Failed to save project to target storage:', error);
      throw error;
    }
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

    const userProfile = this.setupService.getLocalUserProfile();
    if (!userProfile) {
      throw new Error('No local user profile found');
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: projectData.id || `local-${crypto.randomUUID()}`,
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
      await this.localElementsService.createDefaultStructure(
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
   * Delete a project and optionally create a tombstone to prevent re-sync.
   * @param username - The project owner's username
   * @param slug - The project slug
   * @param options - Optional settings for the delete operation
   * @param options.createTombstone - Whether to create a tombstone (default: true).
   *        Set to false when deleting due to discovering a tombstone from another device.
   */
  deleteProject(
    username: string,
    slug: string,
    options: { createTombstone?: boolean } = {}
  ): void {
    const { createTombstone = true } = options;
    this.isLoading.set(true);

    try {
      const projectKey = `${username}/${slug}`;
      const projects = this.projects();
      const updatedProjects = projects.filter(
        p => !(p.username === username && p.slug === slug)
      );

      this.projects.set(updatedProjects);
      this.saveProjects(updatedProjects);

      // Create a tombstone to prevent this project from being re-uploaded
      // from other offline devices (unless we're deleting due to an existing tombstone)
      if (createTombstone) {
        void this.projectSyncService.createTombstone(projectKey);
      }
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
    const userProfile = this.setupService.getLocalUserProfile();

    if (!userProfile) {
      throw new Error('No local user profile found');
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

  private loadLocalProjects(): void {
    const projects = this.getStoredProjects();
    this.projects.set(projects);
    this.initialized.set(true);
  }

  private getStoredProjects(): Project[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? (JSON.parse(stored) as Project[]) : [];
    } catch (error) {
      console.error('Failed to load local projects:', error);
      return [];
    }
  }

  private saveProjects(projects: Project[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(projects));
    } catch (error) {
      console.error('Failed to save local projects:', error);
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
