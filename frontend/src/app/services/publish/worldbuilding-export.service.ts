import { inject, Injectable } from '@angular/core';

import {
  type ElementTypeSchema,
  type FieldSchema,
  FieldType,
} from '../../models/schema-types';
import { LocalStorageService } from '../local/local-storage.service';
import { ProjectStateService } from '../project/project-state.service';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';

export interface WorldbuildingExportField {
  label: string;
  value: string;
}

export interface WorldbuildingExportSection {
  heading: string;
  fields: WorldbuildingExportField[];
}

export interface WorldbuildingExportData {
  title: string;
  image: Blob | null;
  imageMimeType: string | null;
  description: string | null;
  sections: WorldbuildingExportSection[];
}

@Injectable({
  providedIn: 'root',
})
export class WorldbuildingExportService {
  private readonly projectStateService = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly localStorage = inject(LocalStorageService);

  /**
   * Load a single worldbuilding element's data for export.
   * Returns a normalized structure suitable for rendering by any generator.
   * Cleans up the Yjs connection after reading to prevent resource leaks.
   */
  async loadWorldbuildingEntry(
    elementId: string,
    elementName: string
  ): Promise<WorldbuildingExportData | null> {
    const project = this.projectStateService.project();
    if (!project) return null;

    const { username, slug } = project;

    try {
      // Load identity data (image URL, description)
      const identity = await this.worldbuildingService.getIdentityData(
        elementId,
        username,
        slug
      );

      // Load schema-specific field data
      const data = await this.worldbuildingService.getWorldbuildingData(
        elementId,
        username,
        slug
      );

      // Look up the schema for section ordering and field labels
      const schema = await this.worldbuildingService.getSchemaForElement(
        elementId,
        username,
        slug
      );

      // Resolve the identity image blob
      const { image, imageMimeType } = await this.resolveImage(
        identity.image,
        username,
        slug
      );

      // Build sections from schema tabs + data
      const sections = this.buildSections(schema, data ?? {});

      return {
        title: elementName,
        image,
        imageMimeType,
        description: identity.description || null,
        sections,
      };
    } finally {
      // Always clean up the Yjs connection after reading
      this.worldbuildingService.destroyConnection(elementId, username, slug);
    }
  }

  private async resolveImage(
    imageUrl: string | undefined,
    username: string,
    slug: string
  ): Promise<{ image: Blob | null; imageMimeType: string | null }> {
    if (!imageUrl) return { image: null, imageMimeType: null };

    // Extract media ID from media:// URL
    const mediaId = imageUrl.startsWith('media://')
      ? imageUrl.slice('media://'.length)
      : null;

    if (!mediaId) return { image: null, imageMimeType: null };

    const projectKey = `${username}/${slug}`;
    const blob = await this.localStorage.getMedia(projectKey, mediaId);

    if (!blob) return { image: null, imageMimeType: null };

    return {
      image: blob,
      imageMimeType: blob.type || 'image/png',
    };
  }

  private buildSections(
    schema: ElementTypeSchema | null,
    data: Record<string, unknown>
  ): WorldbuildingExportSection[] {
    if (!schema) {
      // No schema — render raw data as a single section
      return this.buildRawSection(data);
    }

    const sortedTabs = [...schema.tabs].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );

    const sections: WorldbuildingExportSection[] = [];

    for (const tab of sortedTabs) {
      const fields = this.buildFields(tab.fields, data);
      if (fields.length > 0) {
        sections.push({ heading: tab.label, fields });
      }
    }

    return sections;
  }

  private buildFields(
    fieldSchemas: FieldSchema[],
    data: Record<string, unknown>
  ): WorldbuildingExportField[] {
    const fields: WorldbuildingExportField[] = [];

    for (const field of fieldSchemas) {
      const raw = data[field.key];
      const formatted = this.formatFieldValue(raw, field);

      if (formatted !== null) {
        fields.push({ label: field.label, value: formatted });
      }
    }

    return fields;
  }

  private formatFieldValue(raw: unknown, field: FieldSchema): string | null {
    if (raw === null || raw === undefined || raw === '') return null;

    const fieldType = field.type as FieldType;

    switch (fieldType) {
      case FieldType.CHECKBOX:
        // Treat false as empty in v1 (can't distinguish unset from intentionally false)
        return raw === true ? 'Yes' : null;

      case FieldType.ARRAY:
      case FieldType.MULTISELECT: {
        if (!Array.isArray(raw)) return null;
        const filtered = raw.filter(
          (v): v is string => typeof v === 'string' && v !== ''
        );
        return filtered.length > 0 ? filtered.join(', ') : null;
      }

      case FieldType.SELECT: {
        const strVal = typeof raw === 'string' ? raw : '';
        // Try to find the display label from options
        if (field.options) {
          for (const opt of field.options) {
            if (typeof opt === 'object' && opt.value === strVal) {
              return opt.label;
            }
          }
        }
        return strVal || null;
      }

      case FieldType.NUMBER:
        return typeof raw === 'number'
          ? String(raw)
          : typeof raw === 'string'
            ? raw || null
            : null;

      case FieldType.DATE:
      case FieldType.TEXT:
      case FieldType.TEXTAREA:
      default:
        return typeof raw === 'string' && raw !== '' ? raw : null;
    }
  }

  private buildRawSection(
    data: Record<string, unknown>
  ): WorldbuildingExportSection[] {
    const fields: WorldbuildingExportField[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        key === 'lastModified' ||
        key.startsWith('_')
      ) {
        continue;
      }

      let formatted: string;
      if (Array.isArray(value)) {
        const filtered = value.filter(Boolean);
        if (filtered.length === 0) continue;
        formatted = filtered.join(', ');
      } else if (typeof value === 'object') {
        continue;
      } else {
        formatted = String(value as string | number | boolean);
        if (!formatted) continue;
      }

      fields.push({ label: key, value: formatted });
    }

    if (fields.length === 0) return [];
    return [{ heading: 'Details', fields }];
  }
}
