import { computed, inject, Injectable } from '@angular/core';
import { Element, Project } from '@inkweld/index';

import { SetupService } from '../core/setup.service';
import { DocumentImportService } from '../project/document-import.service';
import { ProjectService } from '../project/project.service';
import { ProjectTemplateService } from '../project/project-template.service';
import { OfflineProjectService } from './offline-project.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';

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

  async createProject(
    projectData: Partial<Project>,
    templateId?: string
  ): Promise<Project> {
    const mode = this.setupService.getMode();
    let project: Project;

    if (mode === 'offline') {
      project = await this.offlineProjectService.createProject(projectData);
    } else if (mode === 'server') {
      // For server mode, we need to provide required fields
      const fullProjectData: Project = {
        id: projectData.id || '',
        title: projectData.title || 'Untitled Project',
        description: projectData.description || '',
        slug: projectData.slug || 'untitled-project',
        username: projectData.username || 'unknown',
        createdDate: projectData.createdDate || new Date().toISOString(),
        updatedDate: projectData.updatedDate || new Date().toISOString(),
        ...projectData,
      };
      project = await this.projectService.createProject(fullProjectData);
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
