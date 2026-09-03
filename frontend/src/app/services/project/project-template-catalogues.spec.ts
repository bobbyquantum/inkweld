import type { RelationshipTypeDefinition } from '@models/element-ref.model';
import { describe, expect, it } from 'vitest';

import demoRelationshipTypes from '../../../../public/assets/project-templates/worldbuilding-demo/relationship-types.json';
import demoSchemas from '../../../../public/assets/project-templates/worldbuilding-demo/schemas.json';
import demoWorldbuilding from '../../../../public/assets/project-templates/worldbuilding-demo/worldbuilding.json';
import emptyRelationshipTypes from '../../../../public/assets/project-templates/worldbuilding-empty/relationship-types.json';
import emptySchemas from '../../../../public/assets/project-templates/worldbuilding-empty/schemas.json';
import type { ArchiveWorldbuildingData } from '../../models/project-archive';
import type { ElementTypeSchema } from '../../models/schema-types';

const emptySchemaList = emptySchemas as unknown as ElementTypeSchema[];
const demoSchemaList = demoSchemas as unknown as ElementTypeSchema[];
const emptyRelationshipList =
  emptyRelationshipTypes as unknown as RelationshipTypeDefinition[];
const demoRelationshipList =
  demoRelationshipTypes as unknown as RelationshipTypeDefinition[];
const demoWorldbuildingList =
  demoWorldbuilding as unknown as ArchiveWorldbuildingData[];

const LINEAR_GRADIENT = /^linear-gradient\(\d+deg(, #[0-9a-f]{6} \d+%){2,}\)$/;

describe('worldbuilding template catalogues', () => {
  it('should keep the demo and empty schema catalogues identical', () => {
    expect(demoSchemaList).toEqual(emptySchemaList);
  });

  it('should keep the demo and empty relationship catalogues identical', () => {
    expect(demoRelationshipList).toEqual(emptyRelationshipList);
  });

  it('should not contain duplicate schema ids in relationship endpoints', () => {
    for (const [folder, types] of [
      ['worldbuilding-empty', emptyRelationshipList],
      ['worldbuilding-demo', demoRelationshipList],
    ] as const) {
      for (const type of types) {
        for (const [label, endpoint] of [
          ['source', type.sourceEndpoint],
          ['target', type.targetEndpoint],
        ] as const) {
          const ids = endpoint.allowedSchemas;
          expect(
            new Set(ids).size,
            `${folder} ${type.id} ${label} endpoint contains duplicate schema ids`
          ).toBe(ids.length);
        }
      }
    }
  });

  it('should give every built-in schema a themed gradient default appearance', () => {
    for (const schema of emptySchemaList) {
      for (const region of ['menu', 'content'] as const) {
        const setting = schema.defaultAppearance?.[region];
        expect(setting, `${schema.id} ${region}`).toBeDefined();
        expect(setting?.type).toBe('gradient');
        expect(setting?.mode).toBe('manual');
        expect(setting?.light, `${schema.id} ${region} light`).toMatch(
          LINEAR_GRADIENT
        );
        expect(setting?.dark, `${schema.id} ${region} dark`).toMatch(
          LINEAR_GRADIENT
        );
      }
    }
  });

  it("should give every demo element its schema's default appearance", () => {
    const byId = new Map(demoSchemaList.map(schema => [schema.id, schema]));
    expect(demoWorldbuildingList.length).toBeGreaterThan(0);
    for (const element of demoWorldbuildingList) {
      const schema = byId.get(element.schemaId);
      expect(schema, `${element.elementId} schema`).toBeDefined();
      expect(element.appearance, element.elementId).toEqual(
        schema?.defaultAppearance
      );
    }
  });
});
