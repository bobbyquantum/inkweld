import type { RelationshipTypeDefinition } from '@models/element-ref.model';
import { describe, expect, it } from 'vitest';

import demoRelationshipTypes from '../../../../public/assets/project-templates/worldbuilding-demo/relationship-types.json';
import demoSchemas from '../../../../public/assets/project-templates/worldbuilding-demo/schemas.json';
import emptyRelationshipTypes from '../../../../public/assets/project-templates/worldbuilding-empty/relationship-types.json';
import emptySchemas from '../../../../public/assets/project-templates/worldbuilding-empty/schemas.json';
import type { ElementTypeSchema } from '../../models/schema-types';

const emptySchemaList = emptySchemas as unknown as ElementTypeSchema[];
const demoSchemaList = demoSchemas as unknown as ElementTypeSchema[];
const emptyRelationshipList =
  emptyRelationshipTypes as unknown as RelationshipTypeDefinition[];
const demoRelationshipList =
  demoRelationshipTypes as unknown as RelationshipTypeDefinition[];

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
});
