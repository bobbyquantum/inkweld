/**
 * Tests for the `@inkweld/prosemirror/schema` module — verifies the
 * exported specs are well-formed and that `createExtendedSchemaSpec`
 * composes them correctly with caller-supplied base nodes/marks.
 *
 * Each spec is also exercised by constructing a real `Schema` from
 * `prosemirror-model` to ensure `parseDOM` / `toDOM` round-trip.
 */
import { describe, expect, it } from 'vitest';
import { Schema, type DOMOutputSpec, type Mark, type MarkSpec, type Node, type NodeSpec } from 'prosemirror-model';

import {
  COMMENT_MARK_NAME,
  ELEMENT_REF_NODE_NAME,
  commentMarkSpec,
  createExtendedSchemaSpec,
  elementRefNodeSpec,
  elementRefSchemaExtension,
  secureLinkMarkSpec,
} from '../src/schema';

// Minimal base spec set sufficient to construct a Schema for tests.
// The frontend supplies ngx-editor's set; we use a hand-rolled minimum here
// so the package test stays free of editor library deps.
const baseNodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
  text: { group: 'inline' },
};
const baseMarks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: {}, title: { default: null } },
    parseDOM: [{ tag: 'a[href]' }],
    toDOM: () => ['a', 0],
  },
};

// ---------------------------------------------------------------------------
// elementRefNodeSpec
// ---------------------------------------------------------------------------

