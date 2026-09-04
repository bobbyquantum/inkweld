import type {
  ElementTypeSchema,
  FieldSchema,
  TabSchema,
} from '@models/schema-types';

/**
 * Merge an element's customised schema copy with the current shared project
 * schema ("update from shared schema", whole-schema apply).
 *
 * Rules:
 * - The shared schema wins for every tab and field present in both, matched
 *   by key. Local label/icon tweaks on shared items are overwritten.
 * - Local-only tabs (key not in shared) are appended after the shared tabs.
 * - Local-only fields inside a shared tab are appended to that tab.
 * - Nothing here touches element data; a field that the shared schema
 *   removed simply stops being shown, its value stays in the element doc.
 *
 * The result carries the shared schema's `version` so the element copy
 * records which shared revision it was last aligned to.
 */
export function mergeElementSchema(
  local: ElementTypeSchema,
  shared: ElementTypeSchema
): ElementTypeSchema {
  const merged: ElementTypeSchema = structuredClone(shared);
  const sharedTabsByKey = new Map(merged.tabs.map(tab => [tab.key, tab]));

  for (const localTab of local.tabs) {
    const sharedTab = sharedTabsByKey.get(localTab.key);
    if (!sharedTab) {
      merged.tabs.push(structuredClone(localTab));
      continue;
    }
    const sharedFieldKeys = new Set(
      (sharedTab.fields ?? []).map(field => field.key)
    );
    const localOnlyFields = (localTab.fields ?? []).filter(
      field => !sharedFieldKeys.has(field.key)
    );
    if (localOnlyFields.length > 0) {
      sharedTab.fields = [
        ...(sharedTab.fields ?? []),
        ...localOnlyFields.map(field => structuredClone(field)),
      ];
    }
  }

  merged.updatedAt = new Date().toISOString();
  return merged;
}

/** Summary of how a merge would change an element schema, for confirmations. */
export interface SchemaMergeSummary {
  /** Tabs only in the element copy that will be kept */
  localOnlyTabs: string[];
  /** Fields only in the element copy that will be kept (as "Tab · Field") */
  localOnlyFields: string[];
  /** Tabs in the element copy that the shared schema no longer has and that are unchanged locally, i.e. will be removed */
  removedTabs: string[];
}

/**
 * Describe the local additions that {@link mergeElementSchema} would keep.
 * Used to explain the operation before it runs.
 */
export function summariseLocalAdditions(
  local: ElementTypeSchema,
  shared: ElementTypeSchema
): SchemaMergeSummary {
  const sharedTabsByKey = new Map<string, TabSchema>(
    shared.tabs.map(tab => [tab.key, tab])
  );
  const localOnlyTabs: string[] = [];
  const localOnlyFields: string[] = [];

  for (const localTab of local.tabs) {
    const sharedTab = sharedTabsByKey.get(localTab.key);
    if (!sharedTab) {
      localOnlyTabs.push(localTab.label);
      continue;
    }
    const sharedKeys = new Set(
      (sharedTab.fields ?? []).map((f: FieldSchema) => f.key)
    );
    for (const field of localTab.fields ?? []) {
      if (!sharedKeys.has(field.key)) {
        localOnlyFields.push(`${localTab.label} · ${field.label}`);
      }
    }
  }

  return { localOnlyTabs, localOnlyFields, removedTabs: [] };
}
