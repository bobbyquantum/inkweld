import { inject, Injectable } from '@angular/core';
import {
  type ElementRelationship,
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { type FieldSchema } from '@models/schema-types';
import { LoggerService } from '@services/core/logger.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { nanoid } from 'nanoid';

/**
 * Bridges worldbuilding template "relationship fields" onto the centralized
 * relationship graph.
 *
 * A relationship field (e.g. "Mother") is backed by an auto-managed
 * {@link RelationshipTypeDefinition}. This service keeps that type in sync
 * with the field definition (create/rename/update constraints/delete) and
 * exposes helpers for reading and writing the field's relationship instances.
 *
 * The element owning the field is the relationship *source*; the linked
 * element is the *target*. A single-valued field maps to
 * `sourceEndpoint.maxCount = 1`.
 */
@Injectable({
  providedIn: 'root',
})
export class RelationshipFieldService {
  private readonly relationshipService = inject(RelationshipService);
  private readonly logger = inject(LoggerService);

  /**
   * Returns true when the field is a relationship field.
   */
  isRelationshipField(field: FieldSchema): boolean {
    return field.type === 'relationship';
  }

  /**
   * Returns a copy of the field with a stable `relationshipTypeId` assigned.
   * Non-relationship fields and fields that already have an id are returned
   * unchanged. Intended for use by the template editor when a relationship
   * field is created, so the id is persisted into the schema.
   */
  stampRelationshipTypeId(field: FieldSchema): FieldSchema {
    if (!this.isRelationshipField(field)) {
      return field;
    }
    if (field.relationshipTypeId) {
      return field;
    }
    return { ...field, relationshipTypeId: `fieldrel-${nanoid(10)}` };
  }

  /**
   * Ensures the auto-managed relationship type for a field exists and matches
   * the field's current configuration. Idempotent. Returns the relationship
   * type id backing the field, or null when the field is not a relationship
   * field or has no assigned id.
   */
  ensureTypeForField(schemaId: string, field: FieldSchema): string | null {
    if (!this.isRelationshipField(field)) {
      return null;
    }

    const typeId = field.relationshipTypeId;
    if (!typeId) {
      this.logger.warn(
        'RelationshipFieldService',
        `Relationship field "${field.key}" has no relationshipTypeId; run stampRelationshipTypeId in the template editor`
      );
      return null;
    }

    const desired = this.buildTypeDef(schemaId, field, typeId);
    const existing = this.relationshipService.getTypeById(typeId);

    if (!existing) {
      this.relationshipService.addRawType(desired);
      this.logger.debug(
        'RelationshipFieldService',
        `Created relationship type ${typeId} for field "${field.key}"`
      );
    } else if (!this.typesEqual(existing, desired)) {
      const { id: _id, isBuiltIn: _isBuiltIn, ...updates } = desired;
      this.relationshipService.updateCustomType(typeId, updates);
      this.logger.debug(
        'RelationshipFieldService',
        `Updated relationship type ${typeId} for field "${field.key}"`
      );
    }

    return typeId;
  }

  /**
   * Removes the auto-managed relationship type for a field, optionally
   * removing all relationship instances of that type first.
   */
  removeTypeForField(field: FieldSchema, removeRelationships = false): void {
    const typeId = field.relationshipTypeId;
    if (!typeId) {
      return;
    }

    if (removeRelationships) {
      this.removeRelationshipsOfType(typeId);
    }

    this.relationshipService.removeCustomType(typeId);
    this.logger.debug(
      'RelationshipFieldService',
      `Removed relationship type ${typeId} for field "${field.key}"`
    );
  }

  /**
   * Removes every relationship instance of the given type. Returns the number
   * of relationships removed.
   */
  removeRelationshipsOfType(typeId: string): number {
    const toRemove = this.relationshipService
      .getAllRelationships()
      .filter(r => r.relationshipTypeId === typeId);

    let removed = 0;
    for (const rel of toRemove) {
      if (this.relationshipService.removeRelationship(rel.id)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Removes every auto-managed relationship type owned by a schema, along
   * with all of their relationship instances. Used when a template is
   * deleted. Returns the number of types removed.
   */
  removeTypesForSchema(schemaId: string): number {
    const managedTypes = this.relationshipService
      .getAllTypes()
      .filter(t => t.fieldSource?.schemaId === schemaId);

    for (const type of managedTypes) {
      this.removeRelationshipsOfType(type.id);
      this.relationshipService.removeCustomType(type.id);
    }

    if (managedTypes.length > 0) {
      this.logger.debug(
        'RelationshipFieldService',
        `Removed ${managedTypes.length} field-managed relationship types for schema ${schemaId}`
      );
    }

    return managedTypes.length;
  }

  /**
   * Returns the relationship instances backing a field for a given source
   * element (the element that owns the field).
   */
  getRelationshipsForField(
    sourceElementId: string,
    field: FieldSchema
  ): ElementRelationship[] {
    const typeId = field.relationshipTypeId;
    if (!typeId) {
      return [];
    }
    return this.relationshipService
      .getOutgoingRelationships(sourceElementId)
      .filter(r => r.relationshipTypeId === typeId);
  }

  /**
   * Builds the relationship type definition that backs a field.
   */
  buildTypeDef(
    schemaId: string,
    field: FieldSchema,
    typeId: string
  ): RelationshipTypeDefinition {
    return {
      id: typeId,
      name: field.label,
      inverseLabel: field.inverseLabel ?? field.label,
      showInverse: true,
      category: RelationshipCategory.Custom,
      isBuiltIn: false,
      sourceEndpoint: {
        allowedSchemas: [schemaId],
        maxCount: field.multiple ? null : 1,
      },
      targetEndpoint: {
        allowedSchemas: field.targetSchemaId ? [field.targetSchemaId] : [],
        maxCount: null,
      },
      fieldSource: { schemaId, fieldKey: field.key },
    };
  }

  private typesEqual(
    a: RelationshipTypeDefinition,
    b: RelationshipTypeDefinition
  ): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
