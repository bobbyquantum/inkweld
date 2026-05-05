/**
 * Inkweld override of the standard `link` mark.
 *
 * Adds `rel` attribute support so that links opened in a new tab
 * (`target="_blank"`) always have `rel="noopener noreferrer"` written into
 * the DOM, mitigating opener-tampering attacks. This is enforced at
 * `toDOM` time even when the parsed source HTML omitted `rel`, so
 * pasted/imported content is automatically protected.
 */

import { type Mark, type MarkSpec } from 'prosemirror-model';

export const secureLinkMarkSpec: MarkSpec = {
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
      getAttrs(dom: HTMLElement) {
        return {
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title'),
          target: dom.getAttribute('target'),
          rel: dom.getAttribute('rel'),
        };
      },
    },
  ],
  toDOM(node: Mark) {
    const { href, title, target, rel } = node.attrs as {
      href: string;
      title: string | null;
      target: string | null;
      rel: string | null;
    };
    const safeRel =
      target === '_blank'
        ? Array.from(
            new Set([
              ...(rel?.split(/\s+/).filter(Boolean) ?? []),
              'noopener',
              'noreferrer',
            ])
          ).join(' ')
        : rel;
    return ['a', { href, title, target, rel: safeRel }, 0];
  },
};
