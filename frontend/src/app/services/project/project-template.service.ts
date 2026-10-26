import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  type ElementRelationship,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { type Generator } from '@models/generator';
import { type ElementTag, type TagDefinition } from '@models/tag.model';
import { firstValueFrom } from 'rxjs';

import { type MediaTag } from '../../models/media-tag.model';
import {
  ARCHIVE_VERSION,
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
import { type TimeSystem } from '../../models/time-system';
import { LoggerService } from '../core/logger.service';

/**
 * What a template contains: a starter has the structure (element types,
 * folders, publishing plans) and no content; a demo is filled in to explore.
 */
export type ProjectTemplateVariant = 'starter' | 'demo';

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
  /** The kind of project this belongs to; templates sharing one are offered together */
  group?: string;
  /** Whether it is a bare starter or a filled-in demo (defaults to a starter) */
  variant?: ProjectTemplateVariant;
}

/**
 * A kind of project, shown as one choice in the new project picker. Its
 * templates (a starter, a demo) are offered once the kind is picked.
 */
export interface ProjectTemplateGroup {
  id: string;
  name: string;
  description: string;
  icon: string;
}

/** The template index: kinds of project and the templates inside them. */
export interface ProjectTemplateCatalog {
  groups: ProjectTemplateGroup[];
  templates: ProjectTemplateInfo[];
}

/**
 * Template index file structure. `groups` is optional: an index without it
 * lists every template as a kind of its own.
 */
interface TemplateIndex {
  version: number;
  groups?: ProjectTemplateGroup[];
  templates: ProjectTemplateInfo[];
}

/**
 * Service for loading project templates from assets.
 *
 * Templates are stored in `assets/project-templates/` and follow
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

  private readonly TEMPLATES_BASE_PATH = 'assets/project-templates/';

  private cachedCatalog: ProjectTemplateCatalog | null = null;

  /**
   * Get the list of available project templates.
   */
  async getTemplates(): Promise<ProjectTemplateInfo[]> {
    return (await this.getCatalog()).templates;
  }

  /**
   * Get the kinds of project and the templates in each. Every template
   * belongs to a group; one with none, or with an unknown one, gets a group
   * of its own, so an index written before groups existed still works.
   */
  async getCatalog(): Promise<ProjectTemplateCatalog> {
    if (this.cachedCatalog) {
      return this.cachedCatalog;
    }

    try {
      const index = await firstValueFrom(
        this.http.get<TemplateIndex>(`${this.TEMPLATES_BASE_PATH}index.json`)
      );
      this.cachedCatalog = this.buildCatalog(index);
      return this.cachedCatalog;
    } catch (error) {
      this.logger.error(
        'ProjectTemplateService',
        'Failed to load template index',
        error
      );
      throw error;
    }
  }

  private buildCatalog(index: TemplateIndex): ProjectTemplateCatalog {
    const declared = index.groups ?? [];
    const known = new Set(declared.map(g => g.id));
    const groups = [...declared];
    const templates = index.templates.map(template => {
      if (template.group && known.has(template.group)) return template;
      groups.push({
        id: template.id,
        name: template.name,
        description: template.description,
        icon: template.icon,
      });
      known.add(template.id);
      return { ...template, group: template.id };
    });
    return { groups, templates };
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
      timeSystems,
      generators,
      relationships,
      customRelationshipTypes,
      tags,
      elementTags,
      publishPlans,
      snapshots,
      media,
      mediaTags,
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
      this.loadJsonFile<TimeSystem[]>(basePath, 'time-systems.json', []),
      this.loadJsonFile<Generator[]>(basePath, 'generators.json', []),
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
      this.loadJsonFile<MediaTag[]>(basePath, 'media-tags.json', []),
    ]);

    // Templates are always authored against the current schema, so force
    // the manifest version to ARCHIVE_VERSION to prevent migrations from
    // wiping populated data (e.g. time-systems.json in a v1 manifest).
    manifest.version = ARCHIVE_VERSION;

    return {
      manifest,
      project,
      elements,
      documents,
      worldbuilding,
      schemas,
      timeSystems,
      generators,
      relationships,
      customRelationshipTypes,
      tags,
      elementTags,
      publishPlans,
      snapshots,
      media: await this.loadMediaBlobs(basePath, media),
      mediaTags,
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
    this.cachedCatalog = null;
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
