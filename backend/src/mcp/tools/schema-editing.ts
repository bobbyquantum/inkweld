/**
 * Pure editing logic for the schema (template) MCP tools.
 *
 * Mirrors the frontend template editor: `SchemaEditService` (validation,
 * tab/field edits) and `RelationshipFieldService` (the auto-managed
 * relationship type behind every relationship field). The tool layer in
 * `schema.tools.ts` reads and writes the Yjs documents; everything here works
 * on plain objects so it can be unit tested.
 */

import { nanoid } from 'nanoid';
import { IDENTITY_FIELD_KEYS } from './worldbuilding-fields';

/** Field types the worldbuilding editor can render (`FieldType` in the frontend). */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'array',
  'checkbox',
  'relationship',
] as const;

const FIELD_TYPE_SET: ReadonlySet<string> = new Set(FIELD_TYPES);

/** A schema field as stored in the project doc. Unknown properties are kept. */
export interface SchemaField {
  key: string;
  label: string;
  type: string;
  relationshipTypeId?: string;
  [prop: string]: unknown;
}

/** A schema tab as stored in the project doc. Unknown properties are kept. */
export interface SchemaTab {
  key: string;
  label: string;
  icon?: string;
  order?: number;
  fields: SchemaField[];
  [prop: string]: unknown;
}

/** Relationship type definition, as stored in `customRelationshipTypes`. */
export interface RelationshipTypeDef {
  id: string;
  name: string;
  fieldSource?: { schemaId: string; fieldKey: string };
  [prop: string]: unknown;
}

/** An edit applied by `update_schema`. */
export type SchemaOperation =
  | {
      op: 'add_tab';
      key?: string;
      label: string;
      icon?: string;
      index?: number;
      fields?: unknown[];
    }
  | { op: 'update_tab'; tabKey: string; key?: string; label?: string; icon?: string }
  | { op: 'remove_tab'; tabKey: string }
  | { op: 'move_tab'; tabKey: string; index: number }
  | { op: 'add_field'; tabKey: string; field: unknown; index?: number }
  | { op: 'update_field'; fieldKey: string; patch: unknown }
  | { op: 'remove_field'; fieldKey: string }
  | { op: 'move_field'; fieldKey: string; toTabKey?: string; index?: number };

export type EditResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): EditResult<T> => ({ ok: true, value });
const fail = <T>(error: string): EditResult<T> => ({ ok: false, error });

/** String properties a caller may set on a field. */
const FIELD_STRING_PROPS = [
  'placeholder',
  'description',
  'icon',
  'targetSchemaId',
  'inverseLabel',
  'generatorId',
] as const;

/**
 * Properties a caller may set on a field. `id` and `relationshipTypeId` are
 * managed here; nested fields are not editable over MCP.
 */
