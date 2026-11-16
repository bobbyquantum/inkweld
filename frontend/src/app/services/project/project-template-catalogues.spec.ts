import type {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '@models/element-ref.model';
import type { Generator } from '@models/generator';
import { rollGenerator, validateGenerator } from '@utils/generator-engine';
import { describe, expect, it } from 'vitest';

import ttrpgDemoRelationshipTypes from '../../../../public/assets/project-templates/ttrpg-demo/relationship-types.json';
import ttrpgDemoSchemas from '../../../../public/assets/project-templates/ttrpg-demo/schemas.json';
import ttrpgEmptyRelationshipTypes from '../../../../public/assets/project-templates/ttrpg-empty/relationship-types.json';
import ttrpgEmptySchemas from '../../../../public/assets/project-templates/ttrpg-empty/schemas.json';
import demoGenerators from '../../../../public/assets/project-templates/worldbuilding-demo/generators.json';
import demoRelationshipTypes from '../../../../public/assets/project-templates/worldbuilding-demo/relationship-types.json';
import demoRelationships from '../../../../public/assets/project-templates/worldbuilding-demo/relationships.json';
import demoSchemas from '../../../../public/assets/project-templates/worldbuilding-demo/schemas.json';
import demoWorldbuilding from '../../../../public/assets/project-templates/worldbuilding-demo/worldbuilding.json';
import emptyGenerators from '../../../../public/assets/project-templates/worldbuilding-empty/generators.json';
import emptyRelationshipTypes from '../../../../public/assets/project-templates/worldbuilding-empty/relationship-types.json';
import emptySchemas from '../../../../public/assets/project-templates/worldbuilding-empty/schemas.json';
import { worldbuildingDataProblems } from '../../../testing/worldbuilding-template-checks';
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
const emptyGeneratorList = emptyGenerators as unknown as Generator[];
const demoGeneratorList = demoGenerators as unknown as Generator[];

/** Every template that ships relationship fields, with its catalogues. */
const TEMPLATES_WITH_RELATIONSHIP_FIELDS = [
  ['worldbuilding-empty', emptySchemaList, emptyRelationshipList],
  ['worldbuilding-demo', demoSchemaList, demoRelationshipList],
  [
    'ttrpg-empty',
    ttrpgEmptySchemas as unknown as ElementTypeSchema[],
    ttrpgEmptyRelationshipTypes as unknown as RelationshipTypeDefinition[],
  ],
  [
    'ttrpg-demo',
    ttrpgDemoSchemas as unknown as ElementTypeSchema[],
    ttrpgDemoRelationshipTypes as unknown as RelationshipTypeDefinition[],
  ],
] as const;

const LINEAR_GRADIENT = /^linear-gradient\(\d+deg(, #[0-9a-f]{6} \d+%){2,}\)$/;

describe('worldbuilding template catalogues', () => {
  it('should keep the demo and empty schema catalogues identical', () => {
    expect(demoSchemaList).toEqual(emptySchemaList);
  });

  it('should keep the demo and empty relationship catalogues identical', () => {
    expect(demoRelationshipList).toEqual(emptyRelationshipList);
  });

  it('should keep the demo and empty generator catalogues identical', () => {
    expect(demoGeneratorList).toEqual(emptyGeneratorList);
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

  it('should only store demo data under fields its schema shows', () => {
    expect(
      worldbuildingDataProblems(demoWorldbuildingList, demoSchemaList)
    ).toEqual([]);
  });

  it('should report a flat value that shadows a field group', () => {
    const schema = demoSchemaList.find(s => s.id === 'region-v1')!;
    expect(
      worldbuildingDataProblems(
        [
          {
            elementId: 'vales',
            schemaId: 'region-v1',
            data: {
              description: 'Identity text is allowed',
              politics: 'Shadows politics.*',
              population: 'A field',
              populace: 'Not a field',
            },
          },
        ],
        [schema]
      )
    ).toEqual([
      'vales: flat "politics" shadows the politics.* field group',
      'vales: "populace" is not a field of region-v1',
    ]);
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

describe('template relationship fields', () => {
  it('should back every relationship field with a type carrying its labels', () => {
    for (const [folder, schemas, types] of TEMPLATES_WITH_RELATIONSHIP_FIELDS) {
      const byId = new Map(types.map(type => [type.id, type]));
      for (const schema of schemas) {
        for (const field of schema.tabs.flatMap(tab => tab.fields)) {
          if (field.type !== 'relationship') continue;
          const where = `${folder} ${schema.id}.${field.key}`;
          const type = byId.get(field.relationshipTypeId ?? '');
          expect(type, `${where} has no relationship type`).toBeDefined();
          expect(type?.name, where).toBe(field.label);
          expect(type?.inverseLabel, where).toBe(
            field.inverseLabel ?? field.label
          );
          expect(type?.fieldSource, where).toEqual({
            schemaId: schema.id,
            fieldKey: field.key,
          });
        }
      }
    }
  });

  // A Family field is stored on the child and points at the parent, so the
  // parent's backlink lists the child: "Children", never "Child of" (#1764).
  it("should label a character's parents' backlink Children", () => {
    for (const [folder, schemas, types] of TEMPLATES_WITH_RELATIONSHIP_FIELDS) {
      const character = schemas.find(schema => schema.id === 'character-v1');
      const fields = character?.tabs.flatMap(tab => tab.fields) ?? [];
      for (const key of ['mother', 'father']) {
        const field = fields.find(f => f.key === key);
        expect(field?.inverseLabel, `${folder} ${key} field`).toBe('Children');
        const type = types.find(t => t.id === field?.relationshipTypeId);
        expect(type?.inverseLabel, `${folder} ${key} type`).toBe('Children');
      }
    }
  });
});

describe('worldbuilding demo relationships', () => {
  const relationships = demoRelationships as unknown as ElementRelationship[];
  const direction = (id: string) => {
    const relationship = relationships.find(r => r.id === id);
    return [relationship?.sourceElementId, relationship?.targetElementId];
  };

  it('should point each link the way its note describes', () => {
    // Ironhold lies within Eldoria.
    expect(direction('rel-eldoria-ironhold')).toEqual([
      'settle-ironhold',
      'country-eldoria',
    ]);
    // The Legend of the First Accord mentions the library.
    expect(direction('rel-library-myth')).toEqual([
      'myth-first-accord',
      'lore-library',
    ]);
    // The festival commemorates the Accord, so the Accord caused it.
    expect(direction('rel-accord-festival')).toEqual([
      'event-accord',
      'tradition-festival',
    ]);
  });

  it("should store Elara's Family fields on Elara, pointing at her parents", () => {
    expect(direction('rel-elara-lirael-mother')).toEqual([
      'char-elara',
      'char-lirael',
    ]);
    expect(direction('rel-elara-marcus-father')).toEqual([
      'char-elara',
      'char-marcus',
    ]);
  });
});

describe('shipped generators', () => {
  it('should be free of validation errors', () => {
    expect(emptyGeneratorList.length).toBeGreaterThan(0);
    for (const generator of emptyGeneratorList) {
      const errors = validateGenerator(generator).filter(
        issue => issue.severity === 'error'
      );
      expect(
        errors.map(issue => issue.message),
        `${generator.id} has validation errors`
      ).toEqual([]);
    }
  });

  it('should have unique ids', () => {
    const ids = emptyGeneratorList.map(generator => generator.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should roll text for every seed, with no reference left unexpanded', () => {
    for (const generator of emptyGeneratorList) {
      // A fixed span of seeds covers every branch of these small grammars,
      // so a typo in one rarely-picked entry cannot slip through.
      const results = rollGenerator(generator, { seed: 1, count: 200 });
      expect(results.length, generator.id).toBe(200);
      for (const result of results) {
        expect(result.text, `${generator.id} rolled an empty result`).not.toBe(
          ''
        );
        expect(
          result.text,
          `${generator.id} left a reference unexpanded: ${result.text}`
        ).not.toMatch(/#[a-zA-Z]/);
        expect(
          result.text,
          `${generator.id} rolled padded text: ${JSON.stringify(result.text)}`
        ).toBe(result.text.trim());
      }
    }
  });

  it('should be referenced by the schemas that bind them', () => {
    const generatorIds = new Set(
      emptyGeneratorList.map(generator => generator.id)
    );
    const bound = new Set<string>();

    for (const schema of emptySchemaList) {
      if (schema.nameGeneratorId) {
        expect(
          generatorIds.has(schema.nameGeneratorId),
          `${schema.id} name generator ${schema.nameGeneratorId} does not exist`
        ).toBe(true);
        bound.add(schema.nameGeneratorId);
      }
      for (const tab of schema.tabs) {
        for (const field of tab.fields) {
          if (!field.generatorId) continue;
          expect(
            generatorIds.has(field.generatorId),
            `${schema.id}.${field.key} generator ${field.generatorId} does not exist`
          ).toBe(true);
          expect(
            ['text', 'textarea'],
            `${schema.id}.${field.key} is not a free-text field`
          ).toContain(field.type);
          bound.add(field.generatorId);
        }
      }
    }

    expect(bound.size).toBeGreaterThan(0);
  });
});
