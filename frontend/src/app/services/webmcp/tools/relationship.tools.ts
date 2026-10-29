import type { Injector } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  type ElementRelationship,
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { RelationshipService } from '@services/relationship/relationship.service';

import type { ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

const CATEGORIES = Object.values(RelationshipCategory);

function describeType(
  type: RelationshipTypeDefinition
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: type.id,
    name: type.name,
    inverseLabel: type.inverseLabel,
    category: type.category,
  };
  if (type.sourceEndpoint.allowedSchemas.length > 0) {
    out['sourceSchemas'] = type.sourceEndpoint.allowedSchemas;
  }
  if (type.targetEndpoint.allowedSchemas.length > 0) {
    out['targetSchemas'] = type.targetEndpoint.allowedSchemas;
  }
  if (type.fieldSource) out['managedByTemplateField'] = type.fieldSource;
  return out;
}

/** Typed links between elements ("Elena — sister of — Marcus"). */
export function relationshipTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const relationships = injector.get(RelationshipService);

  function describe(r: ElementRelationship): Record<string, unknown> {
    const name = (id: string): string =>
      ctx.elements().find(e => e.id === id)?.name ?? '(deleted)';
    const type = relationships.getTypeById(r.relationshipTypeId);
    return {
      id: r.id,
      source: { id: r.sourceElementId, name: name(r.sourceElementId) },
      type: {
        id: r.relationshipTypeId,
        name: type?.name ?? r.relationshipTypeId,
      },
      target: { id: r.targetElementId, name: name(r.targetElementId) },
      ...(r.note ? { note: r.note } : {}),
      ...(r.documentContext ? { fromDocumentReference: true } : {}),
    };
  }

  function requireType(typeId: string): RelationshipTypeDefinition {
    const type = relationships.getTypeById(typeId);
    if (!type) {
      throw new ToolError(
        `No relationship type "${typeId}". Call list_relationship_types.`
      );
    }
    return type;
  }

  return [
    {
      name: 'list_relationship_types',
      title: 'List relationship types',
      description:
        'The kinds of relationship this project defines (e.g. "Sibling of", "Lives in"), with the template schemas each end may use.',
      inputSchema: schema(),
      readOnly: true,
      run: () => {
        ctx.project();
        return { types: relationships.getAllTypes().map(describeType) };
      },
    },
    {
      name: 'list_relationships',
      title: 'List relationships',
      description:
        'Relationships of one element (outgoing and incoming), or of the whole project when elementId is omitted.',
      inputSchema: schema({
        elementId: { type: 'string' },
        typeId: { type: 'string', description: 'Only this type.' },
      }),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        ctx.project();
        const elementId = args.optionalString('elementId');
        const typeId = args.optionalString('typeId');
        const keep = (r: ElementRelationship): boolean =>
          !typeId || r.relationshipTypeId === typeId;
        if (elementId) {
          ctx.element(elementId);
          return {
            outgoing: relationships
              .getOutgoingRelationships(elementId)
              .filter(keep)
              .map(describe),
            incoming: relationships
              .getIncomingRelationships(elementId)
              .filter(keep)
              .map(describe),
          };
        }
        return {
          relationships: relationships
            .getAllRelationships()
            .filter(keep)
            .map(describe),
        };
      },
    },
    {
      name: 'create_relationship',
      writes: true,
      title: 'Create relationship',
      description:
        'Link two elements with a relationship type: source —type— target. Also how relationship fields on worldbuilding templates are filled.',
      inputSchema: schema(
        {
          sourceId: { type: 'string' },
          targetId: { type: 'string' },
          typeId: { type: 'string' },
          note: { type: 'string' },
        },
        ['sourceId', 'targetId', 'typeId']
      ),
      run: args => {
        ctx.requireWrite();
        const source = ctx.element(args.string('sourceId'));
        const target = ctx.element(args.string('targetId'));
        if (source.id === target.id) {
          throw new ToolError('An element cannot be related to itself.');
        }
        const type = requireType(args.string('typeId'));
        // As in the Add relationship dialog: a worldbuilding element matches
        // by its template id, anything else by its element type.
        const schemaOf = (e: Element): string =>
          e.type === ElementType.Worldbuilding && e.schemaId
            ? e.schemaId
            : e.type;
        const allowed = (schemas: string[], e: Element): boolean =>
          schemas.length === 0 || schemas.includes(schemaOf(e));
        if (!allowed(type.sourceEndpoint.allowedSchemas, source)) {
          throw new ToolError(
            `"${type.name}" relationships must start from: ${type.sourceEndpoint.allowedSchemas.join(', ')}.`
          );
        }
        if (!allowed(type.targetEndpoint.allowedSchemas, target)) {
          throw new ToolError(
            `"${type.name}" relationships must point to: ${type.targetEndpoint.allowedSchemas.join(', ')}.`
          );
        }
        const exists = relationships
          .findRelationshipsBetween(source.id, target.id)
          .find(r => r.relationshipTypeId === type.id);
        if (exists) return { ...describe(exists), alreadyExisted: true };
        const note = args.optionalString('note');
        return describe(
          relationships.addRelationship(
            source.id,
            target.id,
            type.id,
            note ? { note } : undefined
          )
        );
      },
    },
    {
      name: 'update_relationship',
      writes: true,
      title: 'Update relationship',
      description: "Change a relationship's type or note.",
      inputSchema: schema(
        {
          relationshipId: { type: 'string' },
          typeId: { type: 'string' },
          note: { type: 'string' },
        },
        ['relationshipId']
      ),
      run: args => {
        ctx.requireWrite();
        const id = args.string('relationshipId');
        if (!relationships.findRelationship(id)) {
          throw new ToolError(`No relationship with id "${id}".`);
        }
        const typeId = args.optionalString('typeId');
        if (typeId) requireType(typeId);
        const note = args.optionalString('note');
        relationships.updateRelationship(id, {
          ...(typeId ? { relationshipTypeId: typeId } : {}),
          ...(note === undefined ? {} : { note }),
        });
        return describe(relationships.findRelationship(id)!);
      },
    },
    {
      name: 'delete_relationship',
      writes: true,
      title: 'Delete relationship',
      description: 'Remove one relationship between two elements.',
      inputSchema: schema({ relationshipId: { type: 'string' } }, [
        'relationshipId',
      ]),
      run: args => {
        ctx.requireWrite();
        const id = args.string('relationshipId');
        if (!relationships.removeRelationship(id)) {
          throw new ToolError(`No relationship with id "${id}".`);
        }
        return { deleted: id };
      },
    },
    {
      name: 'create_relationship_type',
      writes: true,
      title: 'Create relationship type',
      description:
        'Define a new kind of relationship for this project, e.g. name "Mentor of", inverseLabel "Student of".',
      inputSchema: schema(
        {
          name: { type: 'string' },
          inverseLabel: {
            type: 'string',
            description: "How it reads from the target's side.",
          },
          category: { type: 'string', enum: CATEGORIES },
          icon: { type: 'string', description: 'Material icon name.' },
          sourceSchemas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Template ids the source may use (empty = any).',
          },
          targetSchemas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Template ids the target may use (empty = any).',
          },
        },
        ['name', 'inverseLabel']
      ),
      run: args => {
        ctx.requireWrite();
        const created = relationships.addCustomType({
          name: args.string('name').trim(),
          inverseLabel: args.string('inverseLabel').trim(),
          showInverse: true,
          category:
            args.optionalOneOf('category', CATEGORIES) ??
            RelationshipCategory.Custom,
          icon: args.optionalString('icon'),
          sourceEndpoint: { allowedSchemas: args.stringArray('sourceSchemas') },
          targetEndpoint: { allowedSchemas: args.stringArray('targetSchemas') },
        });
        return describeType(created);
      },
    },
  ];
}
