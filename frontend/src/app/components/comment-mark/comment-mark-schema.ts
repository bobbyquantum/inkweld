/**
 * Comment Mark Schema — frontend re-export.
 *
 * The actual spec lives in the shared package
 * (`@inkweld/prosemirror/schema`) so the backend can reference it for
 * mark-tag tables in XML serialization. Existing imports of
 * `commentMarkSpec` and `CommentMarkAttrs` from this file continue to
 * work unchanged.
 */

export {
  COMMENT_MARK_NAME,
  type CommentMarkAttrs,
  commentMarkSpec,
} from '@inkweld/prosemirror/schema';
