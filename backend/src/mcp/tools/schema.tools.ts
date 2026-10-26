/**
 * MCP Tools: Schemas (worldbuilding templates)
 *
 * Create, edit and delete the project's element types (Character, Location,
 * custom templates). Schemas live in the `schemas` array of the project
 * elements doc; relationship fields are backed by auto-managed relationship
 * types in its `customRelationshipTypes` array, which these tools keep in step
 * the way the frontend template editor does.
 *
 * Existing elements keep their own copy of their schema (see
 * `frontend/src/app/services/worldbuilding/AGENTS.md`), so editing a shared
 * schema never changes an existing element's fields: the element editor
 * offers "Update from shared schema" instead.
 *
 * Runtime-aware through `openEditableDocument` (live doc on Bun, a copy sent
 * back as a Yjs update on Workers).
 */

import { nanoid } from 'nanoid';
import type * as Y from 'yjs';
import type { McpContext, McpToolResult } from '../mcp.types';
import { registerTool } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import { logger } from '../../services/logger.service';
import { openEditableDocument } from '../../services/yjs-document-access';
import { parseProjectParam } from './search.tools';
import {
  FIELD_TYPES,
  type RelationshipTypeChanges,
  type RelationshipTypeDef,
  type SchemaTab,
  applySchemaOperations,
  createTabs,
  newRelationshipTypeId,
  planRelationshipTypeChanges,
  stampRelationshipTypeIds,
  validateTabs,
} from './schema-editing';

const mcpSchemaLog = logger.child('MCP-Schemas');

/** A schema as stored in the project doc. Unknown properties are kept. */
interface StoredSchema {
  id: string;
  name: string;
  icon: string;
  description: string;
  version: number;
  tabs: SchemaTab[];
  createdAt?: string;
  updatedAt?: string;
  [prop: string]: unknown;
}

/** Thrown inside a document edit to abort it with a tool error, before anything is written. */
class SchemaToolError extends Error {}

const SHARED_SCHEMA_NOTE =
  'Existing elements keep their own copy of their schema, so they are not changed: each one shows ' +
  '"shared schema updated" in the element editor and can take the change with "Update from shared schema". ' +
  'Elements created from now on use the new version.';

const projectProperty = {
  type: 'string',
  description:
    'Project identifier in "username/slug" format. Use list_projects to discover projects.',
} as const;

const fieldSchemaProperty = {
  type: 'object',
  description:
    'A template field. Required: label. Optional: key (camelCase, derived from the label when omitted; ' +
    'unique across the template; "description" and "image" are reserved identity fields), ' +
    `type (${FIELD_TYPES.join(', ')}; default text), placeholder, description (help text), defaultValue, ` +
    'options (select/multiselect: strings or { value, label }), rows (textarea), icon, validation ' +
    '({ required, minLength, maxLength, min, max, pattern }), layout ({ span: 1-12 }). ' +
    'Relationship fields: targetSchemaId (schema the linked element must use; omit for any), ' +
    "multiple (allow several links), inverseLabel (label on the linked element's backlinks).",
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    type: { type: 'string', enum: [...FIELD_TYPES] },
  },
  required: ['label'],
} as const;

const tabSchemaProperty = {
  type: 'object',
  description:
    'A template tab. Required: label. Optional: key (derived from the label), icon (Material icon name), fields.',
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    icon: { type: 'string' },
    fields: { type: 'array', items: fieldSchemaProperty },
  },
  required: ['label'],
} as const;

/** Wrap a JSON-serializable payload as a text tool result. */
function textResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** Build an `isError` tool result with an `Error:`-prefixed message. */
function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new SchemaToolError(`${name} must be a string`);
  return value.trim();
}

function isSchema(value: unknown): value is StoredSchema {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as StoredSchema).id === 'string' &&
    Array.isArray((value as StoredSchema).tabs)
  );
}

