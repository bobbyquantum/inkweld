import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import {
  createExtendedSchema,
  extendedSchema,
  ngxEditorSchema,
} from './extended-schema';

describe('extended-schema', () => {
  describe('createExtendedSchema', () => {
    it('should create a valid ProseMirror Schema', () => {
      const schema = createExtendedSchema();
      expect(schema).toBeInstanceOf(Schema);
    });

    it('should include the elementRef node type', () => {
      const schema = createExtendedSchema();
      expect(schema.nodes['elementRef']).toBeDefined();
    });

    it('should include standard nodes from ngx-editor', () => {
      const schema = createExtendedSchema();
      expect(schema.nodes['doc']).toBeDefined();
      expect(schema.nodes['paragraph']).toBeDefined();
      expect(schema.nodes['text']).toBeDefined();
    });

    it('should include standard marks from ngx-editor', () => {
      const schema = createExtendedSchema();
      expect(schema.marks['strong']).toBeDefined();
      expect(schema.marks['em']).toBeDefined();
      expect(schema.marks['link']).toBeDefined();
    });
  });

  describe('link mark spec', () => {
    const schema = createExtendedSchema();
    const linkMarkType = schema.marks['link'];

    it('should declare href, title, target and rel attrs', () => {
      expect(linkMarkType.spec.attrs).toHaveProperty('href');
      expect(linkMarkType.spec.attrs).toHaveProperty('title');
      expect(linkMarkType.spec.attrs).toHaveProperty('target');
      expect(linkMarkType.spec.attrs).toHaveProperty('rel');
    });

    describe('toDOM', () => {
      it('should render href, target and rel attributes', () => {
        const mark = linkMarkType.create({
          href: 'https://example.com',
          target: '_blank',
          rel: 'noopener noreferrer',
          title: null,
        });
        const dom = linkMarkType.spec.toDOM!(mark, false) as [
          string,
          Record<string, unknown>,
          number,
        ];
        expect(dom[0]).toBe('a');
        expect(dom[1]['href']).toBe('https://example.com');
        expect(dom[1]['target']).toBe('_blank');
        expect(dom[1]['rel']).toBe('noopener noreferrer');
      });

      it('should render null target and rel when not set', () => {
        const mark = linkMarkType.create({
          href: 'https://example.com',
          target: null,
          rel: null,
          title: null,
        });
        const dom = linkMarkType.spec.toDOM!(mark, false) as [
          string,
          Record<string, unknown>,
          number,
        ];
        expect(dom[1]['target']).toBeNull();
        expect(dom[1]['rel']).toBeNull();
      });

      it('should enforce noopener noreferrer for target="_blank" even when rel is absent', () => {
        const mark = linkMarkType.create({
          href: 'https://example.com',
          target: '_blank',
          rel: null,
          title: null,
        });
        const dom = linkMarkType.spec.toDOM!(mark, false) as [
          string,
          Record<string, unknown>,
          number,
        ];
        expect(dom[1]['rel']).toContain('noopener');
        expect(dom[1]['rel']).toContain('noreferrer');
      });

      it('should merge noopener noreferrer with an existing partial rel on target="_blank"', () => {
        const mark = linkMarkType.create({
          href: 'https://example.com',
          target: '_blank',
          rel: 'nofollow',
          title: null,
        });
        const dom = linkMarkType.spec.toDOM!(mark, false) as [
          string,
          Record<string, unknown>,
          number,
        ];
        const rel = dom[1]['rel'] as string;
        expect(rel).toContain('nofollow');
        expect(rel).toContain('noopener');
        expect(rel).toContain('noreferrer');
      });

      it('should not duplicate noopener noreferrer when already present', () => {
        const mark = linkMarkType.create({
          href: 'https://example.com',
          target: '_blank',
          rel: 'noopener noreferrer',
          title: null,
        });
        const dom = linkMarkType.spec.toDOM!(mark, false) as [
          string,
          Record<string, unknown>,
          number,
        ];
        const rel = dom[1]['rel'] as string;
        expect(rel.split(' ').filter(t => t === 'noopener').length).toBe(1);
        expect(rel.split(' ').filter(t => t === 'noreferrer').length).toBe(1);
      });
    });

    describe('parseDOM / getAttrs', () => {
      it('should parse href, target and rel from an anchor element', () => {
        const el = document.createElement('a');
        el.setAttribute('href', 'https://example.com');
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('title', 'Example');

        const parseDOMRule = linkMarkType.spec.parseDOM![0] as {
          getAttrs: (el: HTMLElement) => Record<string, string | null>;
        };
        const attrs = parseDOMRule.getAttrs(el);
        expect(attrs['href']).toBe('https://example.com');
        expect(attrs['target']).toBe('_blank');
        expect(attrs['rel']).toBe('noopener noreferrer');
        expect(attrs['title']).toBe('Example');
      });

      it('should return null for absent optional attributes', () => {
        const el = document.createElement('a');
        el.setAttribute('href', 'https://example.com');

        const parseDOMRule = linkMarkType.spec.parseDOM![0] as {
          getAttrs: (el: HTMLElement) => Record<string, string | null>;
        };
        const attrs = parseDOMRule.getAttrs(el);
        expect(attrs['target']).toBeNull();
        expect(attrs['rel']).toBeNull();
        expect(attrs['title']).toBeNull();
      });
    });
  });

  describe('extendedSchema', () => {
    it('should be a pre-created Schema instance', () => {
      expect(extendedSchema).toBeInstanceOf(Schema);
    });

    it('should have elementRef node available', () => {
      expect(extendedSchema.nodes['elementRef']).toBeDefined();
    });
  });

  describe('ngxEditorSchema re-export', () => {
    it('should re-export the original ngx-editor schema', () => {
      expect(ngxEditorSchema).toBeDefined();
      expect(ngxEditorSchema).toBeInstanceOf(Schema);
    });

    it('should not include elementRef in the original schema', () => {
      // The original schema should NOT have our custom elementRef node
      expect(ngxEditorSchema.nodes['elementRef']).toBeUndefined();
    });
  });
});
