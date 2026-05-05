/**
 * Extended ProseMirror Schema for Inkweld — frontend factory.
 *
 * Composes ngx-editor's base schema with the Inkweld-specific extensions
 * (`elementRef`, `comment`, secure `link`) defined in the shared package
 * `@inkweld/prosemirror/schema`. Keeping the ngx-editor coupling here
 * means the shared package stays editor-library-free.
 */
import { marks, nodes, schema } from '@bobbyquantum/ngx-editor/schema';
import { createExtendedSchema as createSharedSchema } from '@inkweld/prosemirror/schema';
import type { Schema } from 'prosemirror-model';

/**
 * Build the Inkweld editor schema by merging ngx-editor's base specs with
 * the shared Inkweld extensions.
 */
export function buildInkweldSchema(): Schema {
  return createSharedSchema({ baseNodes: nodes, baseMarks: marks });
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
export { schema as ngxEditorSchema };
