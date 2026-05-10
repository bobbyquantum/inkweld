import { inject, Injectable } from '@angular/core';
import { type Element } from '@inkweld/index';

import { type WorldbuildingItem } from '../../models/publish-plan';
import { type WorldbuildingLayout } from '../../models/publish-style';
import {
  type ElementTypeSchema,
  type FieldSchema,
  type FieldType,
  type TabSchema,
} from '../../models/schema-types';
import { isWorldbuildingType } from '../../utils/worldbuilding.utils';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';

/**
 * Format-agnostic representation of a single rendered worldbuilding entry,
 * ready to be serialized by the format-specific generator.
 */
export interface RenderedWorldbuildingEntry {
  elementId: string;
  /** Display name (from element name / identity). */
  title: string;
  /** Schema id (when known) so the generator can pick per-schema CSS classes. */
  schemaId?: string;
  /** Schema display label. */
  schemaLabel?: string;
  /** Resolved layout requested for this entry. */
  layout: WorldbuildingLayout;
  /** Optional description from identity block. */
  description?: string;
  /** Optional image (data URL or path) from identity block. */
  imageRef?: string;
  /** Tab-grouped fields with values. */
  tabs: RenderedWorldbuildingTab[];
}

export interface RenderedWorldbuildingTab {
  /** Stable tab key (matches schema). */
  key: string;
  /** Display label from schema. */
  label: string;
  fields: RenderedWorldbuildingField[];
}

export interface RenderedWorldbuildingField {
  /** Dotted key (e.g., "stats.height"). */
  key: string;
  label: string;
  /** Raw value from Yjs map. */
  rawValue: unknown;
  /** Pre-formatted display string (always a string, "" if blank). */
  displayValue: string;
  type: FieldType | string;
}

/**
 * Loads worldbuilding entries for a {@link WorldbuildingItem} and produces a
 * format-agnostic {@link RenderedWorldbuildingEntry} list. The HTML, EPUB,
 * and PDF generators each translate the rendered structure into their own
 * markup using styles emitted by the CSS or Typst emitter services.
 */
@Injectable({ providedIn: 'root' })
export class WorldbuildingPublishRendererService {
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuilding = inject(WorldbuildingService);

  /**
   * Renders the entries selected by the publish item, in element order.
   * Filters by category (matching schema name or id) when the item lists
   * any. Skips elements that are not worldbuilding type.
   */
  async renderItem(
    item: WorldbuildingItem,
    elements: Element[]
  ): Promise<RenderedWorldbuildingEntry[]> {
    const project = this.projectState.project();
    if (!project) return [];

    const layout: WorldbuildingLayout = item.layout ?? 'card';
    const entries: RenderedWorldbuildingEntry[] = [];
    const schemas = this.worldbuilding.getAllSchemas();

    for (const element of elements) {
      if (!isWorldbuildingType(element.type)) continue;
      const rendered = await this.renderEntry(
        element,
        project.username,
        project.slug,
        layout,
        schemas,
        item
      );
      if (!rendered) continue;
      // Category filter: schema name OR id match (case-insensitive)
      if (item.categories?.length) {
        const cats = item.categories.map(c => c.toLowerCase());
        const candidates = [
          rendered.schemaId?.toLowerCase(),
          rendered.schemaLabel?.toLowerCase(),
        ].filter(Boolean) as string[];
        if (!candidates.some(c => cats.includes(c))) continue;
      }
      entries.push(rendered);
    }

    return entries;
  }

