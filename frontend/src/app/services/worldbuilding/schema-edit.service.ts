import { inject, Injectable } from '@angular/core';
import {
  type ElementTypeSchema,
  type FieldSchema,
  type TabSchema,
} from '@models/schema-types';
import { RelationshipFieldService } from '@services/relationship/relationship-field.service';

/**
 * Key-based schema edit intents emitted by the worldbuilding editor when it is
 * in schema-edit mode. Shared by the template editor (shared project schema)
 * and the element editor (per-element schema copy).
 */
export type SchemaEditEvent =
  | { type: 'add-tab' }
  | { type: 'remove-tab'; tabKey: string }
  | { type: 'update-tab'; tabKey: string; patch: Partial<TabSchema> }
  | { type: 'add-field'; tabKey: string }
  | { type: 'remove-field'; tabKey: string; fieldKey: string }
  | { type: 'move-field'; tabKey: string; fieldKey: string; delta: -1 | 1 }
  | {
      type: 'update-field';
      tabKey: string;
      fieldKey: string;
      patch: Partial<FieldSchema>;
    };

export interface SchemaEditOptions {
  /**
   * When true (template editing), removing a relationship field or a tab that
   * contains one also removes its backing relationship type and every
   * relationship of that type. When false (per-element editing) types are
   * only ever created or updated, never removed, because other elements may
   * still use the shared field.
   */
  removeRelationshipTypes: boolean;
}

const DEFAULT_EDIT_OPTIONS: SchemaEditOptions = {
  removeRelationshipTypes: true,
};

export interface SchemaEditResult {
  /** The schema with the edit applied. Always returned, even when invalid. */
  schema: ElementTypeSchema;
  /** Validation error for the resulting schema, or null when it is valid. */
  error: string | null;
  /** Id of the field created by an `add-field` edit, for focus management. */
  addedFieldId: string | null;
}

/**
 * Pure-ish reducer for {@link SchemaEditEvent}s. The only side effects are
 * the relationship-type bookkeeping delegated to {@link RelationshipFieldService},
 * which must stay in step with relationship fields as they are created,
 * changed, or deleted.
 */
@Injectable({ providedIn: 'root' })
export class SchemaEditService {
  private readonly relationshipFieldService = inject(RelationshipFieldService);

  applyEdit(
    schema: ElementTypeSchema,
    event: SchemaEditEvent,
    options?: SchemaEditOptions
  ): SchemaEditResult {
    const opts = options ?? DEFAULT_EDIT_OPTIONS;
    const tabs: TabSchema[] = structuredClone(schema.tabs);
    let addedFieldId: string | null = null;

    switch (event.type) {
      case 'add-tab':
        tabs.push(this.createTab(tabs));
        break;
      case 'remove-tab':
        this.removeTab(tabs, event.tabKey, opts);
        break;
      case 'update-tab':
        this.updateTab(tabs, event.tabKey, event.patch);
        break;
      case 'add-field':
        addedFieldId = this.addField(tabs, event.tabKey);
        break;
      case 'remove-field':
        this.removeField(tabs, event.tabKey, event.fieldKey, opts);
        break;
      case 'update-field':
        this.updateField(
          schema.id,
          tabs,
          event.tabKey,
          event.fieldKey,
          event.patch,
          opts
        );
        break;
      case 'move-field':
        this.moveField(tabs, event.tabKey, event.fieldKey, event.delta);
        break;
    }

    return {
      schema: { ...schema, tabs },
      error: this.validateTabs(tabs),
      addedFieldId,
    };
  }

  private removeTab(
    tabs: TabSchema[],
    tabKey: string,
    opts: SchemaEditOptions
  ): void {
    const idx = tabs.findIndex(t => t.key === tabKey);
    if (idx < 0) return;
    if (opts.removeRelationshipTypes) {
      this.cleanupRelationshipFieldsInTab(tabs[idx]);
    }
    tabs.splice(idx, 1);
  }

