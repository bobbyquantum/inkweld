/**
 * Relationship Service - Public API
 */

export { RelationshipService } from './relationship.service';

// Re-export types from element-ref models for convenience
export type {
  ElementRelationship,
  ElementRelationshipView,
  RelationshipTypeDefinition,
  ResolvedRelationship,
} from '@models/element-ref.model';

// Create an alias for backwards compatibility and clarity
export type StoredRelationship =
  import('@models/element-ref.model').ElementRelationship;
