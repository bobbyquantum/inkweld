import {
  CANVAS_AREA_RELATIONSHIP_TYPE,
  CANVAS_PIN_RELATIONSHIP_TYPE,
  type CanvasPin,
} from '@models/canvas.model';
import type { RelationshipCategory } from '@models/element-ref.model';
import type { RelationshipService } from '@services/relationship/relationship.service';

/** The two kinds of canvas → element link. */
export type CanvasLinkKind = 'pin' | 'area';

const LINK_TYPES: Record<
  CanvasLinkKind,
  { id: string; name: string; inverseLabel: string; icon: string }
> = {
  pin: {
    id: CANVAS_PIN_RELATIONSHIP_TYPE,
    name: 'Pinned on canvas',
    inverseLabel: 'Has pin',
    icon: 'push_pin',
  },
  area: {
    id: CANVAS_AREA_RELATIONSHIP_TYPE,
    name: 'Mapped area on canvas',
    inverseLabel: 'Has mapped area',
    icon: 'highlight_alt',
  },
};

/**
 * Create a formal ElementRelationship linking a canvas element to the
 * target element via a pin or a region shape. Returns the relationship ID.
 */
export function createLinkRelationship(
  relationshipService: RelationshipService,
  sourceElementId: string,
  targetElementId: string,
  kind: CanvasLinkKind
): string {
  ensureCanvasLinkRelationshipType(relationshipService, kind);
  const rel = relationshipService.addRelationship(
    sourceElementId,
    targetElementId,
    LINK_TYPES[kind].id
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
  const def = LINK_TYPES[kind];
  if (relationshipService.getTypeById(def.id)) return;
  relationshipService.addRawType({
    id: def.id,
    name: def.name,
    inverseLabel: def.inverseLabel,
    showInverse: true,
    category: 'Spatial' as RelationshipCategory,
    icon: def.icon,
    isBuiltIn: false,
    sourceEndpoint: { allowedSchemas: [] },
    targetEndpoint: { allowedSchemas: [] },
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
