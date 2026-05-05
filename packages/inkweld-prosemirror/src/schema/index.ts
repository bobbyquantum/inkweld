/**
 * Inkweld ProseMirror schema specs and factory.
 *
 * Public API:
 *   - `elementRefNodeSpec`, `ELEMENT_REF_NODE_NAME`, `ElementRefNodeAttrs`,
 *     `ElementTypeLike`, `elementRefSchemaExtension`
 *   - `commentMarkSpec`, `COMMENT_MARK_NAME`, `CommentMarkAttrs`
 *   - `secureLinkMarkSpec`
 *   - `createExtendedSchema({ baseNodes, baseMarks })`
 *
 * CSS for `elementRef` and `comment-highlight` rendering is intentionally
 * not exported — it stays in the frontend.
 */

export {
  ELEMENT_REF_NODE_NAME,
  type ElementRefNodeAttrs,
  type ElementTypeLike,
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
  type CreateExtendedSchemaInput,
  createExtendedSchema,
} from './create-extended-schema';
