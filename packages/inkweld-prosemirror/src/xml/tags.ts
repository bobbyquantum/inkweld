/**
 * Tag tables shared by the canonical Inkweld ProseMirror XML format.
 *
 * Two distinct categories of XML tags exist:
 *   - **Mark tags** (e.g. `<strong>`, `<em>`, `<a>`) become formatting
 *     attributes on Y.XmlText. y-prosemirror crashes if they are
 *     materialised as Y.XmlElement because they are not valid
 *     ProseMirror node types.
 *   - **Node tag aliases** (e.g. `<ol>` → `ordered_list`) accept a few
 *     well-known shorthand names from human-authored XML and map them to
 *     the canonical schema name before instantiation.
 */

/** XML tag → ProseMirror mark name. Drives parsing. */
export const TAG_TO_MARK: Record<string, string> = {
  strong: 'strong',
  bold: 'strong',
  b: 'strong',
  em: 'em',
  italic: 'em',
  i: 'em',
  u: 'u',
  underline: 'u',
  s: 's',
  strike: 's',
  strikethrough: 's',
  del: 's',
  code: 'code',
  sup: 'sup',
  sub: 'sub',
  a: 'link',
};

/** ProseMirror mark name → preferred XML tag for serialization. */
export const MARK_TO_TAG: Record<string, string> = {
  strong: 'strong',
  em: 'em',
  u: 'u',
  s: 's',
  code: 'code',
  sup: 'sup',
  sub: 'sub',
  link: 'a',
};

/** Convenience set of attribute names lifted onto the `<a>` element for the link mark. */
export const LINK_ATTR_NAMES = ['href', 'title', 'target'] as const;

/** Common alternative tag names mapped to their canonical ProseMirror node names. */
export const NODE_TAG_ALIASES: Record<string, string> = {
  numbered_list: 'ordered_list',
  ol: 'ordered_list',
  ul: 'bullet_list',
};

/**
 * Block-level node names that should always be emitted with an explicit
 * closing tag (e.g. `<paragraph></paragraph>`) even when empty. All other
 * empty elements collapse to a self-closing form (`<hard_break/>`).
 */
export const BLOCK_NODE_NAMES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'code_block',
  'listItem',
  'list_item',
]);
