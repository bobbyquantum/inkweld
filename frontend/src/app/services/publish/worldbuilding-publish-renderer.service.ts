import { inject, Injectable } from '@angular/core';
import { type Element } from '@inkweld/index';
import { type WorldbuildingItem } from '@models/publish-plan';
import { type WorldbuildingLayout } from '@models/publish-style';
import {
  type ElementTypeSchema,
  type FieldSchema,
  type FieldType,
  type TabSchema,
} from '@models/schema-types';

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
      if (!matchesCategoryFilter(rendered, item.categories)) continue;
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
    const schema = await this.loadSchemaSafe(element.id, username, slug);
    const data = await this.loadDataSafe(element.id, username, slug);
    const identity = await this.loadIdentitySafe(
      element.id,
      username,
      slug,
      item
    );

    const includeKeys = item.includedFieldKeys
      ? new Set(item.includedFieldKeys)
      : null;
    const excludeKeys = item.excludedFieldKeys
      ? new Set(item.excludedFieldKeys)
      : null;
    const includeEmpty = item.includeEmptyFields ?? false;

    const tabs = schema
      ? this.renderTabsFromSchema(
          schema,
          data,
          includeKeys,
          excludeKeys,
          includeEmpty
        )
      : this.renderSyntheticTab(data, includeKeys, excludeKeys, includeEmpty);

    return {
      elementId: element.id,
      title: element.name,
      schemaId: schema?.id,
      schemaLabel: schema?.name,
      layout,
      description:
        item.includeIdentity === false ? undefined : identity.description,
      imageRef: item.includeImages === false ? undefined : identity.image,
      tabs,
    };
  }

  private async loadSchemaSafe(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementTypeSchema | null> {
    try {
      return await this.worldbuilding.getSchemaForElement(
        elementId,
        username,
        slug
      );
    } catch (err) {
      this.logger.warn(
        'WorldbuildingPublishRenderer',
        `Failed to load schema for ${elementId}`,
        err
      );
      return null;
    }
  }

  private async loadDataSafe(
    elementId: string,
    username: string,
    slug: string
  ): Promise<Record<string, unknown>> {
    try {
      const data = await this.worldbuilding.getWorldbuildingData(
        elementId,
        username,
        slug
      );
      return data ?? {};
    } catch (err) {
      this.logger.warn(
        'WorldbuildingPublishRenderer',
        `Failed to load data for ${elementId}`,
        err
      );
      return {};
    }
  }

  private async loadIdentitySafe(
    elementId: string,
    username: string,
    slug: string,
    item: WorldbuildingItem
  ): Promise<{ image?: string; description?: string }> {
    if (item.includeIdentity === false && item.includeImages === false) {
      return {};
    }
    try {
      const identity = await this.worldbuilding.getIdentityData(
        elementId,
        username,
        slug
      );
      return { image: identity.image, description: identity.description };
    } catch {
      // identity data is optional
      return {};
    }
  }

  private renderTabsFromSchema(
    schema: ElementTypeSchema,
    data: Record<string, unknown>,
    includeKeys: Set<string> | null,
    excludeKeys: Set<string> | null,
    includeEmpty: boolean
  ): RenderedWorldbuildingTab[] {
    const tabs: RenderedWorldbuildingTab[] = [];
    const orderedTabs = [...schema.tabs].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    for (const tab of orderedTabs) {
      const fields = this.collectTabFields(
        tab,
        data,
        includeKeys,
        excludeKeys,
        includeEmpty
      );
      if (fields.length === 0) continue;
      tabs.push({ key: tab.key, label: tab.label, fields });
    }
    return tabs;
  }

  private renderSyntheticTab(
    data: Record<string, unknown>,
    includeKeys: Set<string> | null,
    excludeKeys: Set<string> | null,
    includeEmpty: boolean
  ): RenderedWorldbuildingTab[] {
    const fields: RenderedWorldbuildingField[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_') || key === 'lastModified') continue;
      if (includeKeys && !includeKeys.has(key)) continue;
      if (excludeKeys?.has(key)) continue;
      const display = formatFieldValue(value);
      if (!display && !includeEmpty) continue;
      fields.push({
        key,
        label: humanizeKey(key),
        rawValue: value,
        displayValue: display,
        type: 'text',
      });
    }
    return fields.length ? [{ key: 'fields', label: 'Fields', fields }] : [];
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
    if (excludeKeys?.has(fullKey)) return;
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

/**
 * Returns true when `entry` matches the (case-insensitive) category filter.
 * An empty/undefined category list matches every entry. The filter accepts
 * either schema id or schema label.
 */
function matchesCategoryFilter(
  entry: RenderedWorldbuildingEntry,
  categories: string[] | undefined
): boolean {
  if (!categories?.length) return true;
  const cats = new Set(categories.map(c => c.toLowerCase()));
  const candidates = [
    entry.schemaId?.toLowerCase(),
    entry.schemaLabel?.toLowerCase(),
  ].filter(Boolean) as string[];
  return candidates.some(c => cats.has(c));
}