/**
 * Run `edit` against the project elements doc in one transaction and persist
 * it. `edit` must throw `SchemaToolError` before writing anything when the
 * request is invalid.
 */
async function editProjectDoc<T>(
  ctx: McpContext,
  username: string,
  slug: string,
  edit: (doc: Y.Doc) => T
): Promise<T> {
  const editable = await openEditableDocument(`${username}:${slug}:elements/`, {
    env: ctx.env,
    authToken: ctx.authToken,
  });
  const result = editable.doc.transact(() => edit(editable.doc));
  await editable.commit();
  return result;
}

function findSchema(doc: Y.Doc, schemaId: string): { index: number; schema: StoredSchema } {
  const schemas = doc.getArray<unknown>('schemas').toArray();
  const index = schemas.findIndex((s) => isSchema(s) && s.id === schemaId);
  if (index < 0) {
    const ids = schemas.filter(isSchema).map((s) => s.id);
    throw new SchemaToolError(
      `schema "${schemaId}" not found. Available: ${ids.join(', ') || 'none'} (see get_project_schemas)`
    );
  }
  return { index, schema: structuredClone(schemas[index]) as StoredSchema };
}

function replaceAt<T>(array: Y.Array<T>, index: number, value: T): void {
  array.delete(index, 1);
  array.insert(index, [value]);
}

/** Delete the items matching `predicate`, last first so indices stay valid. */
function deleteWhere<T>(array: Y.Array<T>, predicate: (item: T) => boolean): number {
  const indices = array
    .toArray()
    .flatMap((item, index) => (predicate(item) ? [index] : []))
    .reverse();
  for (const index of indices) array.delete(index, 1);
  return indices.length;
}

function readRelationshipTypes(doc: Y.Doc): RelationshipTypeDef[] {
  return doc
    .getArray<unknown>('customRelationshipTypes')
    .toArray()
    .filter(
      (t): t is RelationshipTypeDef =>
        !!t && typeof t === 'object' && typeof (t as RelationshipTypeDef).id === 'string'
    );
}

/**
 * Write relationship type changes: upsert types by id, and delete removed
 * types together with every relationship of that type (as the template
 * editor does when a relationship field is removed).
 */
function applyRelationshipTypeChanges(
  doc: Y.Doc,
  changes: RelationshipTypeChanges
): {
  relationshipTypesChanged: number;
  relationshipTypesRemoved: number;
  relationshipsRemoved: number;
} {
  const types = doc.getArray<RelationshipTypeDef>('customRelationshipTypes');
  for (const type of changes.upserts) {
    const index = types.toArray().findIndex((t) => t?.id === type.id);
    if (index >= 0) replaceAt(types, index, type);
    else types.push([type]);
  }
  const removed = new Set(changes.removedTypeIds);
  const relationshipTypesRemoved = deleteWhere(types, (t) => removed.has(t?.id));
  const relationshipsRemoved = deleteWhere(
    doc.getArray<{ relationshipTypeId?: string }>('relationships'),
    (r) => !!r?.relationshipTypeId && removed.has(r.relationshipTypeId)
  );
  return {
    relationshipTypesChanged: changes.upserts.length,
    relationshipTypesRemoved,
    relationshipsRemoved,
  };
}

/** Resolve a `tabs` argument, or an error result. */
function tabsOrThrow(result: ReturnType<typeof createTabs>): SchemaTab[] {
  if (!result.ok) throw new SchemaToolError(result.error);
  const error = validateTabs(result.value);
  if (error) throw new SchemaToolError(error);
  return result.value;
}

