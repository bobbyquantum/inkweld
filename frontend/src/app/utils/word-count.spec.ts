import { extendedSchema } from '@components/element-ref/extended-schema';
import { describe, expect, it } from 'vitest';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';

import {
  countDocumentWords,
  countFragmentWords,
  countWords,
} from './word-count';

/** A document exercising block breaks, marks, hard breaks and lists. */
const DOC_JSON = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Saltmere' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The ' },
        { type: 'text', text: 'tide', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' was' },
        { type: 'hard_break' },
        { type: 'text', text: 'out' },
      ],
    },
    {
      type: 'bullet_list',
      content: [
        {
          type: 'list_item',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          ],
        },
        {
          type: 'list_item',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
          ],
        },
      ],
    },
  ],
};

describe('word-count', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  one\ttwo\nthree  ')).toBe(3);
  });

  it('separates words at block boundaries in a ProseMirror document', () => {
    const doc = extendedSchema.nodeFromJSON(DOC_JSON);
    // "Saltmere" | "The tide was" + "out" (no leaf text for the hard break,
    // as in the editor) | "first" | "second"
    expect(countDocumentWords(doc)).toBe(6);
  });

  it('counts a Yjs fragment exactly as the editor counts its document', () => {
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment('prosemirror');
    prosemirrorJSONToYXmlFragment(extendedSchema, DOC_JSON, fragment);

    expect(countFragmentWords(fragment)).toBe(
      countDocumentWords(extendedSchema.nodeFromJSON(DOC_JSON))
    );
  });

  it('does not count mark tags as part of words', () => {
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment('prosemirror');
    const para = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    para.insert(0, [text]);
    fragment.insert(0, [para]);
    text.insert(0, 'plain ');
    text.insert(6, 'linked words', {
      link: { href: 'https://example.com', title: 'a b c' },
    });

    expect(countFragmentWords(fragment)).toBe(3);
  });
});
