/**
 * Relationship Service - Public API
 */

export { RelationshipService } from './relationship.service';

// Re-export types from element-ref models for convenience
export type {
  ElementRelationship,
  ElementRelationshipView,
  RelationshipType,
  RelationshipTypeDefinition,
  ResolvedRelationship,
} from '../../components/element-ref/element-ref.model';

// Create an alias for backwards compatibility and clarity
export type StoredRelationship =
  import('../../components/element-ref/element-ref.model').ElementRelationship;
