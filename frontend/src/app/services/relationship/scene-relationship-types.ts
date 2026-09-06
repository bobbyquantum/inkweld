/**
 * Scene Relationship Types
 *
 * POV character and location are modelled as relationships rather than
 * metadata so that backlinks, the meta panel and relationship charts all
 * work without special cases — a character's "Appearances" is simply the
 * set of incoming `scene-pov` relationships.
 *
 * Mirrors the canvas-pin helper: the types are well-known IDs stored in the
 * project's relationship type list and created on demand so that projects
 * predating the feature pick them up the first time a scene is created.
 */

import {
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';

/** Scene → character: whose point of view the scene is told from. */
export const SCENE_POV_RELATIONSHIP_TYPE = 'scene-pov';

/** Scene → location: where the scene takes place. */
export const SCENE_LOCATION_RELATIONSHIP_TYPE = 'scene-location';

export const SCENE_RELATIONSHIP_TYPE_IDS: readonly string[] = [
  SCENE_POV_RELATIONSHIP_TYPE,
  SCENE_LOCATION_RELATIONSHIP_TYPE,
];

const SCENE_RELATIONSHIP_TYPES: readonly RelationshipTypeDefinition[] = [
  {
    id: SCENE_POV_RELATIONSHIP_TYPE,
    name: 'POV character',
    inverseLabel: 'POV in scene',
    showInverse: true,
    category: RelationshipCategory.Reference,
    icon: 'visibility',
    isBuiltIn: false,
    sourceEndpoint: { allowedSchemas: [] },
    targetEndpoint: { allowedSchemas: [] },
  },
  {
    id: SCENE_LOCATION_RELATIONSHIP_TYPE,
    name: 'Set in',
    inverseLabel: 'Setting of scene',
    showInverse: true,
    category: RelationshipCategory.Reference,
    icon: 'location_on',
    isBuiltIn: false,
    sourceEndpoint: { allowedSchemas: [] },
    targetEndpoint: { allowedSchemas: [] },
  },
];

/** Fresh copies of the scene relationship type definitions. */
export function getSceneRelationshipTypeDefinitions(): RelationshipTypeDefinition[] {
  return SCENE_RELATIONSHIP_TYPES.map(t => ({ ...t }));
}

/**
 * The minimal surface needed to seed types. Satisfied by both the element
 * sync provider (used from ProjectStateService, which cannot inject
 * RelationshipService without a cycle) and by RelationshipService itself.
 */
export interface RelationshipTypeStore {
  getCustomRelationshipTypes(): RelationshipTypeDefinition[];
  updateCustomRelationshipTypes(types: RelationshipTypeDefinition[]): void;
}

/**
 * Ensure both scene relationship types exist in the project. Existing types
 * with the same ID are left untouched so user edits (rename, icon) survive.
 * Returns the number of types that were added.
 */
export function ensureSceneRelationshipTypes(
  store: RelationshipTypeStore
): number {
  const existing = store.getCustomRelationshipTypes();
  const existingIds = new Set(existing.map(t => t.id));
  const missing = SCENE_RELATIONSHIP_TYPES.filter(t => !existingIds.has(t.id));
  if (missing.length === 0) return 0;

  const now = new Date().toISOString();
  store.updateCustomRelationshipTypes([
    ...existing,
    ...missing.map(t => ({ ...t, createdAt: now, updatedAt: now })),
  ]);
  return missing.length;
}
