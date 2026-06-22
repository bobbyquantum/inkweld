/**
 * Schema spec factory.
 *
 * Builds the Inkweld ProseMirror schema **specs** (a plain `{nodes, marks}`
 * object) by composing a base set of nodes and marks (typically supplied
 * by the editor library, e.g. ngx-editor) with the Inkweld-specific
 * extensions defined in this package:
 *   - `elementRef` node (inline element references)
 *   - `comment` mark (overlapping comment highlights)
 *   - `link` mark (overridden for opener protection)
 *
 * IMPORTANT — the factory returns SPECS, not a constructed `Schema`
 * instance. The host application constructs the `Schema` itself using
 * its own copy of `prosemirror-model`. This avoids the bundler pulling
 * in a SECOND copy of `prosemirror-model` (one for this package, one for
 * the host) which would produce two distinct `Schema` constructors. With
 * two constructors, class-identity checks in y-prosemirror, ngx-editor,
 * and `EditorView` fail silently — typing into the editor produces no
 * output even though no exception is thrown. See PR #1068 investigation.
 *
 * The factory is parameterised so the shared package never imports
 * ngx-editor (or any editor library) directly. The frontend supplies the
 * ngx-editor base set; backend code that needs a Schema can supply a
 * minimal hand-rolled base or skip schema construction entirely (the XML
 * parser/serializer in `@inkweld/prosemirror/xml` works off names, not a
 * Schema instance).
 */

import type { MarkSpec, NodeSpec } from 'prosemirror-model';

import { commentMarkSpec, COMMENT_MARK_NAME } from './comment-mark-spec';
import {
  ELEMENT_REF_NODE_NAME,
  elementRefNodeSpec,
} from './element-ref-spec';
import { secureLinkMarkSpec } from './secure-link-spec';
import {
  autoReviewMarkSpec,
  AUTO_REVIEW_MARK_NAME,
} from './auto-review-mark-spec';

export interface CreateExtendedSchemaInput {
  /** Base node specs (e.g. ngx-editor's `nodes`). */
  baseNodes: Record<string, NodeSpec>;
  /** Base mark specs (e.g. ngx-editor's `marks`). */
  baseMarks: Record<string, MarkSpec>;
}

export interface ExtendedSchemaSpec {
  nodes: Record<string, NodeSpec>;
  marks: Record<string, MarkSpec>;
}

/**
 * Compose the Inkweld schema specs from a caller-supplied base.
 *
 * Returns a plain `{nodes, marks}` object suitable for passing to
 * `new Schema(...)` in the host application. Inkweld extensions are
 * merged on top of the base; the `link` mark from the base is replaced
 * with the secure variant.
 */
export function createExtendedSchemaSpec({
  baseNodes,
  baseMarks,
}: CreateExtendedSchemaInput): ExtendedSchemaSpec {
  return {
    nodes: {
      ...baseNodes,
      [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec,
    },
    marks: {
      ...baseMarks,
      link: secureLinkMarkSpec,
      [COMMENT_MARK_NAME]: commentMarkSpec,
      [AUTO_REVIEW_MARK_NAME]: autoReviewMarkSpec,
    },
  };
}
