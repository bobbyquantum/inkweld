/**
 * Canvas → element links. A pin or a region shape linked to an element is
 * backed by a relationship, so it shows up in the element's backlinks. The
 * relationship types are created on first use in projects that lack them.
 */

import type * as YjsTypes from 'yjs';

import {
  CANVAS_AREA_RELATIONSHIP_TYPE,
  CANVAS_PIN_RELATIONSHIP_TYPE,
} from './model';

/** The two kinds of canvas → element link. */
export type CanvasLinkKind = 'pin' | 'area';

/** The relationship type behind one kind of link, as stored in the project. */
export function canvasLinkRelationshipType(kind: CanvasLinkKind) {
  const shared = {
    showInverse: true,
    category: 'Spatial' as const,
    isBuiltIn: false,
    sourceEndpoint: { allowedSchemas: [] as string[] },
    targetEndpoint: { allowedSchemas: [] as string[] },
  };
  return kind === 'pin'
    ? {
        id: CANVAS_PIN_RELATIONSHIP_TYPE,
        name: 'Pinned on canvas',
        inverseLabel: 'Has pin',
        icon: 'push_pin',
        ...shared,
      }
    : {
        id: CANVAS_AREA_RELATIONSHIP_TYPE,
        name: 'Mapped area on canvas',
        inverseLabel: 'Has mapped area',
        icon: 'highlight_alt',
        ...shared,
      };
}

/** A link to create, with the id its relationship must get. */
export interface PlannedCanvasLink {
  objectId: string;
  kind: CanvasLinkKind;
  targetElementId: string;
  relationshipId: string;
}

/**
 * Write link changes to a project's elements document, for writers without a
 * relationship service. Call inside a transaction.
 */
export function writeCanvasLinks(
  doc: YjsTypes.Doc,
  canvasElementId: string,
  create: readonly PlannedCanvasLink[],
  removeRelationshipIds: readonly string[],
  now: string,
): void {
  const relationships = doc.getArray<{ id: string }>('relationships');
  const doomed = new Set(removeRelationshipIds);
  for (let i = relationships.length - 1; i >= 0; i--) {
    if (doomed.has(relationships.get(i).id)) relationships.delete(i, 1);
  }

  const types = doc.getArray<{ id: string }>('customRelationshipTypes');
  for (const link of create) {
    const type = canvasLinkRelationshipType(link.kind);
    if (!types.toArray().some((t) => t.id === type.id)) types.push([type]);
    relationships.push([
      {
        id: link.relationshipId,
        sourceElementId: canvasElementId,
        targetElementId: link.targetElementId,
        relationshipTypeId: type.id,
        createdAt: now,
        updatedAt: now,
      } as { id: string },
    ]);
  }
}