  private async renderEntry(
    element: Element,
    username: string,
    slug: string,
    layout: WorldbuildingLayout,
    schemas: ElementTypeSchema[],
    item: WorldbuildingItem
  ): Promise<RenderedWorldbuildingEntry | null> {
    let schema: ElementTypeSchema | null = null;
    try {
      schema = await this.worldbuilding.getSchemaForElement(
        element.id,
        username,
        slug
      );
    } catch (err) {
      this.logger.warn(
        'WorldbuildingPublishRenderer',
        `Failed to load schema for ${element.id}`,
        err
      );
    }

    let data: Record<string, unknown> | null = null;
    try {
      data = await this.worldbuilding.getWorldbuildingData(
        element.id,
        username,
        slug
      );
    } catch (err) {
      this.logger.warn(
        'WorldbuildingPublishRenderer',
        `Failed to load data for ${element.id}`,
        err
      );
    }
    data = data ?? {};

    let identityImage: string | undefined;
    let identityDescription: string | undefined;
    if (item.includeIdentity !== false || item.includeImages !== false) {
      try {
        const identity = await this.worldbuilding.getIdentityData(
          element.id,
          username,
          slug
        );
        identityImage = identity.image;
        identityDescription = identity.description;
      } catch {
        // identity data is optional
      }
    }

    const tabs: RenderedWorldbuildingTab[] = [];
    const includeKeys = item.includedFieldKeys
      ? new Set(item.includedFieldKeys)
      : null;
    const excludeKeys = item.excludedFieldKeys
      ? new Set(item.excludedFieldKeys)
      : null;

    if (schema) {
      const orderedTabs = [...schema.tabs].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      for (const tab of orderedTabs) {
        const fields = this.collectTabFields(
          tab,
          data,
          includeKeys,
          excludeKeys,
          item.includeEmptyFields ?? false
        );
        if (fields.length === 0) continue;
        tabs.push({ key: tab.key, label: tab.label, fields });
      }
    } else {
      // No schema: emit one synthetic tab from raw keys
      const fields: RenderedWorldbuildingField[] = [];
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('_') || key === 'lastModified') continue;
        if (includeKeys && !includeKeys.has(key)) continue;
        if (excludeKeys && excludeKeys.has(key)) continue;
        const display = formatFieldValue(value);
        if (!display && !(item.includeEmptyFields ?? false)) continue;
        fields.push({
          key,
          label: humanizeKey(key),
          rawValue: value,
          displayValue: display,
          type: 'text',
        });
      }
      if (fields.length) {
        tabs.push({ key: 'fields', label: 'Fields', fields });
      }
    }

    return {
      elementId: element.id,
      title: element.name,
      schemaId: schema?.id,
      schemaLabel: schema?.name,
      layout,
      description:
        item.includeIdentity === false ? undefined : identityDescription,
      imageRef: item.includeImages === false ? undefined : identityImage,
      tabs,
    };
  }

  private collectTabFields(
    tab: TabSchema,
    data: Record<string, unknown>,
    includeKeys: Set<string> | null,
    excludeKeys: Set<string> | null,
    includeEmpty: boolean,
    keyPrefix = ''
  ): RenderedWorldbuildingField[] {
    const out: RenderedWorldbuildingField[] = [];
    for (const field of tab.fields) {
      this.collectField(
        field,
        data,
        includeKeys,
        excludeKeys,
        includeEmpty,
        keyPrefix,
        out
      );
    }
    return out;
  }

  private collectField(
    field: FieldSchema,
    data: Record<string, unknown>,
    includeKeys: Set<string> | null,
    excludeKeys: Set<string> | null,
    includeEmpty: boolean,
    keyPrefix: string,
    out: RenderedWorldbuildingField[]
  ): void {
    const fullKey = keyPrefix ? `${keyPrefix}.${field.key}` : field.key;

    if (field.isNested && field.nestedFields?.length) {
      for (const nested of field.nestedFields) {
        this.collectField(
          nested,
          data,
          includeKeys,
          excludeKeys,
          includeEmpty,
          fullKey,
          out
        );
      }
      return;
    }

    if (includeKeys && !includeKeys.has(fullKey)) return;
    if (excludeKeys && excludeKeys.has(fullKey)) return;
    if (fullKey.startsWith('_') || fullKey === 'lastModified') return;

    const value = readDottedKey(data, fullKey);
    const display = formatFieldValue(value);
    if (!display && !includeEmpty) return;

    out.push({
      key: fullKey,
      label: field.label,
      rawValue: value,
      displayValue: display,
      type: field.type,
    });
  }
}

/**
 * Reads a dotted-path value from a nested object/Y.Map JSON snapshot.
 */
function readDottedKey(data: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) {
    return data[key];
  }
  const parts = key.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    // Drop only null/undefined entries — `0`, `false`, and `''` are
    // legitimate values that `formatFieldValue` knows how to render
    // ("0", "No", "" respectively); the join below skips empties.
    return value
      .filter(v => v !== null && v !== undefined)
      .map(v => formatFieldValue(v))
      .filter(s => s !== '')
      .join(', ');
  }
  if (typeof value === 'object') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function humanizeKey(key: string): string {
  return key
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}
