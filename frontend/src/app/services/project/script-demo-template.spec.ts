/**
 * Integrity checks for the "Script (Demo)" project template, which is
 * hand-written JSON: every link must point at something that exists, and
 * every document must be valid for the editor schema.
 */
import { Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import index from '../../../../public/assets/project-templates/index.json';
import documents from '../../../../public/assets/project-templates/script-demo/documents.json';
import elementTags from '../../../../public/assets/project-templates/script-demo/element-tags.json';
import elements from '../../../../public/assets/project-templates/script-demo/elements.json';
import publishPlans from '../../../../public/assets/project-templates/script-demo/publish-plans.json';
import relationshipTypes from '../../../../public/assets/project-templates/script-demo/relationship-types.json';
import relationships from '../../../../public/assets/project-templates/script-demo/relationships.json';
import schemas from '../../../../public/assets/project-templates/script-demo/schemas.json';
import tags from '../../../../public/assets/project-templates/script-demo/tags.json';
import worldbuilding from '../../../../public/assets/project-templates/script-demo/worldbuilding.json';
import { extendedSchema } from '../../components/element-ref/extended-schema';
import {
  getDocumentFormat,
  getDocumentRole,
} from '../../models/scene-metadata';

const ids = new Set(elements.map(e => e.id));
/** JSON imports type absent keys as `undefined`; metadata is a string map. */
const metadataOf = (e: (typeof elements)[number]) =>
  e.metadata as Record<string, string>;
const schemaIds = new Set(schemas.map(s => s.id));

describe('script-demo template', () => {
  it('is listed in the template index', () => {
    expect(index.templates.map(t => t.folder)).toContain('script-demo');
  });

  it('has unique element ids and valid parents', () => {
    expect(ids.size).toBe(elements.length);
    for (const element of elements) {
      if (element.parentId) expect(ids).toContain(element.parentId);
    }
  });

  it('gives every worldbuilding element a schema and data', () => {
    const withData = new Set(worldbuilding.map(w => w.elementId));
    for (const element of elements.filter(e => e.type === 'WORLDBUILDING')) {
      expect(schemaIds).toContain(element.schemaId);
      expect(withData).toContain(element.id);
    }
    for (const entry of worldbuilding) {
      expect(ids).toContain(entry.elementId);
      const schema = schemas.find(s => s.id === entry.schemaId)!;
      const keys = new Set(
        schema.tabs.flatMap(tab => tab.fields.map(f => f.key))
      );
      for (const key of Object.keys(entry.data)) {
        if (key === 'description' || key === 'image') continue;
        expect(keys, `${entry.elementId}.${key}`).toContain(key);
      }
    }
  });

  it('writes every scene as a conversation the editor can load', () => {
    const scenes = elements.filter(
      e => getDocumentRole(metadataOf(e)) === 'scene'
    );
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(getDocumentFormat(metadataOf(scene))).toBe('conversation');
    }
    for (const entry of documents) {
      expect(ids).toContain(entry.elementId);
      const doc = PMNode.fromJSON(extendedSchema, entry.content);
      expect(() => doc.check()).not.toThrow();
    }
  });

  it('links every speaker to a cast member', () => {
    const cast = new Set(
      elements.filter(e => e.schemaId === 'cast-member-v1').map(e => e.id)
    );
    let speeches = 0;
    for (const entry of documents) {
      PMNode.fromJSON(extendedSchema, entry.content).descendants(node => {
        if (node.type.name !== 'speech') return true;
        speeches++;
        expect(cast).toContain(node.attrs['speakerId']);
        return false;
      });
    }
    expect(speeches).toBeGreaterThan(0);
  });

  it('only uses relationship types and elements that exist', () => {
    const types = new Set(relationshipTypes.map(t => t.id));
    for (const rel of relationships) {
      expect(types).toContain(rel.relationshipTypeId);
      expect(ids).toContain(rel.sourceElementId);
      expect(ids).toContain(rel.targetElementId);
    }
    expect(types).toContain('scene-pov');
    expect(types).toContain('scene-location');
  });

  it('tags existing elements with existing tags', () => {
    const tagIds = new Set(tags.map(t => t.id));
    for (const tag of elementTags) {
      expect(ids).toContain(tag.elementId);
      expect(tagIds).toContain(tag.tagId);
    }
  });

  it('publishes existing scenes and cast to PDF with full styles', () => {
    const [plan] = publishPlans;
    expect(plan.format).toBe('PDF_SIMPLE');
    expect(plan.styles?.page).toBeDefined();
    for (const item of plan.items) {
      if (item.type === 'element') expect(ids).toContain(item.elementId);
      if (item.type === 'worldbuilding') {
        for (const category of item.categories ?? []) {
          expect(schemaIds).toContain(category);
        }
      }
    }
  });
});
