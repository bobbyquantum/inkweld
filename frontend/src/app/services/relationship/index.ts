/**
 * Relationship Service - Public API
 */

export { RelationshipService } from './relationship.service';
export { RelationshipFieldService } from './relationship-field.service';

// Re-export types from element-ref models for convenience
export type {
  ElementRelationship,
  ElementRelationshipView,
  RelationshipFieldSource,
  RelationshipTypeDefinition,
  ResolvedRelationship,
} from '@models/element-ref.model';

// Create an alias for backwards compatibility and clarity
export type StoredRelationship =
  import('@models/element-ref.model').ElementRelationship;
