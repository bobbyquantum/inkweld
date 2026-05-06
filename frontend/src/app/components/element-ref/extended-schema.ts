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

/**
 * Build the Inkweld editor schema by merging ngx-editor's base specs with
 * the shared Inkweld extensions, then constructing a `Schema` with the
 * frontend's own copy of `prosemirror-model`.
 */
export function buildInkweldSchema(): Schema {
  const spec = createExtendedSchemaSpec({ baseNodes: nodes, baseMarks: marks });
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
