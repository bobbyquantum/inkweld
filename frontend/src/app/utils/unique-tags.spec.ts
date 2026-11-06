import type { ElementTag, TagDefinition } from '@models/tag.model';
import { describe, expect, it } from 'vitest';

import { uniqueElementTags, uniqueTagDefinitions } from './unique-tags';

describe('unique-tags', () => {
  it('keeps the first definition for each tag id', () => {
    const first: TagDefinition = {
      id: 't1',
      name: 'Hero',
      icon: 'star',
      color: '#DC143C',
    };
    const second: TagDefinition = { ...first, name: 'Lead' };
    const other: TagDefinition = { ...first, id: 't2', name: 'Draft' };
    expect(uniqueTagDefinitions([first, second, other])).toEqual([
      first,
      other,
    ]);
  });

  it('keeps one assignment per element and tag', () => {
    const a: ElementTag = {
      id: 'a1',
      elementId: 'e1',
      tagId: 't1',
      createdAt: 'x',
    };
    const twin: ElementTag = { ...a, id: 'a2' };
    const otherTag: ElementTag = { ...a, id: 'a3', tagId: 't2' };
    const otherElement: ElementTag = { ...a, id: 'a4', elementId: 'e2' };
    expect(uniqueElementTags([a, twin, otherTag, otherElement])).toEqual([
      a,
      otherTag,
      otherElement,
    ]);
  });
});
