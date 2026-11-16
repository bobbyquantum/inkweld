/**
 * Relationship fields: worldbuilding template fields whose value is a set of
 * links to other elements (a Location's "Part of", a Character's "Mother").
 *
 * The value of a relationship field is never stored in the element's data
 * map. Each link is a relationship in the project's central relationships
 * store, of the field's auto-managed type (`relationshipTypeId`), with the
 * element that owns the field as source and the linked element as target.
 * That is what makes a link show up as a relationship and as a backlink on
 * the target.
 *
 * The app's relationship field (`RelationshipFieldComponent`), the browser
 * agent tools (WebMCP `update_worldbuilding`) and the server's MCP
 * `update_worldbuilding` all write links through {@link planRelationshipFieldLinks},
 * so they turn a list of ids into the same relationships. Reads derive the
 * field's value from the store with {@link linkedTargetIds}.
 *
 * No dependencies; nothing here touches Yjs, Angular or the DOM.
 */

/** The field type of a relationship field. */
export const RELATIONSHIP_FIELD_TYPE = 'relationship';

/** The element type a relationship field can link to. */
export const LINKABLE_ELEMENT_TYPE = 'WORLDBUILDING';

/** The parts of a template field a relationship field needs (a subset of `FieldSchema`). */
export interface RelationshipFieldDefinition {
  key: string;
  label?: string;
  type?: string;
  /** More than one linked element; a single-valued field links at most one. */
  multiple?: boolean;
  /** The template a linked element must use; empty means any worldbuilding element. */
  targetSchemaId?: string;
  /** The auto-managed relationship type backing the field. */
  relationshipTypeId?: string;
}

/** A relationship as stored in the project's relationships array. */
export interface FieldRelationshipRecord {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  relationshipTypeId: string;
}

/** What validation needs to know about an element a field links to. */
export interface LinkableElement {
  id: string;
  name?: string;
  type?: string;
  schemaId?: string | null;
}

/** True when `field` is a relationship field. */
export function isRelationshipField(field: { type?: unknown } | null | undefined): boolean {
  return field?.type === RELATIONSHIP_FIELD_TYPE;
}

/**
 * Every relationship field in a schema's tabs (top-level tab fields, as the
 * editor lays them out), skipping malformed entries.
 */
export function relationshipFieldsOfSchema(schema: unknown): RelationshipFieldDefinition[] {
  const tabs = (schema as { tabs?: unknown } | null)?.tabs;
  if (!Array.isArray(tabs)) return [];
  return tabs.flatMap((tab) => {
    const fields = (tab as { fields?: unknown } | null)?.fields;
    if (!Array.isArray(fields)) return [];
    return fields.filter(
      (field): field is RelationshipFieldDefinition =>
        isRelationshipField(field as { type?: unknown } | null) &&
        typeof (field as { key?: unknown }).key === 'string' &&
        (field as { key: string }).key !== ''
    );
  });
}

export type ParsedRelationshipFieldValue = { ids: string[] } | { error: string };

/**
 * Read a value given for a relationship field as a list of element ids:
 * an array of ids, a single id string, or null / an empty string / an empty
 * array to clear the field. Ids are trimmed and duplicates dropped, in order.
 */
export function parseRelationshipFieldValue(
  field: RelationshipFieldDefinition,
  value: unknown
): ParsedRelationshipFieldValue {
  if (value === null || value === undefined) return { ids: [] };
  const items: unknown[] = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') {
      return {
        error: `Field "${field.key}" is a relationship field: give an element id or an array of element ids (null or [] clears it).`,
      };
    }
    const id = item.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return { ids };
}

function describeElement(element: LinkableElement): string {
  return element.name ? `"${element.name}" (${element.id})` : `"${element.id}"`;
}

/**
 * Why `ids` can't be the links of `field` on `sourceElementId`, one message
 * per problem; empty when they can. The rules are the element picker's: only
 * existing worldbuilding elements, of the field's target template when it has
 * one, never the element itself, and at most one unless the field is
 * `multiple`. `schemaName` turns a template id into a name for the messages.
 */
