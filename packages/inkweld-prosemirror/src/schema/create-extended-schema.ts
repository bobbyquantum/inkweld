/**
 * Schema factory.
 *
 * Builds the Inkweld ProseMirror `Schema` by composing a base set of nodes
 * and marks (typically supplied by the editor library, e.g. ngx-editor)
 * with the Inkweld-specific extensions defined in this package:
 *   - `elementRef` node (inline element references)
 *   - `comment` mark (overlapping comment highlights)
 *   - `link` mark (overridden for opener protection)
 *
 * The factory is parameterised so the shared package never imports
 * ngx-editor (or any editor library) directly. The frontend supplies the
 * ngx-editor base set; backend code that needs a Schema can supply a
 * minimal hand-rolled base or skip schema construction entirely (the XML
 * parser/serializer in `@inkweld/prosemirror/xml` works off names, not a
 * Schema instance).
 */

import { type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model';

import { commentMarkSpec, COMMENT_MARK_NAME } from './comment-mark-spec';
import {
  ELEMENT_REF_NODE_NAME,
  elementRefNodeSpec,
} from './element-ref-spec';
import { secureLinkMarkSpec } from './secure-link-spec';

export interface CreateExtendedSchemaInput {
  /** Base node specs (e.g. ngx-editor's `nodes`). */
  baseNodes: Record<string, NodeSpec>;
  /** Base mark specs (e.g. ngx-editor's `marks`). */
  baseMarks: Record<string, MarkSpec>;
}

/**
 * Compose an Inkweld schema from a caller-supplied base.
 *
 * Inkweld extensions are merged on top of the base; the `link` mark from
 * the base is replaced with the secure variant.
 */
export function createExtendedSchema({
  baseNodes,
  baseMarks,
}: CreateExtendedSchemaInput): Schema {
  return new Schema({
    nodes: {
      ...baseNodes,
      [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec,
    },
    marks: {
      ...baseMarks,
      link: secureLinkMarkSpec,
      [COMMENT_MARK_NAME]: commentMarkSpec,
    },
  });
}