const FIELD_INPUT_PROPS: ReadonlySet<string> = new Set([
  'key',
  'label',
  'type',
  'defaultValue',
  'options',
  'validation',
  'layout',
  'rows',
  'multiple',
  ...FIELD_STRING_PROPS,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Turn a label into a camelCase key that no existing key uses
 * ("Eye Colour" → "eyeColour", then "eyeColour2", ...).
 */
export function deriveKey(label: string, taken: ReadonlySet<string>, fallback: string): string {
  const words = label
    .normalize('NFKD')
    .replaceAll(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let base = words
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
  if (!base || /^\d/.test(base)) base = `${fallback}${base}`;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}

/** Every field key in a set of tabs. */
function allFieldKeys(tabs: readonly SchemaTab[]): Set<string> {
  return new Set(tabs.flatMap((tab) => tab.fields.map((field) => field.key)));
}

/**
 * Validate the properties of a field input or patch and copy the allowed ones.
 * `null` in a patch removes the property.
 */
function readFieldProps(
  input: Record<string, unknown>,
  isPatch: boolean
): EditResult<Record<string, unknown>> {
  const unknownProps = Object.keys(input).filter((prop) => !FIELD_INPUT_PROPS.has(prop));
  if (unknownProps.length > 0) {
    return fail(
      `unsupported field properties: ${unknownProps.join(', ')} ` +
        `(allowed: ${[...FIELD_INPUT_PROPS].join(', ')})`
    );
  }
  const props: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) {
      if (!isPatch) continue;
      if (prop === 'key' || prop === 'label' || prop === 'type') {
        return fail(`field ${prop} cannot be removed`);
      }
      props[prop] = null;
      continue;
    }
    const error = checkFieldProp(prop, value);
    if (error) return fail(error);
    props[prop] = typeof value === 'string' && prop !== 'defaultValue' ? value.trim() : value;
  }
  return ok(props);
}

/** Type-check one field property. Returns an error message or null. */
function checkFieldProp(prop: string, value: unknown): string | null {
  switch (prop) {
    case 'key':
    case 'label':
      return typeof value === 'string' && value.trim()
        ? null
        : `field ${prop} must be a non-empty string`;
    case 'type':
      return typeof value === 'string' && FIELD_TYPE_SET.has(value)
        ? null
        : `field type must be one of: ${FIELD_TYPES.join(', ')}`;
    case 'options':
      return Array.isArray(value) &&
        value.every(
          (option) =>
            typeof option === 'string' ||
            (isRecord(option) &&
              typeof option.value === 'string' &&
              typeof option.label === 'string')
        )
        ? null
        : 'field options must be an array of strings or { value, label } objects';
    case 'validation':
    case 'layout':
      return isRecord(value) ? null : `field ${prop} must be an object`;
    case 'rows':
      return Number.isInteger(value) && (value as number) > 0
        ? null
        : 'field rows must be a positive integer';
    case 'multiple':
      return typeof value === 'boolean' ? null : 'field multiple must be a boolean';
    case 'defaultValue':
      return null;
    default:
      return typeof value === 'string' ? null : `field ${prop} must be a string`;
  }
}

/** Reject a new or renamed key that would shadow an identity field. */
function checkNewFieldKey(key: string): string | null {
  if (IDENTITY_FIELD_KEYS.has(key)) {
    return (
      `field key "${key}" is reserved: every element already has an identity "${key}" ` +
      '(set it with update_worldbuilding), so a template field with that key would shadow it'
    );
  }
  return null;
}

/**
 * Build a new field from caller input. The key defaults to one derived from
 * the label; the type defaults to `text`.
 */
export function createField(input: unknown, taken: ReadonlySet<string>): EditResult<SchemaField> {
  if (!isRecord(input)) return fail('field must be an object');
  const props = readFieldProps(input, false);
  if (!props.ok) return props;
  const { key, label, type, ...rest } = props.value;
  if (typeof label !== 'string') return fail('field label is required');
  const fieldKey = typeof key === 'string' ? key : deriveKey(label, taken, 'field');
  const keyError = checkNewFieldKey(fieldKey);
  if (keyError) return fail(keyError);
  return ok({
    id: fieldKey,
    key: fieldKey,
    label,
    type: typeof type === 'string' ? type : 'text',
    layout: { span: 12 },
    ...rest,
  });
}

/** Build a list of new fields, deriving unique keys across the schema. */
function createFields(inputs: unknown, tabs: readonly SchemaTab[]): EditResult<SchemaField[]> {
  if (inputs === undefined) return ok([]);
  if (!Array.isArray(inputs)) return fail('fields must be an array');
  const taken = allFieldKeys(tabs);
  const fields: SchemaField[] = [];
  for (const input of inputs) {
    const field = createField(input, taken);
    if (!field.ok) return field;
    taken.add(field.value.key);
    fields.push(field.value);
  }
  return ok(fields);
}

/**
 * Build tabs from caller input (create_schema `tabs`, or a whole-tabs
 * replacement in update_schema). Existing relationship type ids are carried
 * over by field key so replacing the tabs doesn't orphan relationships.
 */
export function createTabs(
  inputs: unknown,
  previous: readonly SchemaTab[] = []
): EditResult<SchemaTab[]> {
  if (!Array.isArray(inputs)) return fail('tabs must be an array');
  const previousTypeIds = new Map(
    previous.flatMap((tab) =>
      tab.fields.filter((f) => f.relationshipTypeId).map((f) => [f.key, f.relationshipTypeId])
    )
  );
  const tabs: SchemaTab[] = [];
  for (const input of inputs) {
    if (!isRecord(input)) return fail('each tab must be an object');
    const tab = createTab(input, tabs);
    if (!tab.ok) return tab;
    tabs.push(tab.value);
  }
  for (const field of tabs.flatMap((tab) => tab.fields)) {
    const typeId = previousTypeIds.get(field.key);
    if (typeId && field.type === 'relationship') field.relationshipTypeId = typeId;
  }
  return ok(renumberTabs(tabs));
}

function createTab(
  input: Record<string, unknown>,
  existing: readonly SchemaTab[]
): EditResult<SchemaTab> {
  const { key, label, icon, fields } = input;
  if (typeof label !== 'string' || !label.trim()) return fail('each tab needs a label');
  if (key !== undefined && (typeof key !== 'string' || !key.trim())) {
    return fail('tab key must be a non-empty string');
  }
  if (icon !== undefined && typeof icon !== 'string') return fail('tab icon must be a string');
  const takenTabKeys = new Set(existing.map((tab) => tab.key));
  const tabKey = typeof key === 'string' ? key.trim() : deriveKey(label, takenTabKeys, 'tab');
  const newFields = createFields(fields, existing);
  if (!newFields.ok) return newFields;
  return ok({
    key: tabKey,
    label: label.trim(),
    icon: typeof icon === 'string' && icon.trim() ? icon.trim() : 'article',
    order: existing.length,
    fields: newFields.value,
  });
}

/** Keep each tab's `order` in step with its position. */
function renumberTabs(tabs: SchemaTab[]): SchemaTab[] {
  tabs.forEach((tab, index) => {
    tab.order = index;
  });
  return tabs;
}

function locateField(
  tabs: readonly SchemaTab[],
  fieldKey: string
): { tab: SchemaTab; index: number } | null {
  for (const tab of tabs) {
    const index = tab.fields.findIndex((field) => field.key === fieldKey);
    if (index >= 0) return { tab, index };
  }
  return null;
}

function clampIndex(index: unknown, length: number): number {
  if (typeof index !== 'number' || !Number.isInteger(index)) return length;
  if (index < 0) return Math.max(0, length + 1 + index);
  return Math.min(index, length);
}

/** Apply one operation to `tabs` in place. Returns an error message or null. */
function applyOperation(tabs: SchemaTab[], operation: unknown): string | null {
  if (!isRecord(operation) || typeof operation.op !== 'string') {
    return 'each operation must be an object with an "op"';
  }
  const op = operation as SchemaOperation;
  switch (op.op) {
    case 'add_tab': {
      const tab = createTab(op as unknown as Record<string, unknown>, tabs);
      if (!tab.ok) return tab.error;
      tabs.splice(clampIndex(op.index, tabs.length), 0, tab.value);
      return null;
    }
    case 'update_tab': {
      const tab = tabs.find((t) => t.key === op.tabKey);
      if (!tab) return `tab "${op.tabKey}" not found`;
      for (const prop of ['key', 'label', 'icon'] as const) {
        const value = op[prop];
        if (value === undefined) continue;
        if (typeof value !== 'string' || !value.trim())
          return `tab ${prop} must be a non-empty string`;
        tab[prop] = value.trim();
      }
      return null;
    }
    case 'remove_tab': {
      const index = tabs.findIndex((t) => t.key === op.tabKey);
      if (index < 0) return `tab "${op.tabKey}" not found`;
      tabs.splice(index, 1);
      return null;
    }
    case 'move_tab': {
      const index = tabs.findIndex((t) => t.key === op.tabKey);
      if (index < 0) return `tab "${op.tabKey}" not found`;
      const [tab] = tabs.splice(index, 1);
      tabs.splice(clampIndex(op.index, tabs.length), 0, tab);
      return null;
    }
    case 'add_field': {
      const tab = tabs.find((t) => t.key === op.tabKey);
      if (!tab) return `tab "${op.tabKey}" not found`;
      const field = createField(op.field, allFieldKeys(tabs));
      if (!field.ok) return field.error;
      tab.fields.splice(clampIndex(op.index, tab.fields.length), 0, field.value);
      return null;
    }
    case 'update_field':
      return updateField(tabs, op.fieldKey, op.patch);
    case 'remove_field': {
      const located = locateField(tabs, op.fieldKey);
      if (!located) return `field "${op.fieldKey}" not found`;
      located.tab.fields.splice(located.index, 1);
      return null;
    }
    case 'move_field': {
      const located = locateField(tabs, op.fieldKey);
      if (!located) return `field "${op.fieldKey}" not found`;
      const target =
        op.toTabKey === undefined ? located.tab : tabs.find((t) => t.key === op.toTabKey);
      if (!target) return `tab "${op.toTabKey}" not found`;
      const [field] = located.tab.fields.splice(located.index, 1);
      target.fields.splice(clampIndex(op.index, target.fields.length), 0, field);
      return null;
    }
    default:
      return `unknown operation "${(op as { op: string }).op}"`;
  }
}

function updateField(tabs: SchemaTab[], fieldKey: string, patch: unknown): string | null {
  const located = locateField(tabs, fieldKey);
  if (!located) return `field "${fieldKey}" not found`;
  if (!isRecord(patch)) return 'update_field needs a "patch" object';
  const props = readFieldProps(patch, true);
  if (!props.ok) return props.error;
  const current = located.tab.fields[located.index];
  const next: SchemaField = { ...current };
  for (const [prop, value] of Object.entries(props.value)) {
    if (value === null) delete next[prop];
    else next[prop] = value;
  }
  if (next.key !== current.key) {
    const keyError = checkNewFieldKey(next.key);
    if (keyError) return keyError;
    if (current.id === current.key) next.id = next.key;
  }
  located.tab.fields[located.index] = next;
  return null;
}

/** Apply `update_schema` operations to a copy of `tabs`, then validate. */
export function applySchemaOperations(
  tabs: readonly SchemaTab[],
  operations: unknown
): EditResult<SchemaTab[]> {
  if (!Array.isArray(operations)) return fail('operations must be an array');
  const next = structuredClone(tabs) as SchemaTab[];
  for (const [index, operation] of operations.entries()) {
    const error = applyOperation(next, operation);
    if (error) return fail(`operation ${index + 1}: ${error}`);
  }
  return ok(renumberTabs(next));
}

/**
 * Validate a set of tabs like the template editor does: labels and keys
 * present, tab keys unique, field keys unique across the schema, and no flat
 * field sharing a name with a nested field group. Returns an error or null.
 */
export function validateTabs(tabs: readonly SchemaTab[]): string | null {
  const tabKeys = new Set<string>();
  const fieldKeys = new Set<string>();
  const flatKeys = new Set<string>();
  const groupKeys = new Set<string>();
  for (const tab of tabs) {
    if (!tab.label?.trim()) return 'each tab needs a label';
    if (!tab.key?.trim()) return 'each tab needs a key';
    if (tabKeys.has(tab.key)) return `tab key "${tab.key}" is used twice`;
    tabKeys.add(tab.key);
    for (const field of tab.fields) {
      const key = field.key?.trim();
      if (!key) return 'each field needs a key';
      if (!field.label?.trim()) return `field "${key}" needs a label`;
      if (fieldKeys.has(key))
        return `field key "${key}" is used twice (keys must be unique across the template)`;
      fieldKeys.add(key);
      if (key.includes('.')) groupKeys.add(key.split('.')[0]);
      else flatKeys.add(key);
    }
  }
  for (const key of flatKeys) {
    if (groupKeys.has(key))
      return `field key "${key}" conflicts with a nested field group of the same name`;
  }
  return null;
}

/** Give a relationship field a fresh backing relationship type id. */
export function newRelationshipTypeId(): string {
  return `fieldrel-${nanoid(10)}`;
}

/** Give every relationship field without a backing type id a fresh one. */
export function stampRelationshipTypeIds(tabs: SchemaTab[]): void {
  for (const field of tabs.flatMap((tab) => tab.fields)) {
    if (field.type === 'relationship' && !field.relationshipTypeId) {
      field.relationshipTypeId = newRelationshipTypeId();
    }
  }
}

/**
 * The relationship type definition backing a relationship field. Must match
 * `RelationshipFieldService.buildTypeDef` in the frontend so it doesn't
 * rewrite the type when it next opens the template.
 */
export function buildRelationshipTypeDef(
  schemaId: string,
  field: SchemaField,
  typeId: string
): RelationshipTypeDef {
  const targetSchemaId = typeof field.targetSchemaId === 'string' ? field.targetSchemaId : '';
  return {
    id: typeId,
    name: field.label,
    inverseLabel: typeof field.inverseLabel === 'string' ? field.inverseLabel : field.label,
    showInverse: true,
    category: 'custom',
    isBuiltIn: false,
    sourceEndpoint: { allowedSchemas: [schemaId], maxCount: field.multiple ? null : 1 },
    targetEndpoint: { allowedSchemas: targetSchemaId ? [targetSchemaId] : [], maxCount: null },
    fieldSource: { schemaId, fieldKey: field.key },
  };
}

/** How the relationship types change for a schema edit. */
export interface RelationshipTypeChanges {
  /** Types to add, or to replace by id (merged over the existing one). */
  upserts: RelationshipTypeDef[];
  /** Types to delete, together with every relationship of that type. */
  removedTypeIds: string[];
}

/**
 * Work out the relationship type changes for a schema whose tabs go from
 * `before` to `after` (template editing: a field that stops being a
 * relationship field loses its type). Expects `after` to be stamped.
 */
export function planRelationshipTypeChanges(
  schemaId: string,
  before: readonly SchemaTab[],
  after: readonly SchemaTab[],
  existingTypes: readonly RelationshipTypeDef[]
): RelationshipTypeChanges {
  const existingById = new Map(existingTypes.map((type) => [type.id, type]));
  const upserts: RelationshipTypeDef[] = [];
  const keptTypeIds = new Set<string>();
  for (const field of after.flatMap((tab) => tab.fields)) {
    if (field.type !== 'relationship' || !field.relationshipTypeId) continue;
    keptTypeIds.add(field.relationshipTypeId);
    const desired = buildRelationshipTypeDef(schemaId, field, field.relationshipTypeId);
    const existing = existingById.get(desired.id);
    // Like the frontend's updateCustomType: keep extras such as icon and color.
    const merged = existing ? { ...existing, ...desired } : desired;
    if (!existing || JSON.stringify(existing) !== JSON.stringify(merged)) upserts.push(merged);
  }
  const removedTypeIds = before
    .flatMap((tab) => tab.fields)
    .filter((field) => field.type === 'relationship' && field.relationshipTypeId)
    .map((field) => field.relationshipTypeId as string)
    .filter((id) => !keptTypeIds.has(id));
  return { upserts, removedTypeIds: [...new Set(removedTypeIds)] };
}
