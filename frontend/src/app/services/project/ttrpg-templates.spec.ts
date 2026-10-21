/**
 * Integrity checks for the Tabletop RPG templates ("Tabletop RPG (Empty)" and
 * "Tabletop RPG (Demo)", the latter a complete illustrated campaign): every
 * link must point at something that exists, and every document must be valid
 * for the editor schema.
 */
import { Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import index from '../../../../public/assets/project-templates/index.json';
import demoDocuments from '../../../../public/assets/project-templates/ttrpg-demo/documents.json';
import demoElementTags from '../../../../public/assets/project-templates/ttrpg-demo/element-tags.json';
import demoElements from '../../../../public/assets/project-templates/ttrpg-demo/elements.json';
import demoGenerators from '../../../../public/assets/project-templates/ttrpg-demo/generators.json';
import demoMedia from '../../../../public/assets/project-templates/ttrpg-demo/media.json';
import demoMediaTags from '../../../../public/assets/project-templates/ttrpg-demo/media-tags.json';
import demoProject from '../../../../public/assets/project-templates/ttrpg-demo/project.json';
import demoPlans from '../../../../public/assets/project-templates/ttrpg-demo/publish-plans.json';
import demoRelationshipTypes from '../../../../public/assets/project-templates/ttrpg-demo/relationship-types.json';
import demoRelationships from '../../../../public/assets/project-templates/ttrpg-demo/relationships.json';
import demoSchemas from '../../../../public/assets/project-templates/ttrpg-demo/schemas.json';
import demoSnapshots from '../../../../public/assets/project-templates/ttrpg-demo/snapshots.json';
import demoTags from '../../../../public/assets/project-templates/ttrpg-demo/tags.json';
import demoTimeSystems from '../../../../public/assets/project-templates/ttrpg-demo/time-systems.json';
import demoWorldbuilding from '../../../../public/assets/project-templates/ttrpg-demo/worldbuilding.json';
import starterDocuments from '../../../../public/assets/project-templates/ttrpg-empty/documents.json';
import starterElements from '../../../../public/assets/project-templates/ttrpg-empty/elements.json';
import starterPlans from '../../../../public/assets/project-templates/ttrpg-empty/publish-plans.json';
import starterRelationshipTypes from '../../../../public/assets/project-templates/ttrpg-empty/relationship-types.json';
import starterSchemas from '../../../../public/assets/project-templates/ttrpg-empty/schemas.json';
import { extendedSchema } from '../../components/element-ref/extended-schema';

/**
 * Every media id a template's JSON refers to, in either form: `media://<id>`
 * (worldbuilding images and backgrounds, with or without an extension) or
 * `media:<id>` (prose images).
 */
function referencedMediaIds(...files: unknown[]): string[] {
  const text = JSON.stringify(files);
  return [...text.matchAll(/media:(?:\/\/)?([\w.-]+)/g)].map(match =>
    match[1].replace(/\.[a-z0-9]+$/i, '')
  );
}

const TTRPG_SCHEMAS = [
  'ttrpg-player-character-v1',
  'ttrpg-npc-v1',
  'ttrpg-monster-v1',
  'ttrpg-location-v1',
  'ttrpg-faction-v1',
  'ttrpg-quest-v1',
  'ttrpg-magic-item-v1',
];

describe('Tabletop RPG templates', () => {
  it('are listed together in the index', () => {
    const group = index.groups.find(g => g.id === 'tabletop-rpg');
    expect(group).toBeDefined();
    const templates = index.templates.filter(t => t.group === 'tabletop-rpg');
    expect(templates.map(t => [t.id, t.variant, t.folder])).toEqual([
      ['ttrpg-empty', 'starter', 'ttrpg-empty'],
      ['ttrpg-demo', 'demo', 'ttrpg-demo'],
    ]);
  });

  describe.each([
    ['ttrpg-empty', starterSchemas, starterRelationshipTypes],
    ['ttrpg-demo', demoSchemas, demoRelationshipTypes],
  ])('%s schemas', (_name, schemas, relationshipTypes) => {
    it('has the seven tabletop element types plus the built-in ones', () => {
      const ids = schemas.map(s => s.id);
      for (const id of TTRPG_SCHEMAS) expect(ids).toContain(id);
      expect(ids).toContain('character-v1');
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('only links relationship fields to schemas that exist', () => {
      const ids = new Set(schemas.map(s => s.id));
      for (const type of relationshipTypes) {
        for (const endpoint of [type.sourceEndpoint, type.targetEndpoint]) {
          for (const id of endpoint?.allowedSchemas ?? []) {
            expect(ids, `${type.id} -> ${id}`).toContain(id);
          }
        }
      }
    });
  });

  describe('starter', () => {
    const ids = new Set(starterElements.map(e => e.id));

    it('has unique elements, valid parents and a valid README', () => {
      expect(ids.size).toBe(starterElements.length);
      for (const element of starterElements) {
        if (element.parentId) expect(ids).toContain(element.parentId);
      }
      for (const entry of starterDocuments) {
        expect(ids).toContain(entry.elementId);
        const doc = PMNode.fromJSON(extendedSchema, entry.content);
        expect(() => doc.check()).not.toThrow();
      }
    });

    it('formats the README, whose bold lead-ins are kept on import', () => {
      expect(JSON.stringify(starterDocuments)).toContain('"strong"');
    });

    it('publishes only folders that it contains', () => {
      expect(starterPlans.map(p => p.name)).toEqual([
        "Game Master's Guide",
        "Player's Guide",
        'GM Guide (Web)',
      ]);
      for (const plan of starterPlans) {
        for (const item of plan.items) {
          if (item.type === 'element') expect(ids).toContain(item.elementId);
        }
      }
    });

    it('names no real person as the author', () => {
      for (const plan of starterPlans) {
        expect(plan.metadata.author).toBe('Game Master');
      }
    });
  });

  describe('demo', () => {
    const ids = new Set(demoElements.map(e => e.id));
    const schemaIds = new Set(demoSchemas.map(s => s.id));
    const mediaIds = new Set(demoMedia.map(m => m.mediaId));

    it('has unique elements and valid parents', () => {
      expect(ids.size).toBe(demoElements.length);
      for (const element of demoElements) {
        if (element.parentId) expect(ids).toContain(element.parentId);
      }
    });

    it('gives every worldbuilding element a schema and data', () => {
      const withData = new Set(demoWorldbuilding.map(w => w.elementId));
      for (const element of demoElements.filter(
        e => e.type === 'WORLDBUILDING'
      )) {
        expect(schemaIds).toContain(element.schemaId);
        expect(withData).toContain(element.id);
      }
      for (const entry of demoWorldbuilding) {
        expect(ids).toContain(entry.elementId);
      }
    });

    it('writes documents the editor can load', () => {
      for (const entry of demoDocuments) {
        expect(ids).toContain(entry.elementId);
        const doc = PMNode.fromJSON(extendedSchema, entry.content);
        expect(() => doc.check()).not.toThrow();
      }
    });

    it('keeps images as small media files, never inline', () => {
      for (const entry of demoWorldbuilding) {
        const image = (entry.data as Record<string, unknown>)['image'];
        if (typeof image !== 'string') continue;
        expect(image.startsWith('media://')).toBe(true);
        expect(mediaIds).toContain(image.slice('media://'.length));
      }
      for (const media of demoMedia) {
        expect(media.mimeType).toBe('image/jpeg');
        expect(media.size).toBeLessThan(700_000);
      }
    });

    it('references every image its documents use', () => {
      const text = JSON.stringify(demoDocuments);
      for (const match of text.matchAll(/media:(img-[a-z0-9-]+)/g)) {
        expect(mediaIds).toContain(match[1]);
      }
    });

    it('ships every media file it refers to, anywhere in the template', () => {
      // A missing file makes a Browser profile ask a server for it.
      const referenced = referencedMediaIds(
        demoDocuments,
        demoElements,
        demoWorldbuilding,
        demoSchemas,
        demoProject,
        demoPlans,
        demoGenerators,
        demoSnapshots,
        demoTimeSystems
      );
      expect(referenced.length).toBeGreaterThan(0);
      for (const id of referenced) expect(mediaIds).toContain(id);
    });

    it('has a cover the project can pick up', () => {
      expect(demoProject.hasCover).toBe(true);
      expect(
        demoMedia.filter(m => m.mediaId.startsWith('cover-'))
      ).toHaveLength(1);
    });

    it('tags only elements, tags and media that exist', () => {
      const tagIds = new Set(demoTags.map(t => t.id));
      for (const tag of demoElementTags) {
        expect(ids).toContain(tag.elementId);
        expect(tagIds).toContain(tag.tagId);
      }
      for (const tag of demoMediaTags) {
        expect(ids).toContain(tag.elementId);
        expect(mediaIds).toContain(tag.mediaId);
      }
    });

    it('only uses relationship types and elements that exist', () => {
      const types = new Set(demoRelationshipTypes.map(t => t.id));
      for (const rel of demoRelationships) {
        expect(types).toContain(rel.relationshipTypeId);
        expect(ids).toContain(rel.sourceElementId);
        expect(ids).toContain(rel.targetElementId);
      }
    });

    it('publishes existing elements, under a made-up author', () => {
      expect(demoPlans.length).toBeGreaterThan(0);
      for (const plan of demoPlans) {
        expect(plan.metadata.author).toBe('Corin Vale');
        for (const item of plan.items) {
          if (item.type === 'element') expect(ids).toContain(item.elementId);
        }
      }
    });
  });
});
