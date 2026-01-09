import { computed, inject, Injectable } from '@angular/core';
import { Element, Project } from '@inkweld/index';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentImportService } from '../project/document-import.service';
import {
  ProjectService,
  ProjectServiceError,
} from '../project/project.service';
import { ProjectTemplateService } from '../project/project-template.service';
import { UnifiedUserService } from '../user/unified-user.service';
import { OfflineProjectService } from './offline-project.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { ProjectSyncService } from './project-sync.service';

@Injectable({
  providedIn: 'root',
})
export class UnifiedProjectService {
  private setupService = inject(SetupService);
  private projectService = inject(ProjectService);
  private offlineProjectService = inject(OfflineProjectService);
  private offlineElements = inject(OfflineProjectElementsService);
  private templateService = inject(ProjectTemplateService);
  private documentImport = inject(DocumentImportService);
  private projectSync = inject(ProjectSyncService);
  private userService = inject(UnifiedUserService);
  private logger = inject(LoggerService);

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

  /**
   * Create a new project with local-first behavior.
   *
   * In server mode, this will:
   * 1. Try to create on the server first
   * 2. If the server is unavailable, create locally and queue for sync
   * 3. Apply template if specified
   *
   * In offline mode, this creates the project locally only.
   */
  async createProject(
    projectData: Partial<Project>,
    templateId?: string
  ): Promise<Project> {
    const mode = this.setupService.getMode();
    let project: Project;

    if (mode === 'offline') {
      project = await this.offlineProjectService.createProject(projectData);
    } else if (mode === 'server') {
      project = await this.createServerProjectWithFallback(
        projectData,
        templateId
      );
    } else {
      throw new Error('No mode configured');
    }

    // Apply template if specified (skip for 'empty' template as it has no data)
    if (templateId && templateId !== 'empty') {
      try {
        await this.applyTemplate(project.username, project.slug, templateId);
      } catch (error) {
        console.warn(
          `Failed to apply template '${templateId}', project created without template:`,
          error
        );
      }
    }

    return project;
  }

  /**
   * Create a project in server mode with local-first fallback.
   * If the server is unavailable, creates locally and queues for sync.
   */
  private async createServerProjectWithFallback(
    projectData: Partial<Project>,
    templateId?: string
  ): Promise<Project> {
    const currentUser = this.userService.currentUser();
    const username = projectData.username || currentUser?.username || 'unknown';
    const slug =
      projectData.slug ||
      this.generateSlug(projectData.title || 'untitled-project');
    const title = projectData.title || 'Untitled Project';
    const description = projectData.description || '';

    const fullProjectData: Project = {
      id: projectData.id || '',
      title,
      description,
      slug,
      username,
      createdDate: projectData.createdDate || new Date().toISOString(),
      updatedDate: projectData.updatedDate || new Date().toISOString(),
      ...projectData,
    };

    try {
      // Try to create on server first
      const project = await this.projectService.createProject(fullProjectData);
      this.logger.info(
        'UnifiedProject',
        `Project created on server: ${username}/${slug}`
      );
      return project;
    } catch (error) {
      // Check if this is a network/server error that we can recover from
      const isRecoverable =
        error instanceof ProjectServiceError &&
        (error.canUseCache || error.code === 'NETWORK_ERROR');

      if (!isRecoverable) {
        // Non-recoverable error (e.g., auth error, validation error)
        throw error;
      }

      // Server unavailable - create locally and queue for sync
      this.logger.warn(
        'UnifiedProject',
        `Server unavailable, creating project locally: ${username}/${slug}`
      );

      const localProject = await this.projectService.createLocalProject(
        { title, slug, description },
        username
      );

      // Queue for sync when server becomes available
      const projectKey = `${username}/${slug}`;
      await this.projectSync.markPendingCreation(
        projectKey,
        { title, slug, description },
        templateId
      );

      this.logger.info(
        'UnifiedProject',
        `Project created locally and queued for sync: ${projectKey}`
      );

      return localProject;
    }
  }

  /**
   * Generate a URL-safe slug from a title.
   */
  private generateSlug(title: string): string {
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50) || 'untitled-project'
    );
  }

  /**
   * Apply a template to a newly created project.
   * This imports elements, documents, schemas, relationships, etc.
   */
  private async applyTemplate(
    username: string,
    slug: string,
    templateId: string
  ): Promise<void> {
    const archive = await this.templateService.loadTemplate(templateId);

    // Import elements
    if (archive.elements.length > 0) {
      const fullElements: Element[] = archive.elements.map(ae => ({
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
      await this.offlineElements.saveElements(username, slug, fullElements);
    }

    // Import documents
    for (const doc of archive.documents) {
      const documentId = `${username}:${slug}:${doc.elementId}`;
      await this.documentImport.writeDocumentContent(documentId, doc.content);
    }

    // Import worldbuilding data
    for (const wb of archive.worldbuilding) {
      await this.documentImport.writeWorldbuildingData(wb, username, slug);
    }

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

    // Import publish plans
    if (archive.publishPlans.length > 0) {
      await this.offlineElements.savePublishPlans(
        username,
        slug,
        archive.publishPlans
      );
    }

    // Import custom tags from template
    if (archive.tags.length > 0) {
      await this.offlineElements.saveCustomTags(username, slug, archive.tags);
    }

    // Import element tag assignments from template
    if (archive.elementTags.length > 0) {
      await this.offlineElements.saveElementTags(
        username,
        slug,
        archive.elementTags
      );
    }
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