/** Run a schema tool body, turning `SchemaToolError`s into tool errors. */
async function runSchemaTool(
  name: string,
  projectKey: string,
  body: () => Promise<McpToolResult>
): Promise<McpToolResult> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof SchemaToolError) return errorResult(err.message);
    mcpSchemaLog.error(`${name} failed for ${projectKey}`, { error: err });
    return errorResult(
      `${name} failed for "${projectKey}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ============================================
// create_schema tool
// ============================================

registerTool({
  tool: {
    name: 'create_schema',
    title: 'Create Schema',
    description:
      'Create a worldbuilding element type (schema/template, e.g. "Faction", "Spell") in a project. ' +
      'Give it tabs of fields, or clone an existing schema with cloneFromSchemaId. Every element already has ' +
      'a name and identity fields (description, image), so the template only needs the extra fields. ' +
      'Returns the new schema; pass its id as schemaId to create_element. ' +
      'Call get_project_schemas first to see existing schemas.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        name: {
          type: 'string',
          description: 'Display name, unique in the project (e.g. "Faction").',
        },
        icon: {
          type: 'string',
          description: 'Material icon name (e.g. "groups"). Default "article".',
        },
        description: { type: 'string', description: 'What this element type is for.' },
        tabs: {
          type: 'array',
          description:
            'Tabs with their fields. Default: one empty "General" tab. Not allowed with cloneFromSchemaId.',
          items: tabSchemaProperty,
        },
        cloneFromSchemaId: {
          type: 'string',
          description: 'Copy the tabs, icon, description and defaults of this schema.',
        },
        defaultValues: {
          type: 'object',
          description: 'Field values new elements of this type start with, keyed by field key.',
        },
      },
      required: ['project', 'name'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const parsed = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in parsed) return parsed.error;
    const { username, slug } = parsed.project;
    const projectKey = `${username}/${slug}`;

    return runSchemaTool('create_schema', projectKey, async () => {
      const name = optionalString(args, 'name');
      if (!name) throw new SchemaToolError('name is required');
      const icon = optionalString(args, 'icon');
      const description = optionalString(args, 'description');
      const cloneFrom = optionalString(args, 'cloneFromSchemaId');
      if (cloneFrom && args.tabs !== undefined) {
        throw new SchemaToolError('pass either tabs or cloneFromSchemaId, not both');
      }
      if (
        args.defaultValues !== undefined &&
        (typeof args.defaultValues !== 'object' ||
          args.defaultValues === null ||
          Array.isArray(args.defaultValues))
      ) {
        throw new SchemaToolError('defaultValues must be an object');
      }

      const result = await editProjectDoc(ctx, username, slug, (doc) => {
        const schemas = doc.getArray<unknown>('schemas');
        const existing = schemas.toArray().filter(isSchema);
        if (existing.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
          throw new SchemaToolError(`a schema named "${name}" already exists`);
        }

        const source = cloneFrom ? findSchema(doc, cloneFrom).schema : null;
        let tabs: SchemaTab[];
        if (source) {
          // The clone manages its own relationship types instead of sharing the source's.
          tabs = source.tabs;
          for (const field of tabs.flatMap((tab) => tab.fields ?? [])) {
            if (field.type === 'relationship' && field.relationshipTypeId) {
              field.relationshipTypeId = newRelationshipTypeId();
            }
          }
        } else {
          tabs = tabsOrThrow(createTabs(args.tabs ?? [{ key: 'general', label: 'General' }]));
        }
        stampRelationshipTypeIds(tabs);

        const now = new Date().toISOString();
        const schema: StoredSchema = {
          id: `custom-${nanoid(12)}`,
          name,
          icon: icon || source?.icon || 'article',
          description: description ?? (source ? `Clone of ${source.name}` : ''),
          version: 1,
          tabs,
          ...(source?.defaultAppearance ? { defaultAppearance: source.defaultAppearance } : {}),
          ...(source?.defaultImage ? { defaultImage: source.defaultImage } : {}),
          ...((args.defaultValues ?? source?.defaultValues)
            ? { defaultValues: structuredClone(args.defaultValues ?? source?.defaultValues) }
            : {}),
          createdAt: now,
          updatedAt: now,
        };
        const changes = planRelationshipTypeChanges(
          schema.id,
          [],
          tabs,
          readRelationshipTypes(doc)
        );
        schemas.push([schema]);
        return { schema, relationships: applyRelationshipTypeChanges(doc, changes) };
      });

      mcpSchemaLog.info(`Created schema ${result.schema.id} in ${projectKey}`);
      return textResult({ success: true, schema: result.schema, ...result.relationships });
    });
  },
});

// ============================================
// update_schema tool
// ============================================

registerTool({
  tool: {
    name: 'update_schema',
    title: 'Update Schema',
    description:
      'Edit a worldbuilding schema (template): rename it, change its icon, description or defaults, and add, ' +
      'change, move or remove tabs and fields. Prefer `operations` for targeted edits; `tabs` replaces every ' +
      'tab at once. Removing a relationship field (or changing its type) also deletes its relationship type and ' +
      'every relationship made through it. Renaming a field key does not move data elements stored under the ' +
      `old key. ${SHARED_SCHEMA_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        schemaId: {
          type: 'string',
          description: 'Id of the schema to edit (from get_project_schemas).',
        },
        name: { type: 'string', description: 'New display name.' },
        icon: { type: 'string', description: 'New Material icon name.' },
        description: { type: 'string', description: 'New description.' },
        defaultValues: {
          type: ['object', 'null'],
          description: 'Replace the default field values for new elements (null clears them).',
        },
        operations: {
          type: 'array',
          description:
            'Edits applied in order. Each is one of: ' +
            '{ op: "add_tab", label, key?, icon?, index?, fields? }, ' +
            '{ op: "update_tab", tabKey, label?, key?, icon? }, ' +
            '{ op: "remove_tab", tabKey }, ' +
            '{ op: "move_tab", tabKey, index }, ' +
            '{ op: "add_field", tabKey, field, index? }, ' +
            '{ op: "update_field", fieldKey, patch } (patch takes the field properties; null removes one), ' +
            '{ op: "remove_field", fieldKey }, ' +
            '{ op: "move_field", fieldKey, toTabKey?, index? }. ' +
            'index is 0-based; omit it to append.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'add_tab',
                  'update_tab',
                  'remove_tab',
                  'move_tab',
                  'add_field',
                  'update_field',
                  'remove_field',
                  'move_field',
                ],
              },
              tabKey: { type: 'string' },
              fieldKey: { type: 'string' },
              toTabKey: { type: 'string' },
              key: { type: 'string' },
              label: { type: 'string' },
              icon: { type: 'string' },
              index: { type: 'integer' },
              field: fieldSchemaProperty,
              patch: { type: 'object' },
              fields: { type: 'array', items: fieldSchemaProperty },
            },
            required: ['op'],
          },
        },
        tabs: {
          type: 'array',
          description: 'Replace all tabs. Not allowed with operations.',
          items: tabSchemaProperty,
        },
      },
      required: ['project', 'schemaId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const parsed = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in parsed) return parsed.error;
    const { username, slug } = parsed.project;
    const projectKey = `${username}/${slug}`;

    return runSchemaTool('update_schema', projectKey, async () => {
      const schemaId = optionalString(args, 'schemaId');
      if (!schemaId) throw new SchemaToolError('schemaId is required');
      const name = optionalString(args, 'name');
      const icon = optionalString(args, 'icon');
      const description = optionalString(args, 'description');
      if (name === '') throw new SchemaToolError('name cannot be empty');
      if (args.operations !== undefined && args.tabs !== undefined) {
        throw new SchemaToolError('pass either operations or tabs, not both');
      }
      const dv = args.defaultValues;
      if (dv !== undefined && dv !== null && (typeof dv !== 'object' || Array.isArray(dv))) {
        throw new SchemaToolError('defaultValues must be an object or null');
      }
      const hasChange =
        name !== undefined ||
        icon !== undefined ||
        description !== undefined ||
        dv !== undefined ||
        args.operations !== undefined ||
        args.tabs !== undefined;
      if (!hasChange) {
        throw new SchemaToolError(
          'nothing to change: pass name, icon, description, defaultValues, operations or tabs'
        );
      }

      const result = await editProjectDoc(ctx, username, slug, (doc) => {
        const { index, schema } = findSchema(doc, schemaId);
        if (name && name.toLowerCase() !== schema.name.trim().toLowerCase()) {
          const clash = doc
            .getArray<unknown>('schemas')
            .toArray()
            .some(
              (s) =>
                isSchema(s) &&
                s.id !== schemaId &&
                s.name.trim().toLowerCase() === name.toLowerCase()
            );
          if (clash) throw new SchemaToolError(`a schema named "${name}" already exists`);
        }

        const before = schema.tabs;
        let tabs = before;
        if (args.operations !== undefined) {
          tabs = tabsOrThrow(applySchemaOperations(before, args.operations));
        } else if (args.tabs !== undefined) {
          tabs = tabsOrThrow(createTabs(args.tabs, before));
        }
        stampRelationshipTypeIds(tabs);

        const updated: StoredSchema = {
          ...schema,
          ...(name ? { name } : {}),
          ...(icon ? { icon } : {}),
          ...(description === undefined ? {} : { description }),
          tabs,
          version: (schema.version || 1) + 1,
          updatedAt: new Date().toISOString(),
        };
        if (dv === null) delete updated.defaultValues;
        else if (dv !== undefined) updated.defaultValues = structuredClone(dv);

        const changes = planRelationshipTypeChanges(
          schemaId,
          before,
          tabs,
          readRelationshipTypes(doc)
        );
        replaceAt(doc.getArray<unknown>('schemas'), index, updated);
        return { schema: updated, relationships: applyRelationshipTypeChanges(doc, changes) };
      });

      mcpSchemaLog.info(`Updated schema ${schemaId} in ${projectKey}`);
      return textResult({
        success: true,
        schema: result.schema,
        ...result.relationships,
        note: SHARED_SCHEMA_NOTE,
      });
    });
  },
});

