/**
 * Inkweld ProseMirror schema specs and factory.
 *
 * Public API:
 *   - `elementRefNodeSpec`, `ELEMENT_REF_NODE_NAME`, `ElementRefNodeAttrs`,
 *     `elementRefSchemaExtension`
 *   - `commentMarkSpec`, `COMMENT_MARK_NAME`, `CommentMarkAttrs`
 *   - `secureLinkMarkSpec`
 *   - `createExtendedSchemaSpec({ baseNodes, baseMarks })` — returns
 *     `{nodes, marks}`; the host constructs `new Schema(...)` itself
 *     using its own copy of `prosemirror-model`.
 *
 * CSS for `elementRef` and `comment-highlight` rendering is intentionally
 * not exported — it stays in the frontend.
 */

export {
  ELEMENT_REF_NODE_NAME,
  type ElementRefNodeAttrs,
  elementRefNodeSpec,
  elementRefSchemaExtension,
} from './element-ref-spec';

export {
  COMMENT_MARK_NAME,
  type CommentMarkAttrs,
  commentMarkSpec,
} from './comment-mark-spec';

export { secureLinkMarkSpec } from './secure-link-spec';

export {
  AUTO_REVIEW_MARK_NAME,
  type AutoReviewMarkAttrs,
  autoReviewMarkSpec,
} from './auto-review-mark-spec';

export {
  type CreateExtendedSchemaInput,
  type ExtendedSchemaSpec,
  createExtendedSchemaSpec,
} from './create-extended-schema';
