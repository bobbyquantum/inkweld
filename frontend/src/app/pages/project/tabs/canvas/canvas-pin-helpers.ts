import {
  type CanvasLinkKind,
  canvasLinkRelationshipType,
} from '@inkweld/canvas';
import { type CanvasPin } from '@models/canvas.model';
import type { RelationshipCategory } from '@models/element-ref.model';
import type { RelationshipService } from '@services/relationship/relationship.service';

export type { CanvasLinkKind } from '@inkweld/canvas';

/**
 * Create a formal ElementRelationship linking a canvas element to the
 * target element via a pin or a region shape. Returns the relationship ID.
 */
export function createLinkRelationship(
  relationshipService: RelationshipService,
  sourceElementId: string,
  targetElementId: string,
  kind: CanvasLinkKind,
  relationshipId?: string
): string {
  ensureCanvasLinkRelationshipType(relationshipService, kind);
  const typeId = canvasLinkRelationshipType(kind).id;
  const rel = relationshipId
    ? relationshipService.addRelationship(
        sourceElementId,
        targetElementId,
        typeId,
        { id: relationshipId }
      )
    : relationshipService.addRelationship(
        sourceElementId,
        targetElementId,
        typeId
      );
  return rel.id;
}

/** Remove the ElementRelationship backing an object's link, if it exists. */
export function removeLinkRelationship(
  relationshipService: RelationshipService,
  obj: { relationshipId?: string }
): void {
  if (obj.relationshipId) {
    relationshipService.removeRelationship(obj.relationshipId);
  }
}

/**
 * Ensure a canvas link relationship type exists in the project. If it's
 * missing (e.g. older project created before the feature), add it as a
 * custom type.
 */
export function ensureCanvasLinkRelationshipType(
  relationshipService: RelationshipService,
  kind: CanvasLinkKind
): void {
  const type = canvasLinkRelationshipType(kind);
  if (relationshipService.getTypeById(type.id)) return;
  relationshipService.addRawType({
    ...type,
    category: type.category as RelationshipCategory,
  });
}

// ─── Pin-flavored wrappers (existing call sites) ────────────────────────────

/** Create a pin → element relationship. */
export function createPinRelationship(
  relationshipService: RelationshipService,
  sourceElementId: string,
  targetElementId: string
): string {
  return createLinkRelationship(
    relationshipService,
    sourceElementId,
    targetElementId,
    'pin'
  );
}

/** Remove the ElementRelationship backing a pin link, if it exists. */
export function removePinRelationship(
  relationshipService: RelationshipService,
  pin: CanvasPin
): void {
  removeLinkRelationship(relationshipService, pin);
}