// ============================================
// delete_schema tool
// ============================================

registerTool({
  tool: {
    name: 'delete_schema',
    title: 'Delete Schema',
    description:
      'Delete a worldbuilding schema (template) from a project. Also deletes the relationship types behind ' +
      'its relationship fields and every relationship made through them. Elements of this type are not ' +
      'deleted: they keep their own copy of the schema and their data.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        schemaId: {
          type: 'string',
          description: 'Id of the schema to delete (from get_project_schemas).',
        },
      },
      required: ['project', 'schemaId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_SCHEMAS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const parsed = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_SCHEMAS);
    if ('error' in parsed) return parsed.error;
    const { username, slug } = parsed.project;
    const projectKey = `${username}/${slug}`;

    return runSchemaTool('delete_schema', projectKey, async () => {
      const schemaId = optionalString(args, 'schemaId');
      if (!schemaId) throw new SchemaToolError('schemaId is required');

      const result = await editProjectDoc(ctx, username, slug, (doc) => {
        const { index, schema } = findSchema(doc, schemaId);
        doc.getArray<unknown>('schemas').delete(index, 1);
        // Every type this schema's fields manage, even ones whose field is gone.
        const ownedTypeIds = readRelationshipTypes(doc)
          .filter((t) => t.fieldSource?.schemaId === schemaId)
          .map((t) => t.id);
        return {
          name: schema.name,
          relationships: applyRelationshipTypeChanges(doc, {
            upserts: [],
            removedTypeIds: ownedTypeIds,
          }),
        };
      });

      mcpSchemaLog.info(`Deleted schema ${schemaId} from ${projectKey}`);
      return textResult({
        success: true,
        deletedSchemaId: schemaId,
        name: result.name,
        relationshipTypesRemoved: result.relationships.relationshipTypesRemoved,
        relationshipsRemoved: result.relationships.relationshipsRemoved,
      });
    });
  },
});