export function relationshipFieldLinkErrors(
  field: RelationshipFieldDefinition,
  sourceElementId: string,
  ids: readonly string[],
  findElement: (id: string) => LinkableElement | undefined,
  schemaName: (schemaId: string) => string | undefined = () => undefined
): string[] {
  const prefix = `Field "${field.key}"`;
  if (!field.relationshipTypeId) {
    return [
      `${prefix} has no relationship type yet. Open its template in the app once so it gets one, then try again.`,
    ];
  }

  const errors: string[] = [];
  if (field.multiple !== true && ids.length > 1) {
    errors.push(`${prefix} links a single element, but ${ids.length} ids were given.`);
  }
  const target = field.targetSchemaId;
  const describeSchema = (schemaId: string): string => {
    const name = schemaName(schemaId);
    return name ? `"${name}" (${schemaId})` : `"${schemaId}"`;
  };
  for (const id of ids) {
    if (id === sourceElementId) {
      errors.push(`${prefix} can't link an element to itself.`);
      continue;
    }
    const element = findElement(id);
    if (!element) {
      errors.push(`${prefix}: there is no element with id "${id}".`);
    } else if (element.type !== undefined && element.type !== LINKABLE_ELEMENT_TYPE) {
      errors.push(
        `${prefix} links worldbuilding elements, but ${describeElement(element)} is a ${element.type}.`
      );
    } else if (target && element.schemaId !== target) {
      const actual = element.schemaId ? describeSchema(element.schemaId) : 'no template';
      errors.push(
        `${prefix} only links elements of template ${describeSchema(target)}, but ${describeElement(element)} uses ${actual}.`
      );
    }
  }
  return errors;
}

/** The relationships of `relationshipTypeId` that start at `sourceElementId`, in store order. */
export function fieldRelationships<R extends FieldRelationshipRecord>(
  sourceElementId: string,
  relationshipTypeId: string,
  relationships: readonly R[]
): R[] {
  return relationships.filter(
    (r) =>
      !!r &&
      r.sourceElementId === sourceElementId &&
      r.relationshipTypeId === relationshipTypeId
  );
}

/**
 * The value of a relationship field: the ids of the elements it links, in the
 * order they were linked, without duplicates. `elementExists` leaves out
 * links to deleted elements, as the field does.
 */
export function linkedTargetIds(
  sourceElementId: string,
  relationshipTypeId: string,
  relationships: readonly FieldRelationshipRecord[],
  elementExists: (id: string) => boolean = () => true
): string[] {
  const ids: string[] = [];
  for (const r of fieldRelationships(sourceElementId, relationshipTypeId, relationships)) {
    if (!ids.includes(r.targetElementId) && elementExists(r.targetElementId)) {
      ids.push(r.targetElementId);
    }
  }
  return ids;
}

export interface RelationshipFieldLinkPlan<R extends FieldRelationshipRecord> {
  /** Target ids to link: a new relationship each, source = the field's element. */
  add: string[];
  /** Relationships to delete. */
  remove: R[];
}

/**
 * Turn the ids a relationship field should link into the relationships to add
 * and remove, against the field's current relationships.
 *
 * - An id the field doesn't link yet gets a new relationship.
 * - A relationship whose target is no longer wanted is removed, as is one
 *   pointing at a deleted element and any duplicate link to the same target.
 * - Ids of elements that don't exist are skipped (validate first with
 *   {@link relationshipFieldLinkErrors} to report them instead).
 */
export function planRelationshipFieldLinks<R extends FieldRelationshipRecord>(options: {
  sourceElementId: string;
  relationshipTypeId: string;
  desiredIds: readonly string[];
  relationships: readonly R[];
  elementExists: (id: string) => boolean;
}): RelationshipFieldLinkPlan<R> {
  const { sourceElementId, relationshipTypeId, relationships, elementExists } = options;
  const desired = new Set(options.desiredIds.filter((id) => elementExists(id)));

  const kept = new Set<string>();
  const remove: R[] = [];
  for (const r of fieldRelationships(sourceElementId, relationshipTypeId, relationships)) {
    if (desired.has(r.targetElementId) && !kept.has(r.targetElementId)) {
      kept.add(r.targetElementId);
    } else {
      remove.push(r);
    }
  }

  const add: string[] = [];
  for (const id of options.desiredIds) {
    if (desired.has(id) && !kept.has(id) && !add.includes(id)) add.push(id);
  }
  return { add, remove };
}
