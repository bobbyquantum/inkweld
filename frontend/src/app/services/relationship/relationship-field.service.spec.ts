import { TestBed } from '@angular/core/testing';
import {
  type ElementRelationship,
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { FieldType } from '@models/schema-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { RelationshipService } from './relationship.service';
import { RelationshipFieldService } from './relationship-field.service';

describe('RelationshipFieldService', () => {
  let service: RelationshipFieldService;
  let relationshipService: {
    getTypeById: ReturnType<typeof vi.fn>;
    addRawType: ReturnType<typeof vi.fn>;
    updateCustomType: ReturnType<typeof vi.fn>;
    removeCustomType: ReturnType<typeof vi.fn>;
    getAllTypes: ReturnType<typeof vi.fn>;
    getAllRelationships: ReturnType<typeof vi.fn>;
    getOutgoingRelationships: ReturnType<typeof vi.fn>;
    removeRelationship: ReturnType<typeof vi.fn>;
  };

  const schemaId = 'character-schema';

  const makeField = (overrides = {}) => ({
    key: 'mother',
    label: 'Mother',
    type: FieldType.RELATIONSHIP,
    relationshipTypeId: 'fieldrel-abc123',
    ...overrides,
  });

  beforeEach(() => {
    relationshipService = {
      getTypeById: vi.fn().mockReturnValue(undefined),
      addRawType: vi.fn(),
      updateCustomType: vi.fn().mockReturnValue(true),
      removeCustomType: vi.fn().mockReturnValue(true),
      getAllTypes: vi.fn().mockReturnValue([]),
      getAllRelationships: vi.fn().mockReturnValue([]),
      getOutgoingRelationships: vi.fn().mockReturnValue([]),
      removeRelationship: vi.fn().mockReturnValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        RelationshipFieldService,
        { provide: RelationshipService, useValue: relationshipService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(RelationshipFieldService);
  });

  describe('isRelationshipField', () => {
    it('should return true for relationship fields', () => {
      expect(service.isRelationshipField(makeField())).toBe(true);
    });

    it('should return false for other field types', () => {
      expect(
        service.isRelationshipField(makeField({ type: FieldType.TEXT }))
      ).toBe(false);
    });
  });

  describe('stampRelationshipTypeId', () => {
    it('should assign an id to a relationship field without one', () => {
      const field = makeField({ relationshipTypeId: undefined });
      const stamped = service.stampRelationshipTypeId(field);
      expect(stamped.relationshipTypeId).toMatch(/^fieldrel-/);
    });

    it('should not overwrite an existing id', () => {
      const field = makeField({ relationshipTypeId: 'existing-id' });
      const stamped = service.stampRelationshipTypeId(field);
      expect(stamped.relationshipTypeId).toBe('existing-id');
    });

    it('should return non-relationship fields unchanged', () => {
      const field = makeField({
        type: FieldType.TEXT,
        relationshipTypeId: undefined,
      });
      const stamped = service.stampRelationshipTypeId(field);
      expect(stamped).toBe(field);
      expect(stamped.relationshipTypeId).toBeUndefined();
    });
  });

  describe('buildTypeDef', () => {
    it('should build a single-valued field type', () => {
      const def = service.buildTypeDef(schemaId, makeField(), 'type-1');
      expect(def.id).toBe('type-1');
      expect(def.name).toBe('Mother');
      expect(def.category).toBe(RelationshipCategory.Custom);
      expect(def.isBuiltIn).toBe(false);
      expect(def.showInverse).toBe(true);
      expect(def.sourceEndpoint.allowedSchemas).toEqual([schemaId]);
      expect(def.sourceEndpoint.maxCount).toBe(1);
      expect(def.targetEndpoint.allowedSchemas).toEqual([]);
      expect(def.targetEndpoint.maxCount).toBeNull();
      expect(def.fieldSource).toEqual({ schemaId, fieldKey: 'mother' });
    });

    it('should allow multiple links when multiple is true', () => {
      const def = service.buildTypeDef(
        schemaId,
        makeField({ multiple: true }),
        'type-1'
      );
      expect(def.sourceEndpoint.maxCount).toBeNull();
    });

    it('should constrain the target schema when set', () => {
      const def = service.buildTypeDef(
        schemaId,
        makeField({ targetSchemaId: 'location-schema' }),
        'type-1'
      );
      expect(def.targetEndpoint.allowedSchemas).toEqual(['location-schema']);
    });

    it('should use inverseLabel when provided, else fall back to label', () => {
      expect(
        service.buildTypeDef(
          schemaId,
          makeField({ inverseLabel: 'Child of' }),
          't'
        ).inverseLabel
      ).toBe('Child of');
      expect(
        service.buildTypeDef(
          schemaId,
          makeField({ inverseLabel: undefined }),
          't'
        ).inverseLabel
      ).toBe('Mother');
    });
  });

  describe('ensureTypeForField', () => {
    it('should return null for non-relationship fields', () => {
      expect(
        service.ensureTypeForField(
          schemaId,
          makeField({ type: FieldType.TEXT })
        )
      ).toBeNull();
      expect(relationshipService.addRawType).not.toHaveBeenCalled();
    });

    it('should return null and warn when relationshipTypeId is missing', () => {
      expect(
        service.ensureTypeForField(
          schemaId,
          makeField({ relationshipTypeId: undefined })
        )
      ).toBeNull();
      expect(relationshipService.addRawType).not.toHaveBeenCalled();
    });

    it('should create the type when it does not exist', () => {
      const result = service.ensureTypeForField(schemaId, makeField());
      expect(result).toBe('fieldrel-abc123');
      expect(relationshipService.addRawType).toHaveBeenCalledTimes(1);
      expect(relationshipService.updateCustomType).not.toHaveBeenCalled();
    });

    it('should not recreate an identical existing type', () => {
      const existing = service.buildTypeDef(
        schemaId,
        makeField(),
        'fieldrel-abc123'
      );
      relationshipService.getTypeById.mockReturnValue(existing);
      const result = service.ensureTypeForField(schemaId, makeField());
      expect(result).toBe('fieldrel-abc123');
      expect(relationshipService.addRawType).not.toHaveBeenCalled();
      expect(relationshipService.updateCustomType).not.toHaveBeenCalled();
    });

    it('should update the type when the field config changed', () => {
      const existing = service.buildTypeDef(
        schemaId,
        makeField(),
        'fieldrel-abc123'
      );
      relationshipService.getTypeById.mockReturnValue(existing);
      const result = service.ensureTypeForField(
        schemaId,
        makeField({ label: 'Renamed Mother' })
      );
      expect(result).toBe('fieldrel-abc123');
      expect(relationshipService.addRawType).not.toHaveBeenCalled();
      expect(relationshipService.updateCustomType).toHaveBeenCalledTimes(1);
      const [typeId, updates] =
        relationshipService.updateCustomType.mock.calls[0];
      expect(typeId).toBe('fieldrel-abc123');
      expect(updates.name).toBe('Renamed Mother');
      expect(updates).not.toHaveProperty('id');
      expect(updates).not.toHaveProperty('isBuiltIn');
    });
  });

  describe('removeTypeForField', () => {
    it('should remove the type', () => {
      service.removeTypeForField(makeField());
      expect(relationshipService.removeCustomType).toHaveBeenCalledWith(
        'fieldrel-abc123'
      );
    });

    it('should do nothing when there is no relationshipTypeId', () => {
      service.removeTypeForField(makeField({ relationshipTypeId: undefined }));
      expect(relationshipService.removeCustomType).not.toHaveBeenCalled();
    });

    it('should remove relationships first when requested', () => {
      const rels: ElementRelationship[] = [
        {
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
          relationshipTypeId: 'fieldrel-abc123',
          createdAt: '',
          updatedAt: '',
        },
      ];
      relationshipService.getAllRelationships.mockReturnValue(rels);
      service.removeTypeForField(makeField(), true);
      expect(relationshipService.removeRelationship).toHaveBeenCalledWith('r1');
      expect(relationshipService.removeCustomType).toHaveBeenCalled();
    });
  });

  describe('removeRelationshipsOfType', () => {
    it('should remove only relationships of the given type', () => {
      const rels: ElementRelationship[] = [
        {
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
          relationshipTypeId: 'fieldrel-abc123',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'r2',
          sourceElementId: 'a',
          targetElementId: 'c',
          relationshipTypeId: 'other-type',
          createdAt: '',
          updatedAt: '',
        },
      ];
      relationshipService.getAllRelationships.mockReturnValue(rels);
      const removed = service.removeRelationshipsOfType('fieldrel-abc123');
      expect(removed).toBe(1);
      expect(relationshipService.removeRelationship).toHaveBeenCalledWith('r1');
      expect(relationshipService.removeRelationship).not.toHaveBeenCalledWith(
        'r2'
      );
    });
  });

  describe('removeTypesForSchema', () => {
    it('should remove only field-managed types owned by the schema', () => {
      const managedType: RelationshipTypeDefinition = {
        id: 'fieldrel-abc123',
        name: 'Mother',
        inverseLabel: 'Mother',
        showInverse: true,
        category: RelationshipCategory.Custom,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [schemaId] },
        targetEndpoint: { allowedSchemas: [] },
        fieldSource: { schemaId, fieldKey: 'mother' },
      };
      const otherSchemaType: RelationshipTypeDefinition = {
        ...managedType,
        id: 'fieldrel-other',
        fieldSource: { schemaId: 'other-schema', fieldKey: 'father' },
      };
      const userTypeDef: RelationshipTypeDefinition = {
        ...managedType,
        id: 'custom-user',
        fieldSource: undefined,
      };
      relationshipService.getAllTypes.mockReturnValue([
        managedType,
        otherSchemaType,
        userTypeDef,
      ]);

      const removed = service.removeTypesForSchema(schemaId);

      expect(removed).toBe(1);
      expect(relationshipService.removeCustomType).toHaveBeenCalledWith(
        'fieldrel-abc123'
      );
      expect(relationshipService.removeCustomType).not.toHaveBeenCalledWith(
        'fieldrel-other'
      );
      expect(relationshipService.removeCustomType).not.toHaveBeenCalledWith(
        'custom-user'
      );
    });

    it('should remove relationship instances of the removed types', () => {
      const managedType: RelationshipTypeDefinition = {
        id: 'fieldrel-abc123',
        name: 'Mother',
        inverseLabel: 'Mother',
        showInverse: true,
        category: RelationshipCategory.Custom,
        isBuiltIn: false,
        sourceEndpoint: { allowedSchemas: [schemaId] },
        targetEndpoint: { allowedSchemas: [] },
        fieldSource: { schemaId, fieldKey: 'mother' },
      };
      relationshipService.getAllTypes.mockReturnValue([managedType]);
      relationshipService.getAllRelationships.mockReturnValue([
        {
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
          relationshipTypeId: 'fieldrel-abc123',
          createdAt: '',
          updatedAt: '',
        },
      ]);

      service.removeTypesForSchema(schemaId);

      expect(relationshipService.removeRelationship).toHaveBeenCalledWith('r1');
    });

    it('should return zero when the schema owns no field-managed types', () => {
      relationshipService.getAllTypes.mockReturnValue([]);
      expect(service.removeTypesForSchema(schemaId)).toBe(0);
      expect(relationshipService.removeCustomType).not.toHaveBeenCalled();
    });
  });

  describe('getRelationshipsForField', () => {
    it('should return outgoing relationships matching the field type', () => {
      const rels: ElementRelationship[] = [
        {
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
          relationshipTypeId: 'fieldrel-abc123',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'r2',
          sourceElementId: 'a',
          targetElementId: 'c',
          relationshipTypeId: 'other-type',
          createdAt: '',
          updatedAt: '',
        },
      ];
      relationshipService.getOutgoingRelationships.mockReturnValue(rels);
      const result = service.getRelationshipsForField('a', makeField());
      expect(relationshipService.getOutgoingRelationships).toHaveBeenCalledWith(
        'a'
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r1');
    });

    it('should return empty when field has no relationshipTypeId', () => {
      const result = service.getRelationshipsForField(
        'a',
        makeField({ relationshipTypeId: undefined })
      );
      expect(result).toEqual([]);
    });
  });
});