  private updateTab(
    tabs: TabSchema[],
    tabKey: string,
    patch: Partial<TabSchema>
  ): void {
    const idx = tabs.findIndex(t => t.key === tabKey);
    if (idx >= 0) tabs[idx] = { ...tabs[idx], ...patch };
  }

  /** Returns the new field's id, or null when the tab does not exist. */
  private addField(tabs: TabSchema[], tabKey: string): string | null {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return null;
    const field = this.createField();
    tab.fields.push(field);
    return field.id ?? null;
  }

  private removeField(
    tabs: TabSchema[],
    tabKey: string,
    fieldKey: string,
    opts: SchemaEditOptions
  ): void {
    const located = this.locateField(tabs, tabKey, fieldKey);
    if (!located) return;
    if (opts.removeRelationshipTypes) {
      this.cleanupRelationshipField(located.tab.fields[located.index]);
    }
    located.tab.fields.splice(located.index, 1);
  }

  private updateField(
    schemaId: string,
    tabs: TabSchema[],
    tabKey: string,
    fieldKey: string,
    rawPatch: Partial<FieldSchema>,
    opts: SchemaEditOptions
  ): void {
    const located = this.locateField(tabs, tabKey, fieldKey);
    if (!located) return;
    const patch = { ...rawPatch };
    this.reconcileRelationshipField(
      schemaId,
      tabs,
      tabKey,
      located.tab.fields[located.index],
      patch,
      opts
    );
    located.tab.fields[located.index] = {
      ...located.tab.fields[located.index],
      ...patch,
    };
  }

  private moveField(
    tabs: TabSchema[],
    tabKey: string,
    fieldKey: string,
    delta: -1 | 1
  ): void {
    const located = this.locateField(tabs, tabKey, fieldKey);
    if (!located) return;
    const target = located.index + delta;
    if (target < 0 || target >= located.tab.fields.length) return;
    const [moved] = located.tab.fields.splice(located.index, 1);
    located.tab.fields.splice(target, 0, moved);
  }

