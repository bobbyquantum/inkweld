import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { type CommentMarkAttrs, commentMarkSpec } from './comment-mark-schema';

function createSchema() {
  return new Schema({
    nodes: {
      doc: { content: 'text*' },
      text: { inline: true },
    },
    marks: {
      comment: commentMarkSpec,
    },
  });
}

describe('commentMarkSpec', () => {
  it('should define default attribute values', () => {
    const schema = createSchema();
    const mark = schema.marks['comment'].create();
    expect(mark.attrs['commentId']).toBeNull();
    expect(mark.attrs['authorName']).toBe('');
    expect(mark.attrs['preview']).toBe('');
    expect(mark.attrs['messageCount']).toBe(1);
    expect(mark.attrs['resolved']).toBe(false);
    expect(mark.attrs['createdAt']).toBe(0);
    expect(mark.attrs['localOnly']).toBe(false);
    expect(mark.attrs['messages']).toBeNull();
  });

  it('should create a mark with custom attributes', () => {
    const schema = createSchema();
    const attrs: CommentMarkAttrs = {
      commentId: 'abc-123',
      authorName: 'Alice',
      preview: 'Hello world',
      messageCount: 3,
      resolved: true,
      createdAt: 1000,
      localOnly: true,
      messages: '[{"id":"1"}]',
    };
    const mark = schema.marks['comment'].create(attrs);
    expect(mark.attrs['commentId']).toBe('abc-123');
    expect(mark.attrs['authorName']).toBe('Alice');
    expect(mark.attrs['resolved']).toBe(true);
    expect(mark.attrs['localOnly']).toBe(true);
    expect(mark.attrs['messages']).toBe('[{"id":"1"}]');
  });

  describe('toDOM', () => {
    it('should produce a span with comment-highlight class', () => {
      const schema = createSchema();
      const mark = schema.marks['comment'].create({
        commentId: 'test-id',
        authorName: 'Bob',
        preview: 'Preview text',
      });
      const domSpec = mark.type.spec.toDOM!(mark, true) as [
        string,
        Record<string, string>,
        ...unknown[],
      ];
      expect(domSpec[0]).toBe('span');
      const domAttrs = domSpec[1];
      expect(domAttrs['class']).toBe('comment-highlight');
      expect(domAttrs['data-comment-id']).toBe('test-id');
      expect(domAttrs['data-comment-author']).toBe('Bob');
      expect(domAttrs['data-comment-preview']).toBe('Preview text');
    });

    it('should add resolved class when resolved is true', () => {
      const schema = createSchema();
      const mark = schema.marks['comment'].create({
        commentId: 'test-id',
        resolved: true,
      });
      const domSpec = mark.type.spec.toDOM!(mark, true) as [
        string,
        Record<string, string>,
        ...unknown[],
      ];
      const domAttrs = domSpec[1];
      expect(domAttrs['class']).toContain('comment-highlight--resolved');
      expect(domAttrs['data-comment-resolved']).toBe('true');
    });

    it('should not include data-comment-resolved when not resolved', () => {
      const schema = createSchema();
      const mark = schema.marks['comment'].create({
        commentId: 'test-id',
        resolved: false,
      });
      const domSpec = mark.type.spec.toDOM!(mark, true) as [
        string,
        Record<string, string>,
        ...unknown[],
      ];
      const domAttrs = domSpec[1];
      expect(domAttrs['data-comment-resolved']).toBeUndefined();
    });

    it('should include data-comment-local-only when localOnly is true', () => {
      const schema = createSchema();
      const mark = schema.marks['comment'].create({
        commentId: 'test-id',
        localOnly: true,
      });
      const domSpec = mark.type.spec.toDOM!(mark, true) as [
        string,
        Record<string, string>,
        ...unknown[],
      ];
      const domAttrs = domSpec[1];
      expect(domAttrs['data-comment-local-only']).toBe('true');
    });

    it('should include data-comment-messages when messages is set', () => {
      const schema = createSchema();
      const msgs = JSON.stringify([{ id: '1', text: 'hi' }]);
      const mark = schema.marks['comment'].create({
        commentId: 'test-id',
        messages: msgs,
      });
      const domSpec = mark.type.spec.toDOM!(mark, true) as [
        string,
        Record<string, string>,
        ...unknown[],
      ];
      const domAttrs = domSpec[1];
      expect(domAttrs['data-comment-messages']).toBe(msgs);
    });

    it('should have hole (0) for inline content', () => {
      const schema = createSchema();
      const mark = schema.marks['comment'].create({ commentId: 'x' });
      const domSpec = mark.type.spec.toDOM!(mark, true) as [
        string,
        Record<string, string>,
        ...unknown[],
      ];
      expect(domSpec[2]).toBe(0);
    });
  });

  describe('parseDOM', () => {
    it('should parse attributes from a span element', () => {
      const el = document.createElement('span');
      el.dataset['commentId'] = 'parsed-id';
      el.dataset['commentAuthor'] = 'Author';
      el.dataset['commentPreview'] = 'Some preview';
      el.dataset['commentCount'] = '5';
      el.dataset['commentResolved'] = 'true';
      el.dataset['commentCreatedAt'] = '12345';
      el.dataset['commentLocalOnly'] = 'true';
      el.dataset['commentMessages'] = '[]';

      const getAttrs = commentMarkSpec.parseDOM![0].getAttrs as (
        dom: HTMLElement
      ) => CommentMarkAttrs;
      const attrs = getAttrs(el);

      expect(attrs.commentId).toBe('parsed-id');
      expect(attrs.authorName).toBe('Author');
      expect(attrs.preview).toBe('Some preview');
      expect(attrs.messageCount).toBe(5);
      expect(attrs.resolved).toBe(true);
      expect(attrs.createdAt).toBe(12345);
      expect(attrs.localOnly).toBe(true);
      expect(attrs.messages).toBe('[]');
    });

    it('should handle missing dataset attributes gracefully', () => {
      const el = document.createElement('span');
      el.dataset['commentId'] = '';

      const getAttrs = commentMarkSpec.parseDOM![0].getAttrs as (
        dom: HTMLElement
      ) => CommentMarkAttrs;
      const attrs = getAttrs(el);

      expect(attrs.commentId).toBe('');
      expect(attrs.authorName).toBe('');
      expect(attrs.preview).toBe('');
      expect(attrs.messageCount).toBe(1);
      expect(attrs.resolved).toBe(false);
      expect(attrs.createdAt).toBe(0);
      expect(attrs.localOnly).toBe(false);
      expect(attrs.messages).toBeNull();
    });
  });

  it('should allow multiple comment marks on the same text (excludes="")', () => {
    expect(commentMarkSpec.excludes).toBe('');
  });
});
