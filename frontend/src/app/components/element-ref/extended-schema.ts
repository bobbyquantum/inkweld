/**
 * Extended ProseMirror Schema for Inkweld — frontend factory.
 *
 * Composes ngx-editor's base schema with the Inkweld-specific extensions
 * (`elementRef`, `comment`, secure `link`) defined in the shared package
 * `@inkweld/prosemirror/schema`. Keeping the ngx-editor coupling here
 * means the shared package stays editor-library-free.
 *
 * IMPORTANT — `new Schema(...)` is constructed HERE, not in the shared
 * package. The shared package returns specs only; the frontend uses its
 * own copy of `prosemirror-model` to build the Schema. This guarantees
 * a single Schema/Node/Mark constructor across the bundle. Constructing
 * the Schema inside the shared package would cause the bundler to pull
 * in a SECOND copy of `prosemirror-model`, breaking class-identity
 * checks in y-prosemirror, ngx-editor, and `EditorView` — typing into
 * the editor would silently produce no output. See PR #1068.
 */
import { marks, nodes } from '@bobbyquantum/ngx-editor/schema';
import { createExtendedSchemaSpec } from '@inkweld/prosemirror/schema';
import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

/**
 * Table node specs from `prosemirror-tables`.
 *
 * `cellContent` is deliberately `'paragraph+'` rather than the library's
 * suggested `'block+'`. Allowing arbitrary blocks in a cell permits nested
 * tables, headings and lists, none of which the publish pipeline
 * (markdown / HTML / EPUB / Typst-PDF) can render sensibly. Restricting
 * cells to paragraphs keeps every export path total.
 *
 * `colwidth` is stored as an array (e.g. `[120, 240]`) and survives the
 * canonical XML wire format because `parseAttrValue` JSON-parses any
 * attribute whose serialized form starts with `[`.
 *
 * The extra `align` cell attribute carries GFM column alignment
 * (`| :--- | :---: | ---: |`). It lives on the cell rather than on the
 * paragraph inside it because alignment in a markdown table is a property
 * of the column, and because the publish pipeline does not currently read
 * ngx-editor's paragraph-level `align` attribute at all — riding on it
 * would silently drop alignment from every export.
 */
const inkweldTableNodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'paragraph+',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM(dom: HTMLElement) {
        return dom.style.textAlign || dom.getAttribute('align') || null;
      },
      setDOMAttr(value: unknown, attrs: Record<string, unknown>) {
        if (value === 'left' || value === 'center' || value === 'right') {
          attrs['style'] =
            `${(attrs['style'] as string) ?? ''}text-align: ${value};`;
        }
      },
    },
  },
});

/**
 * Build the Inkweld editor schema by merging ngx-editor's base specs with
 * the shared Inkweld extensions, then constructing a `Schema` with the
 * frontend's own copy of `prosemirror-model`.
 *
 * Table nodes are merged into the base set here rather than inside the
 * shared package: `tableNodes()` is a frontend-only concern (the backend
 * XML parser/serializer works off node *names*, not a `Schema`), and
 * keeping the call on this side of the boundary means the shared package
 * never gains a `prosemirror-tables` dependency.
 */
export function buildInkweldSchema(): Schema {
  const spec = createExtendedSchemaSpec({
    baseNodes: { ...nodes, ...inkweldTableNodes },
    baseMarks: marks,
  });
  return new Schema(spec);
}

/**
 * The extended schema instance for use throughout the application.
 * This should be used instead of ngx-editor's default schema when
 * element references are needed.
 */
export const extendedSchema = buildInkweldSchema();

/**
 * @deprecated Use `buildInkweldSchema()` (clearer name). Kept as an alias
 * for back-compat with existing call sites.
 */
export { buildInkweldSchema as createExtendedSchema };

/**
 * Re-export ngx-editor's plain schema for cases where Inkweld extensions
 * aren't needed.
 */
export { schema as ngxEditorSchema } from '@bobbyquantum/ngx-editor/schema';