describe('elementRefNodeSpec', () => {
  it('exposes ELEMENT_REF_NODE_NAME = "elementRef"', () => {
    expect(ELEMENT_REF_NODE_NAME).toBe('elementRef');
  });

  it('is an inline atomic node', () => {
    expect(elementRefNodeSpec.inline).toBe(true);
    expect(elementRefNodeSpec.atom).toBe(true);
    expect(elementRefNodeSpec.group).toBe('inline');
  });

  it('declares the documented attribute defaults', () => {
    const attrs = elementRefNodeSpec.attrs ?? {};
    expect(attrs['elementId']?.default).toBeNull();
    expect(attrs['elementType']?.default).toBeNull();
    expect(attrs['displayText']?.default).toBe('');
    expect(attrs['originalName']?.default).toBe('');
    expect(attrs['relationshipId']?.default).toBeNull();
    expect(attrs['relationshipTypeId']?.default).toBe('referenced-in');
    expect(attrs['relationshipNote']?.default).toBeNull();
  });

  it('toDOM emits expected dataset / class / aria attributes', () => {
    const schema = new Schema({
      nodes: { ...baseNodes, [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec },
      marks: baseMarks,
    });
    const node = schema.nodes['elementRef'].create({
      elementId: 'el-1',
      elementType: 'item',
      displayText: 'My Item',
      originalName: 'My Item',
      relationshipId: 'rel-7',
      relationshipTypeId: 'referenced-in',
      relationshipNote: 'see chapter 3',
    });
    const out = elementRefNodeSpec.toDOM!(node) as DOMOutputSpec;
    // ['span', attrs, text]
    expect(Array.isArray(out)).toBe(true);
    const [tag, attrs, text] = out as [string, Record<string, string>, string];
    expect(tag).toBe('span');
    expect(attrs['data-element-ref']).toBe('true');
    expect(attrs['data-element-id']).toBe('el-1');
    expect(attrs['data-element-type']).toBe('item');
    expect(attrs['data-original-name']).toBe('My Item');
    expect(attrs['data-relationship-type']).toBe('referenced-in');
    expect(attrs['data-relationship-id']).toBe('rel-7');
    expect(attrs['data-relationship-note']).toBe('see chapter 3');
    expect(attrs['contenteditable']).toBe('false');
    expect(attrs['role']).toBe('link');
    expect(attrs['class']).toContain('element-ref');
    expect(attrs['class']).toContain('element-ref--item');
    expect(attrs['class']).toContain('element-ref--has-note');
    expect(attrs['aria-label']).toContain('My Item');
    expect(attrs['aria-label']).toContain('(item)');
    expect(attrs['aria-label']).toContain('see chapter 3');
    expect(text).toBe('My Item');
  });

  it('toDOM marks deleted refs (null elementId) and falls back to "???"', () => {
    const schema = new Schema({
      nodes: { ...baseNodes, [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec },
      marks: baseMarks,
    });
    const node = schema.nodes['elementRef'].create({
      elementId: null,
      elementType: null,
      displayText: '',
      originalName: '',
    });
    const [, attrs, text] = elementRefNodeSpec.toDOM!(node) as [
      string,
      Record<string, string>,
      string
    ];
    expect(attrs['class']).toContain('element-ref--deleted');
    expect(attrs['class']).toContain('element-ref--unknown');
    expect(attrs['aria-label']).toBe('Element reference');
    expect(text).toBe('???');
  });

  it('omits relationship-id / relationship-note attributes when absent', () => {
    const schema = new Schema({
      nodes: { ...baseNodes, [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec },
      marks: baseMarks,
    });
    const node = schema.nodes['elementRef'].create({
      elementId: 'e1',
      displayText: 'X',
    });
    const [, attrs] = elementRefNodeSpec.toDOM!(node) as [
      string,
      Record<string, string>,
      string
    ];
    expect(attrs['data-relationship-id']).toBeUndefined();
    expect(attrs['data-relationship-note']).toBeUndefined();
  });

  it('exposes elementRefSchemaExtension keyed by ELEMENT_REF_NODE_NAME', () => {
    expect(elementRefSchemaExtension.nodes[ELEMENT_REF_NODE_NAME]).toBe(
      elementRefNodeSpec
    );
  });
});

// ---------------------------------------------------------------------------
// commentMarkSpec
// ---------------------------------------------------------------------------

describe('commentMarkSpec', () => {
  it('exposes COMMENT_MARK_NAME = "comment"', () => {
    expect(COMMENT_MARK_NAME).toBe('comment');
  });

  it('is non-excluding and spanning so multiple instances can overlap', () => {
    expect(commentMarkSpec.excludes).toBe('');
    expect(commentMarkSpec.spanning).toBe(true);
  });

  it('declares the documented attribute defaults', () => {
    const attrs = commentMarkSpec.attrs ?? {};
    expect(attrs['commentId']?.default).toBeNull();
    expect(attrs['authorName']?.default).toBe('');
    expect(attrs['preview']?.default).toBe('');
    expect(attrs['messageCount']?.default).toBe(1);
    expect(attrs['resolved']?.default).toBe(false);
    expect(attrs['createdAt']?.default).toBe(0);
    expect(attrs['localOnly']?.default).toBe(false);
    expect(attrs['messages']?.default).toBeNull();
  });

  it('toDOM emits all required data-* attributes for an unresolved comment', () => {
    const schema = new Schema({
      nodes: baseNodes,
      marks: { ...baseMarks, [COMMENT_MARK_NAME]: commentMarkSpec },
    });
    const mark: Mark = schema.marks['comment'].create({
      commentId: 'c1',
      authorName: 'Alice',
      preview: 'looks good',
      messageCount: 3,
      resolved: false,
      createdAt: 1700000000,
      localOnly: false,
      messages: null,
    });
    const out = commentMarkSpec.toDOM!(mark, true) as DOMOutputSpec;
    const [tag, attrs] = out as [string, Record<string, string>, number];
    expect(tag).toBe('span');
    expect(attrs['data-comment-id']).toBe('c1');
    expect(attrs['data-comment-author']).toBe('Alice');
    expect(attrs['data-comment-preview']).toBe('looks good');
    expect(attrs['data-comment-count']).toBe('3');
    expect(attrs['data-comment-created-at']).toBe('1700000000');
    expect(attrs['class']).toBe('comment-highlight');
    expect(attrs['data-comment-resolved']).toBeUndefined();
    expect(attrs['data-comment-local-only']).toBeUndefined();
    expect(attrs['data-comment-messages']).toBeUndefined();
  });

  it('toDOM marks resolved + local-only comments and serialises messages', () => {
    const schema = new Schema({
      nodes: baseNodes,
      marks: { ...baseMarks, [COMMENT_MARK_NAME]: commentMarkSpec },
    });
    const mark = schema.marks['comment'].create({
      commentId: 'c2',
      authorName: 'Bob',
      preview: 'fix this',
      messageCount: 1,
      resolved: true,
      createdAt: 1,
      localOnly: true,
      messages: '[{"text":"hi"}]',
    });
    const [, attrs] = commentMarkSpec.toDOM!(mark, true) as [
      string,
      Record<string, string>,
      number
    ];
    expect(attrs['class']).toContain('comment-highlight--resolved');
    expect(attrs['data-comment-resolved']).toBe('true');
    expect(attrs['data-comment-local-only']).toBe('true');
    expect(attrs['data-comment-messages']).toBe('[{"text":"hi"}]');
  });
});

// ---------------------------------------------------------------------------
// secureLinkMarkSpec
// ---------------------------------------------------------------------------

describe('secureLinkMarkSpec', () => {
  it('declares the documented attributes (with rel + target)', () => {
    const attrs = secureLinkMarkSpec.attrs ?? {};
    expect(attrs['href']).toBeDefined();
    expect(attrs['title']?.default).toBeNull();
    expect(attrs['target']?.default).toBeNull();
    expect(attrs['rel']?.default).toBeNull();
    expect(secureLinkMarkSpec.inclusive).toBe(false);
  });

  it('passes existing attributes through when target is not _blank', () => {
    const schema = new Schema({
      nodes: baseNodes,
      marks: { link: secureLinkMarkSpec },
    });
    const mark = schema.marks['link'].create({
      href: 'https://example.com',
      title: 'Example',
      target: '_self',
      rel: 'nofollow',
    });
    const [, attrs] = secureLinkMarkSpec.toDOM!(mark, true) as [
      string,
      Record<string, string | null>,
      number
    ];
    expect(attrs['href']).toBe('https://example.com');
    expect(attrs['target']).toBe('_self');
    expect(attrs['rel']).toBe('nofollow');
  });

  it('auto-adds noopener noreferrer when target="_blank"', () => {
    const schema = new Schema({
      nodes: baseNodes,
      marks: { link: secureLinkMarkSpec },
    });
    const mark = schema.marks['link'].create({
      href: 'https://example.com',
      target: '_blank',
      rel: null,
    });
    const [, attrs] = secureLinkMarkSpec.toDOM!(mark, true) as [
      string,
      Record<string, string | null>,
      number
    ];
    expect(attrs['rel']).toContain('noopener');
    expect(attrs['rel']).toContain('noreferrer');
  });

  it('preserves existing rel values and de-duplicates safe tokens', () => {
    const schema = new Schema({
      nodes: baseNodes,
      marks: { link: secureLinkMarkSpec },
    });
    const mark = schema.marks['link'].create({
      href: 'https://x.com',
      target: '_blank',
      rel: 'nofollow noopener',
    });
    const [, attrs] = secureLinkMarkSpec.toDOM!(mark, true) as [
      string,
      Record<string, string | null>,
      number
    ];
    const rel = (attrs['rel'] ?? '').split(/\s+/);
    expect(rel).toContain('nofollow');
    expect(rel.filter((t) => t === 'noopener')).toHaveLength(1);
    expect(rel).toContain('noreferrer');
  });

  it('hardens rel even when target casing/whitespace varies', () => {
    const schema = new Schema({
      nodes: baseNodes,
      marks: { link: secureLinkMarkSpec },
    });
    const mark = schema.marks['link'].create({
      href: 'https://x.com',
      target: '  _BLANK  ',
      rel: null,
    });
    const [, attrs] = secureLinkMarkSpec.toDOM!(mark, true) as [
      string,
      Record<string, string | null>,
      number
    ];
    expect(attrs['rel']).toContain('noopener');
    expect(attrs['rel']).toContain('noreferrer');
  });
});

// ---------------------------------------------------------------------------
// createExtendedSchemaSpec
// ---------------------------------------------------------------------------

describe('createExtendedSchemaSpec', () => {
  it('returns a plain {nodes, marks} object', () => {
    const out = createExtendedSchemaSpec({ baseNodes, baseMarks });
    expect(typeof out).toBe('object');
    expect(out.nodes).toBeDefined();
    expect(out.marks).toBeDefined();
  });

  it('preserves all base node specs', () => {
    const out = createExtendedSchemaSpec({ baseNodes, baseMarks });
    for (const key of Object.keys(baseNodes)) {
      expect(out.nodes[key]).toBe(baseNodes[key]);
    }
  });

  it('adds the elementRef node spec', () => {
    const out = createExtendedSchemaSpec({ baseNodes, baseMarks });
    expect(out.nodes[ELEMENT_REF_NODE_NAME]).toBe(elementRefNodeSpec);
  });

  it('replaces the base link mark with the secure variant', () => {
    const out = createExtendedSchemaSpec({ baseNodes, baseMarks });
    expect(out.marks['link']).toBe(secureLinkMarkSpec);
    expect(out.marks['link']).not.toBe(baseMarks['link']);
  });

  it('adds the comment mark', () => {
    const out = createExtendedSchemaSpec({ baseNodes, baseMarks });
    expect(out.marks[COMMENT_MARK_NAME]).toBe(commentMarkSpec);
  });

  it('produces a spec object that successfully constructs a real Schema', () => {
    const out = createExtendedSchemaSpec({ baseNodes, baseMarks });
    const schema = new Schema(out);
    expect(schema.nodes['elementRef']).toBeDefined();
    expect(schema.marks['comment']).toBeDefined();
    expect(schema.marks['link']).toBeDefined();
  });
});

// Suppress unused-import lint by referencing Node so editors don't strip it.
void (null as unknown as Node);
