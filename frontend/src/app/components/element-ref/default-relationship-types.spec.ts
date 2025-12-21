/**
 * Tests for Default Relationship Types
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS,
  DEFAULT_RELATIONSHIP_TYPES,
  getAllRelationshipTypeDefinitions,
  getAllRelationshipTypes,
  getCategoryIcon,
  getCategoryLabel,
  getRelationshipLabel,
  getRelationshipTypeById,
  getRelationshipTypeDefinitionById,
  getRelationshipTypeDefinitionLabel,
  getRelationshipTypeDefinitionsByCategory,
  getRelationshipTypesByCategory,
  getValidRelationshipTypesForPair,
  getValidRelationshipTypesForSource,
  shouldShowInverse,
} from './default-relationship-types';
import {
  RelationshipCategory,
  RelationshipType,
  RelationshipTypeDefinition,
} from './element-ref.model';

describe('Default Relationship Types', () => {
  describe('DEFAULT_RELATIONSHIP_TYPES', () => {
    it('should have built-in relationship types', () => {
      expect(DEFAULT_RELATIONSHIP_TYPES.length).toBeGreaterThan(0);
    });

    it('should all be marked as built-in', () => {
      expect(DEFAULT_RELATIONSHIP_TYPES.every(t => t.isBuiltIn)).toBe(true);
    });

    it('should all have unique IDs', () => {
      const ids = DEFAULT_RELATIONSHIP_TYPES.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have symmetric relationships properly marked', () => {
      const siblingOf = DEFAULT_RELATIONSHIP_TYPES.find(
        t => t.id === 'sibling-of'
      );
      expect(siblingOf?.isSymmetric).toBe(true);
      expect(siblingOf?.label).toBe(siblingOf?.inverseLabel);
    });
  });

  describe('getRelationshipTypeById', () => {
    it('should find built-in relationship type by ID', () => {
      const parentOf = getRelationshipTypeById('parent-of');
      expect(parentOf).toBeDefined();
      expect(parentOf?.label).toBe('Parent of');
      expect(parentOf?.inverseLabel).toBe('Child of');
    });

    it('should return undefined for unknown ID', () => {
      const unknown = getRelationshipTypeById('unknown-type');
      expect(unknown).toBeUndefined();
    });

    it('should prefer custom type over built-in when ID matches', () => {
      const customType: RelationshipType = {
        id: 'parent-of',
        category: RelationshipCategory.Familial,
        label: 'Custom Parent Label',
        inverseLabel: 'Custom Child Label',
        isBuiltIn: false,
      };

      const result = getRelationshipTypeById('parent-of', [customType]);
      expect(result?.label).toBe('Custom Parent Label');
      expect(result?.isBuiltIn).toBe(false);
    });

    it('should find custom types not in built-in list', () => {
      const customType: RelationshipType = {
        id: 'my-custom-type',
        category: RelationshipCategory.Custom,
        label: 'My Custom Relationship',
        isBuiltIn: false,
      };

      const result = getRelationshipTypeById('my-custom-type', [customType]);
      expect(result).toEqual(customType);
    });
  });

  describe('getAllRelationshipTypes', () => {
    it('should return all built-in types when no custom types provided', () => {
      const all = getAllRelationshipTypes();
      expect(all.length).toBe(DEFAULT_RELATIONSHIP_TYPES.length);
    });

    it('should include custom types', () => {
      const customType: RelationshipType = {
        id: 'custom-1',
        category: RelationshipCategory.Custom,
        label: 'Custom 1',
        isBuiltIn: false,
      };

      const all = getAllRelationshipTypes([customType]);
      expect(all.length).toBe(DEFAULT_RELATIONSHIP_TYPES.length + 1);
      expect(all).toContain(customType);
    });
  });

  describe('getRelationshipTypesByCategory', () => {
    it('should filter by category', () => {
      const familial = getRelationshipTypesByCategory(
        RelationshipCategory.Familial
      );
      expect(familial.length).toBeGreaterThan(0);
      expect(
        familial.every(t => t.category === RelationshipCategory.Familial)
      ).toBe(true);
    });

    it('should include custom types in category', () => {
      const customType: RelationshipType = {
        id: 'custom-social',
        category: RelationshipCategory.Social,
        label: 'Custom Social',
        isBuiltIn: false,
      };

      const social = getRelationshipTypesByCategory(
        RelationshipCategory.Social,
        [customType]
      );
      expect(social).toContain(customType);
    });

    it('should return empty array for unused category', () => {
      // Get a category that might not have entries (depends on data)
      const result = getRelationshipTypesByCategory(
        'nonexistent' as RelationshipCategory
      );
      expect(result).toEqual([]);
    });
  });

  describe('getRelationshipLabel', () => {
    it('should return forward label when not incoming', () => {
      const type: RelationshipType = {
        id: 'test',
        category: RelationshipCategory.Familial,
        label: 'Forward Label',
        inverseLabel: 'Inverse Label',
        isBuiltIn: false,
      };

      expect(getRelationshipLabel(type, false)).toBe('Forward Label');
    });

    it('should return inverse label when incoming', () => {
      const type: RelationshipType = {
        id: 'test',
        category: RelationshipCategory.Familial,
        label: 'Forward Label',
        inverseLabel: 'Inverse Label',
        isBuiltIn: false,
      };

      expect(getRelationshipLabel(type, true)).toBe('Inverse Label');
    });

    it('should return forward label when incoming but no inverse', () => {
      const type: RelationshipType = {
        id: 'test',
        category: RelationshipCategory.Reference,
        label: 'Only Label',
        isBuiltIn: false,
      };

      expect(getRelationshipLabel(type, true)).toBe('Only Label');
    });
  });

  describe('getCategoryIcon', () => {
    it('should return link for Reference', () => {
      expect(getCategoryIcon(RelationshipCategory.Reference)).toBe('link');
    });

    it('should return family_restroom for Familial', () => {
      expect(getCategoryIcon(RelationshipCategory.Familial)).toBe(
        'family_restroom'
      );
    });

    it('should return people for Social', () => {
      expect(getCategoryIcon(RelationshipCategory.Social)).toBe('people');
    });

    it('should return work for Professional', () => {
      expect(getCategoryIcon(RelationshipCategory.Professional)).toBe('work');
    });

    it('should return place for Spatial', () => {
      expect(getCategoryIcon(RelationshipCategory.Spatial)).toBe('place');
    });

    it('should return schedule for Temporal', () => {
      expect(getCategoryIcon(RelationshipCategory.Temporal)).toBe('schedule');
    });

    it('should return inventory_2 for Ownership', () => {
      expect(getCategoryIcon(RelationshipCategory.Ownership)).toBe(
        'inventory_2'
      );
    });

    it('should return tune for Custom', () => {
      expect(getCategoryIcon(RelationshipCategory.Custom)).toBe('tune');
    });

    it('should return link for unknown category', () => {
      expect(getCategoryIcon('unknown' as RelationshipCategory)).toBe('link');
    });
  });

  describe('getCategoryLabel', () => {
    it('should return References for Reference', () => {
      expect(getCategoryLabel(RelationshipCategory.Reference)).toBe(
        'References'
      );
    });

    it('should return Family for Familial', () => {
      expect(getCategoryLabel(RelationshipCategory.Familial)).toBe('Family');
    });

    it('should return Social for Social', () => {
      expect(getCategoryLabel(RelationshipCategory.Social)).toBe('Social');
    });

    it('should return Professional for Professional', () => {
      expect(getCategoryLabel(RelationshipCategory.Professional)).toBe(
        'Professional'
      );
    });

    it('should return Location for Spatial', () => {
      expect(getCategoryLabel(RelationshipCategory.Spatial)).toBe('Location');
    });

    it('should return Timeline for Temporal', () => {
      expect(getCategoryLabel(RelationshipCategory.Temporal)).toBe('Timeline');
    });

    it('should return Ownership for Ownership', () => {
      expect(getCategoryLabel(RelationshipCategory.Ownership)).toBe(
        'Ownership'
      );
    });

    it('should return Custom for Custom', () => {
      expect(getCategoryLabel(RelationshipCategory.Custom)).toBe('Custom');
    });

    it('should return Other for unknown category', () => {
      expect(getCategoryLabel('unknown' as RelationshipCategory)).toBe('Other');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // New v2 Relationship Type Definition Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS', () => {
    it('should have built-in relationship type definitions', () => {
      expect(DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('should all be marked as built-in', () => {
      expect(
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.every(t => t.isBuiltIn)
      ).toBe(true);
    });

    it('should all have unique IDs', () => {
      const ids = DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have endpoint configurations', () => {
      DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.forEach(t => {
        expect(t.sourceEndpoint).toBeDefined();
        expect(t.targetEndpoint).toBeDefined();
        expect(Array.isArray(t.sourceEndpoint.allowedSchemas)).toBe(true);
        expect(Array.isArray(t.targetEndpoint.allowedSchemas)).toBe(true);
      });
    });

    it('should have showInverse defined', () => {
      DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.forEach(t => {
        expect(typeof t.showInverse).toBe('boolean');
      });
    });

    it('should have gendered family types with showInverse=false', () => {
      const mother = DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.find(
        t => t.id === 'mother'
      );
      const father = DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.find(
        t => t.id === 'father'
      );
      const brother = DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.find(
        t => t.id === 'brother'
      );
      const sister = DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.find(
        t => t.id === 'sister'
      );

      expect(mother?.showInverse).toBe(false);
      expect(father?.showInverse).toBe(false);
      expect(brother?.showInverse).toBe(false);
      expect(sister?.showInverse).toBe(false);
    });

    it('should have parent type with maxCount constraint on target', () => {
      const parent = DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.find(
        t => t.id === 'parent'
      );
      expect(parent?.targetEndpoint.maxCount).toBe(2); // Max 2 parents
    });
  });

  describe('getRelationshipTypeDefinitionById', () => {
    it('should find relationship type definition by ID in provided array', () => {
      const parent = getRelationshipTypeDefinitionById(
        'parent',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      expect(parent).toBeDefined();
      expect(parent?.name).toBe('Parent');
      expect(parent?.inverseLabel).toBe('Child of');
    });

    it('should return undefined for unknown ID', () => {
      const unknown = getRelationshipTypeDefinitionById(
        'unknown-type',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      expect(unknown).toBeUndefined();
    });

    it('should return undefined when searching empty array', () => {
      const result = getRelationshipTypeDefinitionById('parent', []);
      expect(result).toBeUndefined();
    });

    it('should find custom type in provided array', () => {
      const customType: RelationshipTypeDefinition = {
        id: 'parent',
        name: 'Custom Parent',
        inverseLabel: 'Custom Child of',
        showInverse: true,
        category: RelationshipCategory.Familial,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      const result = getRelationshipTypeDefinitionById('parent', [customType]);
      expect(result?.name).toBe('Custom Parent');
      expect(result?.isBuiltIn).toBe(false);
    });
  });

  describe('getAllRelationshipTypeDefinitions', () => {
    it('should return empty array when no types provided', () => {
      const all = getAllRelationshipTypeDefinitions();
      expect(all.length).toBe(0);
    });

    it('should return provided types array', () => {
      const all = getAllRelationshipTypeDefinitions(
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      expect(all.length).toBe(DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.length);
    });

    it('should include custom types in provided array', () => {
      const customType: RelationshipTypeDefinition = {
        id: 'custom-def',
        name: 'Custom Definition',
        inverseLabel: 'Custom Inverse',
        showInverse: true,
        category: RelationshipCategory.Custom,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      const all = getAllRelationshipTypeDefinitions([customType]);
      expect(all.length).toBe(1);
      expect(all).toContain(customType);
    });
  });

  describe('getRelationshipTypeDefinitionsByCategory', () => {
    it('should filter by category from provided types', () => {
      const familial = getRelationshipTypeDefinitionsByCategory(
        RelationshipCategory.Familial,
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      expect(familial.length).toBeGreaterThan(0);
      expect(
        familial.every(t => t.category === RelationshipCategory.Familial)
      ).toBe(true);
    });

    it('should return empty array when no types provided', () => {
      const familial = getRelationshipTypeDefinitionsByCategory(
        RelationshipCategory.Familial
      );
      expect(familial.length).toBe(0);
    });

    it('should include custom types in category', () => {
      const customType: RelationshipTypeDefinition = {
        id: 'custom-social-def',
        name: 'Custom Social',
        inverseLabel: 'Custom Social of',
        showInverse: true,
        category: RelationshipCategory.Social,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      const social = getRelationshipTypeDefinitionsByCategory(
        RelationshipCategory.Social,
        [customType]
      );
      expect(social).toContain(customType);
    });
  });

  describe('getRelationshipTypeDefinitionLabel', () => {
    it('should return name when not incoming', () => {
      const type: RelationshipTypeDefinition = {
        id: 'test',
        name: 'Forward Name',
        inverseLabel: 'Inverse Label',
        showInverse: true,
        category: RelationshipCategory.Familial,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      expect(getRelationshipTypeDefinitionLabel(type, false)).toBe(
        'Forward Name'
      );
    });

    it('should return inverseLabel when incoming', () => {
      const type: RelationshipTypeDefinition = {
        id: 'test',
        name: 'Forward Name',
        inverseLabel: 'Inverse Label',
        showInverse: true,
        category: RelationshipCategory.Familial,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      expect(getRelationshipTypeDefinitionLabel(type, true)).toBe(
        'Inverse Label'
      );
    });
  });

  describe('shouldShowInverse', () => {
    it('should return true when showInverse is true', () => {
      const type: RelationshipTypeDefinition = {
        id: 'test',
        name: 'Test',
        inverseLabel: 'Test of',
        showInverse: true,
        category: RelationshipCategory.Social,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      expect(shouldShowInverse(type)).toBe(true);
    });

    it('should return false when showInverse is false', () => {
      const type: RelationshipTypeDefinition = {
        id: 'test',
        name: 'Test',
        inverseLabel: 'Test of',
        showInverse: false,
        category: RelationshipCategory.Familial,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      expect(shouldShowInverse(type)).toBe(false);
    });
  });

  describe('getValidRelationshipTypesForSource', () => {
    it('should return types where source schema is allowed', () => {
      const types = getValidRelationshipTypesForSource(
        'CHARACTER',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      expect(types.length).toBeGreaterThan(0);
      types.forEach(t => {
        expect(
          t.sourceEndpoint.allowedSchemas.length === 0 ||
            t.sourceEndpoint.allowedSchemas.includes('CHARACTER')
        ).toBe(true);
      });
    });

    it('should return types with empty allowedSchemas (any schema)', () => {
      const types = getValidRelationshipTypesForSource(
        'CUSTOM_UNKNOWN_TYPE',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      // Should still find types that allow any schema (empty array)
      const anySchemaTypes = types.filter(
        t => t.sourceEndpoint.allowedSchemas.length === 0
      );
      expect(anySchemaTypes.length).toBeGreaterThan(0);
    });

    it('should not return types restricted to other schemas', () => {
      const types = getValidRelationshipTypesForSource(
        'LOCATION',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      // Should not include 'spouse' which is CHARACTER-only
      const spouse = types.find(t => t.id === 'spouse');
      expect(spouse).toBeUndefined();
    });

    it('should return empty array when no types provided', () => {
      const types = getValidRelationshipTypesForSource('CHARACTER');
      expect(types.length).toBe(0);
    });
  });

  describe('getValidRelationshipTypesForPair', () => {
    it('should return types valid for both source and target schemas', () => {
      const types = getValidRelationshipTypesForPair(
        'CHARACTER',
        'CHARACTER',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      expect(types.length).toBeGreaterThan(0);

      // Should include sibling (both ends CHARACTER)
      const sibling = types.find(t => t.id === 'sibling');
      expect(sibling).toBeDefined();
    });

    it('should not return types where target schema is not allowed', () => {
      const types = getValidRelationshipTypesForPair(
        'CHARACTER',
        'WB_ITEM',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );

      // Should not include sibling (both ends must be CHARACTER)
      const sibling = types.find(t => t.id === 'sibling');
      expect(sibling).toBeUndefined();

      // Should include owns (CHARACTER -> WB_ITEM allowed)
      const owns = types.find(t => t.id === 'owns');
      expect(owns).toBeDefined();
    });

    it('should return types with empty allowedSchemas on both ends', () => {
      const types = getValidRelationshipTypesForPair(
        'CUSTOM_A',
        'CUSTOM_B',
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS
      );
      // Should find reference types which allow any schema
      const referenced = types.find(t => t.id === 'referenced-in');
      expect(referenced).toBeDefined();
    });
  });
});
