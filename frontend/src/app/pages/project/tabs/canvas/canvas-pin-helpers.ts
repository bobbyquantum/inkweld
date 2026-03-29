import type { RelationshipCategory } from '@components/element-ref/element-ref.model';
import {
  CANVAS_PIN_RELATIONSHIP_TYPE,
  type CanvasObject,
  type CanvasPin,
} from '@models/canvas.model';
import type { RelationshipService } from '@services/relationship/relationship.service';

/**
 * Create a formal ElementRelationship linking a canvas element to the
 * target element via a pin. Returns the relationship ID.
 */
export function createPinRelationship(
  relationshipService: RelationshipService,
  sourceElementId: string,
  targetElementId: string
): string {
  ensureCanvasPinRelationshipType(relationshipService);
  const rel = relationshipService.addRelationship(
    sourceElementId,
    targetElementId,
    CANVAS_PIN_RELATIONSHIP_TYPE
  );
  return rel.id;
}

/** Remove the ElementRelationship backing a pin link, if it exists. */
export function removePinRelationship(
  relationshipService: RelationshipService,
  pin: CanvasPin
): void {
  if (pin.relationshipId) {
    relationshipService.removeRelationship(pin.relationshipId);
  }
}

/**
 * Ensure the "canvas-pin" relationship type exists in the project.
 * If it's missing (e.g. older project created before this feature),
 * add it as a custom type.
 */
export function ensureCanvasPinRelationshipType(
  relationshipService: RelationshipService
): void {
  const existing = relationshipService.getTypeById(
    CANVAS_PIN_RELATIONSHIP_TYPE
  );
  if (!existing) {
    relationshipService.addRawType({
      id: CANVAS_PIN_RELATIONSHIP_TYPE,
      name: 'Pinned on canvas',
      inverseLabel: 'Has pin',
      showInverse: true,
      category: 'Spatial' as RelationshipCategory,
      icon: 'push_pin',
      isBuiltIn: false,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    });
  }
}

/**
 * Clean up relationships for all linked pins in a set of objects.
 * Used when deleting a layer or bulk-removing objects.
 */
export function cleanupPinRelationships(
  relationshipService: RelationshipService,
  objects: CanvasObject[]
): void {
  for (const obj of objects) {
    if (obj.type === 'pin') {
      removePinRelationship(relationshipService, obj);
    }
  }
}
