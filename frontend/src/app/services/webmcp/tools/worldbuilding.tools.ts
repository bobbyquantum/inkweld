import type { Injector } from '@angular/core';
import {
  isRelationshipField,
  linkedTargetIds,
  parseRelationshipFieldValue,
  planRelationshipFieldLinks,
  relationshipFieldLinkErrors,
} from '@inkweld/project-library';
import type { ElementTypeSchema, FieldSchema } from '@models/schema-types';
import { RelationshipService } from '@services/relationship/relationship.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

import type { ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

/** Identity keys every worldbuilding element has outside its template. */
const IDENTITY_DESCRIPTION = 'description';

function describeField(field: FieldSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {
    key: field.key,
    label: field.label,
    type: field.type,
  };
  if (field.description) out['description'] = field.description;
  if (field.options) out['options'] = field.options;
  if (field.type === 'relationship') {
    out['relationshipTypeId'] = field.relationshipTypeId;
    out['multiple'] = field.multiple ?? false;
    if (field.targetSchemaId) out['targetSchemaId'] = field.targetSchemaId;
  }
  if (field.nestedFields?.length) {
    out['nestedFields'] = field.nestedFields.map(describeField);
  }
  return out;
}

function describeSchema(
  s: ElementTypeSchema,
  withFields: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: s.id,
    name: s.name,
    icon: s.icon,
    description: s.description,
  };
  if (withFields) {
    out['tabs'] = s.tabs.map(tab => ({
      key: tab.key,
      label: tab.label,
      fields: tab.fields.map(describeField),
    }));
  } else {
    out['fieldCount'] = s.tabs.reduce((n, tab) => n + tab.fields.length, 0);
  }
  return out;
}

function fieldsByKey(s: ElementTypeSchema | null): Map<string, FieldSchema> {
  const map = new Map<string, FieldSchema>();
  for (const tab of s?.tabs ?? []) {
    for (const field of tab.fields) map.set(field.key, field);
  }
  return map;
}

/** Checks a value against its field type, so the editor can show it. */
function checkValue(field: FieldSchema, value: unknown): void {
  const wrong = (expected: string): never => {
    throw new ToolError(
      `Field "${field.key}" (${field.type}) needs ${expected}.`
    );
  };
  if (value === null) return;
  switch (field.type) {
    case 'number':
      if (typeof value !== 'number') wrong('a number');
      break;
    case 'checkbox':
      if (typeof value !== 'boolean') wrong('true or false');
      break;
    case 'multiselect':
    case 'array':
      if (!Array.isArray(value)) wrong('an array');
      break;
    default:
      if (field.isNested) {
        if (typeof value !== 'object' || Array.isArray(value))
          wrong('an object');
      } else if (typeof value !== 'string') {
        wrong('a string');
      }
  }
}

