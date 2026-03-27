import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  type ElementRelationship,
  type RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import {
  type ElementTag,
  type TagDefinition,
} from '../../components/tags/tag.model';
import {
  type ArchiveDocumentContent,
  type ArchiveElement,
  type ArchiveManifest,
  type ArchiveMediaFile,
  type ArchiveProject,
  type ArchiveSnapshot,
  type ArchiveWorldbuildingData,
  type ProjectArchive,
} from '../../models/project-archive';
import { type PublishPlan } from '../../models/publish-plan';
import { type ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';

/**
 * Template metadata for display in the UI.
 */
export interface ProjectTemplateInfo {
  /** Unique template ID */
  id: string;
  /** Display name */
  name: string;
  /** Description for the user */
  description: string;
  /** Material icon name */
  icon: string;
  /** Folder name in assets */
  folder: string;
}

/**
 * Template index file structure.
 */
interface TemplateIndex {
  version: number;
  templates: ProjectTemplateInfo[];
}

/**
 * Service for loading project templates from assets.
 *
 * Templates are stored in `/assets/project-templates/` and follow
 * the same format as project export archives (manifest.json, project.json,
 * elements.json, etc.) - just as individual JSON files instead of a ZIP.
 *
 * This allows exported projects to be easily converted into templates
 * by extracting their content to a template folder.
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectTemplateService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(LoggerService);

  private readonly TEMPLATES_BASE_PATH = '/assets/project-templates/';

  private cachedIndex: ProjectTemplateInfo[] | null = null;

  /**
   * Get the list of available project templates.
   */
  async getTemplates(): Promise<ProjectTemplateInfo[]> {
    if (this.cachedIndex) {
      return this.cachedIndex;
    }

    try {
      const index = await firstValueFrom(
        this.http.get<TemplateIndex>(`${this.TEMPLATES_BASE_PATH}index.json`)
      );
      this.cachedIndex = index.templates;
      return this.cachedIndex;
    } catch (error) {
      this.logger.error(
        'ProjectTemplateService',
        'Failed to load template index',
        error
      );
      throw error;
    }
  }

  /**
   * Load a complete template as a ProjectArchive.
   *
   * The returned archive can be used with the same import logic
   * as ZIP file imports.
   *
   * @param templateId - The template ID to load
   * @returns The template as a ProjectArchive
   */
  async loadTemplate(templateId: string): Promise<ProjectArchive> {
    const templates = await this.getTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const basePath = `${this.TEMPLATES_BASE_PATH}${template.folder}/`;

    // Load all template files in parallel
    const [
      manifest,
      project,
      elements,
      documents,
      worldbuilding,
      schemas,
      relationships,
      customRelationshipTypes,
      tags,
      elementTags,
      publishPlans,
      snapshots,
      media,
    ] = await Promise.all([
      this.loadJsonFile<ArchiveManifest>(basePath, 'manifest.json'),
      this.loadJsonFile<ArchiveProject>(basePath, 'project.json'),
      this.loadJsonFile<ArchiveElement[]>(basePath, 'elements.json'),
      this.loadJsonFile<ArchiveDocumentContent[]>(basePath, 'documents.json'),
      this.loadJsonFile<ArchiveWorldbuildingData[]>(
        basePath,
        'worldbuilding.json'
      ),
      this.loadJsonFile<ElementTypeSchema[]>(basePath, 'schemas.json', []),
      this.loadJsonFile<ElementRelationship[]>(
        basePath,
        'relationships.json',
        []
      ),
      this.loadJsonFile<RelationshipTypeDefinition[]>(
        basePath,
        'relationship-types.json',
        []
      ),
      this.loadJsonFile<TagDefinition[]>(basePath, 'tags.json', []),
      this.loadJsonFile<ElementTag[]>(basePath, 'element-tags.json', []),
      this.loadJsonFile<PublishPlan[]>(basePath, 'publish-plans.json', []),
      this.loadJsonFile<ArchiveSnapshot[]>(basePath, 'snapshots.json', []),
      this.loadJsonFile<ArchiveMediaFile[]>(basePath, 'media.json', []),
    ]);

    return {
      manifest,
      project,
      elements,
      documents,
      worldbuilding,
      schemas,
      relationships,
      customRelationshipTypes,
      tags,
      elementTags,
      publishPlans,
      snapshots,
      media: await this.loadMediaBlobs(basePath, media),
    };
  }

  /**
   * Get template info by ID.
   */
  async getTemplateInfo(
    templateId: string
  ): Promise<ProjectTemplateInfo | undefined> {
    const templates = await this.getTemplates();
    return templates.find(t => t.id === templateId);
  }

  /**
   * Clear the cached template index.
   */
  clearCache(): void {
    this.cachedIndex = null;
  }

  /**
   * Load a JSON file from the template folder.
   */
  private async loadJsonFile<T>(
    basePath: string,
    filename: string,
    defaultValue?: T
  ): Promise<T> {
    try {
      return await firstValueFrom(this.http.get<T>(`${basePath}${filename}`));
    } catch {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Failed to load template file: ${filename}`);
    }
  }

  /**
   * Load media blobs from the template folder and attach them to the media manifest.
   * Deduplicates fetches for entries sharing the same archivePath.
   */
  private async loadMediaBlobs(
    basePath: string,
    media: ArchiveMediaFile[]
  ): Promise<ArchiveMediaFile[]> {
    if (media.length === 0) {
      return media;
    }

    // Deduplicate blob fetches by archivePath
    const uniquePaths = [...new Set(media.map(m => m.archivePath))];
    const blobMap = new Map<string, Blob>();

    await Promise.all(
      uniquePaths.map(async archivePath => {
        try {
          const blob = await firstValueFrom(
            this.http.get(`${basePath}${archivePath}`, {
              responseType: 'blob',
            })
          );
          blobMap.set(archivePath, blob);
        } catch (error) {
          this.logger.warn(
            'ProjectTemplateService',
            `Failed to load template media: ${archivePath}`,
            error
          );
        }
      })
    );

    return media.map(m => ({
      ...m,
      blob: blobMap.get(m.archivePath),
    }));
  }
}