  private locateField(
    tabs: TabSchema[],
    tabKey: string,
    fieldKey: string
  ): { tab: TabSchema; index: number } | null {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) return null;
    const index = tab.fields.findIndex(f => f.key === fieldKey);
    return index >= 0 ? { tab, index } : null;
  }

  /** A fresh tab with a label unique among its siblings. */
  createTab(existing: TabSchema[]): TabSchema {
    let label = 'New Tab';
    let counter = 1;
    const existingLabels = new Set(existing.map(t => t.label.toLowerCase()));
    while (existingLabels.has(label.toLowerCase())) {
      label = `New Tab ${counter}`;
      counter++;
    }
    return {
      key: this.createUniqueKey('tab'),
      label,
      icon: 'article',
      order: existing.length,
      fields: [],
    };
  }

  /** A fresh text field with a unique id/key. */
  createField(): FieldSchema {
    const fieldId = this.createUniqueKey('field');
    return {
      id: fieldId,
      key: fieldId,
      label: 'New Field',
      type: 'text',
      placeholder: '',
      layout: { span: 12 },
    };
  }

  createUniqueKey(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  /**
   * Validate a set of tabs: labels and keys present, tab keys unique, field
   * keys unique across the schema, and no flat field sharing a name with a
   * nested field group (the form can't hold a FormControl and a FormGroup
   * under one key). Returns a human-readable error or null.
   */
  validateTabs(tabs: TabSchema[]): string | null {
    const tabKeys = new Set<string>();
    const fieldKeys = new Set<string>();
    const flatKeys = new Set<string>();
    const groupKeys = new Set<string>();

    for (const tab of tabs) {
      const tabError = this.validateTab(tab, tabKeys);
      if (tabError) return tabError;

      for (const field of tab.fields) {
        const fieldError = this.validateField(
          field,
          fieldKeys,
          flatKeys,
          groupKeys
        );
        if (fieldError) return fieldError;
      }
    }

    for (const flatKey of flatKeys) {
      if (groupKeys.has(flatKey)) {
        return `Field key "${flatKey}" conflicts with a nested field group of the same name.`;
      }
    }
    return null;
  }

  private validateTab(tab: TabSchema, tabKeys: Set<string>): string | null {
    if (!tab.label.trim()) return 'Each tab needs a label.';
    const key = tab.key.trim();
    if (!key) return 'Each tab needs a key.';
    if (tabKeys.has(key)) return 'Tab keys must be unique.';
    tabKeys.add(key);
    return null;
  }

  private validateField(
    field: FieldSchema,
    fieldKeys: Set<string>,
    flatKeys: Set<string>,
    groupKeys: Set<string>
  ): string | null {
    const key = field.key.trim();
    if (!key) return 'Each field needs a key.';
    if (fieldKeys.has(key)) {
      return 'Field keys must be unique across the template.';
    }
    fieldKeys.add(key);
    if (key.includes('.')) {
      groupKeys.add(key.split('.')[0]);
    } else {
      flatKeys.add(key);
    }
    return null;
  }

  /**
   * Keep the backing relationship type in sync with an update-field patch.
   * Stamps a relationshipTypeId into the patch when a field becomes a
   * relationship field, re-ensures the type on any relationship-field edit,
   * and (when allowed) removes the type when a field stops being one.
   *
   * Guarded by a candidate-key check so the shared relationship store is
   * never mutated for an edit that validation will reject.
   */
  private reconcileRelationshipField(
    schemaId: string,
    tabs: TabSchema[],
    tabKey: string,
    current: FieldSchema,
    patch: Partial<FieldSchema>,
    options: SchemaEditOptions
  ): void {
    const candidateKey = patch.key ?? current.key;
    if (!this.isCandidateKeyValid(tabs, tabKey, current.key, candidateKey)) {
      return;
    }

    const wasRelationship =
      this.relationshipFieldService.isRelationshipField(current);
    const willBeRelationship =
      patch.type !== undefined
        ? patch.type === 'relationship'
        : wasRelationship;

    if (willBeRelationship) {
      const merged: FieldSchema = { ...current, ...patch };
      const stamped =
        this.relationshipFieldService.stampRelationshipTypeId(merged);
      patch.relationshipTypeId = stamped.relationshipTypeId;
      this.relationshipFieldService.ensureTypeForField(schemaId, stamped);
    } else if (wasRelationship && options.removeRelationshipTypes) {
      this.relationshipFieldService.removeTypeForField(current, true);
    }
  }

  private isCandidateKeyValid(
    tabs: TabSchema[],
    tabKey: string,
    currentKey: string,
    candidateKey: string
  ): boolean {
    const trimmed = candidateKey.trim();
    if (!trimmed) return false;
    const others: FieldSchema[] = [];
    for (const tab of tabs) {
      for (const field of tab.fields) {
        if (tab.key === tabKey && field.key === currentKey) continue;
        others.push(field);
      }
    }
    if (others.some(f => f.key.trim() === trimmed)) return false;

    const candidateIsNested = trimmed.includes('.');
    const candidateGroup = candidateIsNested ? trimmed.split('.')[0] : null;
    return !others.some(other => {
      const otherIsNested = other.key.includes('.');
      const otherGroup = otherIsNested ? other.key.split('.')[0] : null;
      if (candidateIsNested && !otherIsNested) {
        return other.key.trim() === candidateGroup;
      }
      return !candidateIsNested && otherIsNested && otherGroup === trimmed;
    });
  }

  private cleanupRelationshipField(field: FieldSchema): void {
    if (this.relationshipFieldService.isRelationshipField(field)) {
      this.relationshipFieldService.removeTypeForField(field, true);
    }
  }

  private cleanupRelationshipFieldsInTab(tab: TabSchema): void {
    tab.fields.forEach(field => this.cleanupRelationshipField(field));
  }
}
