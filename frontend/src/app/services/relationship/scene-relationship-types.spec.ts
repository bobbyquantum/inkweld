import type { RelationshipTypeDefinition } from '@models/element-ref.model';
import { describe, expect, it } from 'vitest';

import {
  ensureSceneRelationshipTypes,
  type RelationshipTypeStore,
  SCENE_LOCATION_RELATIONSHIP_TYPE,
  SCENE_POV_RELATIONSHIP_TYPE,
} from './scene-relationship-types';

function createStore(initial: RelationshipTypeDefinition[] = []) {
  let types = [...initial];
  let writes = 0;
  const store: RelationshipTypeStore = {
    getCustomRelationshipTypes: () => types,
    updateCustomRelationshipTypes: next => {
      types = next;
      writes++;
    },
  };
  return {
    store,
    get types() {
      return types;
    },
    get writes() {
      return writes;
    },
  };
}

describe('ensureSceneRelationshipTypes', () => {
  it('adds both types to an empty project', () => {
    const s = createStore();
    expect(ensureSceneRelationshipTypes(s.store)).toBe(2);
    expect(s.types.map(t => t.id)).toEqual([
      SCENE_POV_RELATIONSHIP_TYPE,
      SCENE_LOCATION_RELATIONSHIP_TYPE,
    ]);
    expect(s.types.every(t => t.createdAt && t.updatedAt)).toBe(true);
  });

  it('is a no-op when both types already exist', () => {
    const s = createStore();
    ensureSceneRelationshipTypes(s.store);
    expect(ensureSceneRelationshipTypes(s.store)).toBe(0);
    expect(s.writes).toBe(1);
  });

  it('adds only the missing type and preserves user edits to the other', () => {
    const renamed: RelationshipTypeDefinition = {
      id: SCENE_POV_RELATIONSHIP_TYPE,
      name: 'Viewpoint',
      inverseLabel: 'Viewpoint of',
      showInverse: false,
      category: 'reference' as RelationshipTypeDefinition['category'],
      isBuiltIn: false,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    };
    const s = createStore([renamed]);
    expect(ensureSceneRelationshipTypes(s.store)).toBe(1);
    expect(s.types).toHaveLength(2);
    expect(s.types[0]).toBe(renamed);
    expect(s.types[1].id).toBe(SCENE_LOCATION_RELATIONSHIP_TYPE);
  });

  it('keeps unrelated existing types', () => {
    const other: RelationshipTypeDefinition = {
      id: 'brother',
      name: 'Brother',
      inverseLabel: 'Brother of',
      showInverse: false,
      category: 'familial' as RelationshipTypeDefinition['category'],
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    };
    const s = createStore([other]);
    ensureSceneRelationshipTypes(s.store);
    expect(s.types.map(t => t.id)).toEqual([
      'brother',
      SCENE_POV_RELATIONSHIP_TYPE,
      SCENE_LOCATION_RELATIONSHIP_TYPE,
    ]);
  });
});
