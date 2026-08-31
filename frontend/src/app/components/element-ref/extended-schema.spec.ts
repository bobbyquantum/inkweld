import { DOMParser, DOMSerializer, Schema } from 'prosemirror-model';
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

  describe('table nodes', () => {
    const schema = createExtendedSchema();

    it('should include the prosemirror-tables node types', () => {
      expect(schema.nodes['table']).toBeDefined();
      expect(schema.nodes['table_row']).toBeDefined();
      expect(schema.nodes['table_cell']).toBeDefined();
      expect(schema.nodes['table_header']).toBeDefined();
    });

    it('should restrict cell content to paragraphs', () => {
      // `block+` would allow nested tables, headings and lists, none of which
      // the publish pipeline can render sensibly.
      expect(schema.nodes['table_cell'].spec.content).toBe('paragraph+');
      expect(schema.nodes['table_header'].spec.content).toBe('paragraph+');
    });

    it('should put tables in the block group so they nest under doc', () => {
      expect(schema.nodes['table'].spec.group).toContain('block');
    });

    it('should declare the align attribute on cells, defaulting to null', () => {
      for (const name of ['table_cell', 'table_header']) {
        const attrs = schema.nodes[name].spec.attrs!;
        expect(attrs['align']).toBeDefined();
        expect(attrs['align'].default).toBeNull();
      }
    });

    describe('align attribute', () => {
      // prosemirror-tables folds `cellAttributes` into the generated
      // parseDOM/toDOM rather than exposing the callbacks on the attr spec,
      // so alignment is verified through an actual DOM round trip.
      const parser = DOMParser.fromSchema(schema);
      const serializer = DOMSerializer.fromSchema(schema);

      /** Parse a <table> fragment and return the first cell's attrs. */
      function parseCellAttrs(cellHtml: string): Record<string, unknown> {
        const host = document.createElement('div');
        host.innerHTML = `<table><tbody><tr>${cellHtml}</tr></tbody></table>`;
        const doc = parser.parse(host);

        let attrs: Record<string, unknown> | null = null;
        doc.descendants(node => {
          if (attrs) return false;
          if (
            node.type.name === 'table_cell' ||
            node.type.name === 'table_header'
          ) {
            attrs = node.attrs;
            return false;
          }
          return true;
        });
        expect(attrs).not.toBeNull();
        return attrs!;
      }

      /** Serialize a cell with the given align attr and return its outerHTML. */
      function serializeCell(align: unknown): string {
        const cell = schema.nodes['table_cell'].create(
          { align },
          schema.nodes['paragraph'].create()
        );
        const dom = serializer.serializeNode(cell) as HTMLElement;
        return dom.outerHTML;
      }

      it('should read alignment from an inline text-align style', () => {
        expect(
          parseCellAttrs('<td style="text-align: center">x</td>')['align']
        ).toBe('center');
      });

      it('should fall back to the legacy align attribute', () => {
        expect(parseCellAttrs('<td align="right">x</td>')['align']).toBe(
          'right'
        );
      });

      it('should leave align null when the cell has no alignment', () => {
        expect(parseCellAttrs('<td>x</td>')['align']).toBeNull();
      });

      it('should write a text-align style for known values', () => {
        expect(serializeCell('center')).toContain('text-align: center');
      });

      it.each([[null], ['justify'], ['center; color: red']])(
        'should not emit a style for the unsupported align value %p',
        value => {
          expect(serializeCell(value)).not.toContain('text-align');
        }
      );

      it('should not let an align value inject extra declarations', () => {
        expect(serializeCell('center; color: red')).not.toContain('color: red');
      });
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
        expect(rel.split(' ').filter(t => t === 'noopener')).toHaveLength(1);
        expect(rel.split(' ').filter(t => t === 'noreferrer')).toHaveLength(1);
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