/** Templates and the entries built from them (characters, places, …). */
export function worldbuildingTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const worldbuilding = injector.get(WorldbuildingService);
  const relationshipService = injector.get(RelationshipService);
  const elementExists = (id: string): boolean =>
    ctx.elements().some(e => e.id === id);

  /** A relationship field's value: the elements it links, as the field shows them. */
  const linkedIds = (sourceId: string, field: FieldSchema): string[] =>
    field.relationshipTypeId
      ? linkedTargetIds(
          sourceId,
          field.relationshipTypeId,
          relationshipService.getAllRelationships(),
          elementExists
        )
      : [];

  /**
   * Check the ids given for a relationship field, as the element picker
   * would, and return them. Nothing is written until every field passed.
   */
  const relationshipIds = (
    sourceId: string,
    field: FieldSchema,
    value: unknown
  ): string[] => {
    const parsed = parseRelationshipFieldValue(field, value);
    if ('error' in parsed) throw new ToolError(parsed.error);
    const errors = relationshipFieldLinkErrors(
      field,
      sourceId,
      parsed.ids,
      id => ctx.elements().find(e => e.id === id),
      id => worldbuilding.getSchemaById(id)?.name
    );
    if (errors.length > 0) throw new ToolError(errors.join(' '));
    return parsed.ids;
  };

  /** Link exactly `ids` from the field, as the relationship field in the editor does. */
  const applyLinks = (
    sourceId: string,
    field: FieldSchema,
    ids: string[]
  ): { added: string[]; removed: string[] } => {
    const typeId = field.relationshipTypeId!;
    const plan = planRelationshipFieldLinks({
      sourceElementId: sourceId,
      relationshipTypeId: typeId,
      desiredIds: ids,
      relationships: relationshipService.getAllRelationships(),
      elementExists,
    });
    relationshipService.removeRelationships(plan.remove.map(r => r.id));
    for (const id of plan.add) {
      relationshipService.addRelationship(sourceId, id, typeId);
    }
    return {
      added: plan.add,
      removed: plan.remove.map(r => r.targetElementId),
    };
  };

  return [
    {
      name: 'list_schemas',
      title: 'List templates',
      description:
        "The worldbuilding templates (schemas) of the open project, such as Character or Location. Pass schemaId to get one template's tabs and fields.",
      inputSchema: schema({
        schemaId: { type: 'string' },
      }),
      readOnly: true,
      run: args => {
        ctx.project();
        const schemaId = args.optionalString('schemaId');
        if (schemaId) {
          const found = worldbuilding.getSchemaById(schemaId);
          if (!found) throw new ToolError(`No template with id "${schemaId}".`);
          return describeSchema(found, true);
        }
        return {
          schemas: worldbuilding
            .getAllSchemas()
            .map(s => describeSchema(s, false)),
        };
      },
    },
    {
      name: 'get_worldbuilding',
      title: 'Read worldbuilding entry',
      description:
        "A worldbuilding element's description, its template's fields with their current values, and its relationships.",
      inputSchema: schema({ elementId: { type: 'string' } }, ['elementId']),
      readOnly: true,
      untrustedContent: true,
      run: async args => {
        const element = ctx.worldbuilding(args.string('elementId'));
        const { username, slug } = ctx.project();
        const [elementSchema, data, identity] = await Promise.all([
          worldbuilding.getSchemaForElement(element.id, username, slug),
          worldbuilding.getWorldbuildingData(element.id, username, slug),
          worldbuilding.getIdentityData(element.id, username, slug),
        ]);
        const values = data ?? {};
        return {
          ...ctx.summarize(element),
          description: identity.description ?? '',
          hasImage: Boolean(identity.image),
          schema: elementSchema
            ? { id: elementSchema.id, name: elementSchema.name }
            : null,
          tabs: (elementSchema?.tabs ?? []).map(tab => ({
            label: tab.label,
            fields: tab.fields.map(field => ({
              key: field.key,
              label: field.label,
              type: field.type,
              value: isRelationshipField(field)
                ? linkedIds(element.id, field)
                : (values[field.key] ?? null),
            })),
          })),
        };
      },
    },
    {
      name: 'update_worldbuilding',
      writes: true,
      title: 'Update worldbuilding entry',
      description:
        'Set field values on a worldbuilding element. "fields" maps field keys (from get_worldbuilding or list_schemas) to values: text fields take strings, number fields numbers, checkbox fields booleans, multiselect/array fields arrays; null clears a field. A relationship field takes the id (or array of ids, when it is multiple) of the elements it links; each link is a relationship of the field\'s type, so it also shows as a backlink, and ids left out are unlinked. "description" sets the element\'s own description.',
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          fields: { type: 'object', additionalProperties: true },
          description: { type: 'string' },
        },
        ['elementId']
      ),
      run: async args => {
        ctx.requireWrite();
        const element = ctx.worldbuilding(args.string('elementId'));
        const { username, slug } = ctx.project();
        const fields = args.record('fields') ?? {};
        let description = args.optionalString('description');
        const elementSchema = await worldbuilding.getSchemaForElement(
          element.id,
          username,
          slug
        );
        const known = fieldsByKey(elementSchema);
        const data: Record<string, unknown> = {};
        const links = new Map<FieldSchema, string[]>();
        for (const [key, value] of Object.entries(fields)) {
          const field = known.get(key);
          if (!field) {
            if (key === IDENTITY_DESCRIPTION && typeof value === 'string') {
              description = value;
              continue;
            }
            throw new ToolError(
              `"${element.name}" has no field "${key}". Fields: ${[...known.keys()].join(', ') || '(none)'}.`
            );
          }
          if (isRelationshipField(field)) {
            links.set(field, relationshipIds(element.id, field, value));
            continue;
          }
          checkValue(field, value);
          data[key] = value;
        }
        if (
          Object.keys(data).length === 0 &&
          links.size === 0 &&
          description === undefined
        ) {
          throw new ToolError('Give fields or a description to change.');
        }
        if (Object.keys(data).length > 0) {
          await worldbuilding.saveWorldbuildingData(
            element.id,
            data,
            username,
            slug
          );
        }
        const linked: Record<string, { added: string[]; removed: string[] }> =
          {};
        for (const [field, ids] of links) {
          linked[field.key] = applyLinks(element.id, field, ids);
        }
        if (description !== undefined) {
          await worldbuilding.saveIdentityData(
            element.id,
            { description },
            username,
            slug
          );
        }
        return {
          elementId: element.id,
          updated: [...Object.keys(data), ...Object.keys(linked)],
          ...(links.size === 0 ? {} : { linked }),
          ...(description === undefined ? {} : { description }),
        };
      },
    },
  ];
}
