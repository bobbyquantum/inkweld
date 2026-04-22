/**
 * Extended ProseMirror Schema for Inkweld
 *
 * Extends ngx-editor's default schema with custom nodes like elementRef
 * for inline element references (@ mentions).
 */
import { marks, nodes } from '@bobbyquantum/ngx-editor/schema';
import { commentMarkSpec } from '@components/comment-mark/comment-mark-schema';
import { type MarkSpec, Schema } from 'prosemirror-model';

import { elementRefNodeSpec } from './element-ref-schema';

/**
 * Override of ngx-editor's link mark that adds `rel` attribute support.
 * When a link opens in a new tab (target="_blank"), rel="noopener noreferrer"
 * is written into the DOM to prevent opener attacks.
 */
const linkMarkSpec: MarkSpec = {
  attrs: {
    href: {},
    title: { default: null },
    target: { default: null },
    rel: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs(dom) {
        const el = dom as HTMLElement;
        return {
          href: el.getAttribute('href'),
          title: el.getAttribute('title'),
          target: el.getAttribute('target'),
          rel: el.getAttribute('rel'),
        };
      },
    },
  ],
  toDOM(node) {
    const { href, title, target, rel } = node.attrs as {
      href: string;
      title: string | null;
      target: string | null;
      rel: string | null;
    };
    return ['a', { href, title, target, rel }, 0];
  },
};

/**
 * Creates an extended schema that includes ngx-editor's nodes and marks
 * plus custom Inkweld nodes like elementRef.
 *
 * @returns A new Schema with all standard nodes/marks plus elementRef
 */
export function createExtendedSchema(): Schema {
  // Start with ngx-editor's nodes and add our custom ones
  const extendedNodes = {
    ...nodes,
    elementRef: elementRefNodeSpec,
  };

  // Use the same marks as ngx-editor plus custom ones.
  // Override the link mark to add rel attribute support for opener protection.
  const extendedMarks = {
    ...marks,
    link: linkMarkSpec,
    comment: commentMarkSpec,
  };

  return new Schema({
    nodes: extendedNodes,
    marks: extendedMarks,
  });
}

/**
 * The extended schema instance for use throughout the application.
 * This should be used instead of ngx-editor's default schema when
 * element references are needed.
 */
export const extendedSchema = createExtendedSchema();

/**
 * Re-export the original schema for cases where extensions aren't needed
 */
export { schema as ngxEditorSchema } from '@bobbyquantum/ngx-editor/schema';
