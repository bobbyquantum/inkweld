/**
 * Inkweld override of the standard `link` mark.
 *
 * Adds `rel` attribute support so that links opened in a new tab
 * (`target="_blank"`) always have `rel="noopener noreferrer"` written into
 * the DOM, mitigating opener-tampering attacks. This is enforced at
 * `toDOM` time even when the parsed source HTML omitted `rel`, so
 * pasted/imported content is automatically protected.
 *
 * `toDOM` also drops an href whose scheme isn't a web, mail or phone link
 * ({@link safeLinkHref}). Anyone with edit access can store any href through
 * the sync socket or MCP, and a `javascript:` link in a read-only view is one
 * click from running script as whoever opens the document.
 */

import { type Mark, type MarkSpec } from 'prosemirror-model';

const ALLOWED_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * The href to put in the DOM, or null to render the link without one.
 * Relative links and fragments pass; a URL with a scheme passes only for
 * http(s), mailto and tel. The scheme is read the way a browser reads it:
 * ASCII whitespace and control characters are ignored, so `java\tscript:`
 * and ` JAVASCRIPT:` are caught too.
 */
export function safeLinkHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const compact = Array.from(href)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x20 && code !== 0x7f;
    })
    .join('')
    .toLowerCase();
  const scheme = /^([a-z][a-z\d+.-]*):/.exec(compact)?.[1];
  if (scheme === undefined) return href;
  return ALLOWED_LINK_SCHEMES.has(scheme) ? href : null;
}

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
    // Normalise `target` so case/whitespace variations like `_BLANK` or
    // `" _blank "` cannot bypass rel-hardening.
    const isBlankTarget =
      typeof target === 'string' && target.trim().toLowerCase() === '_blank';
    const safeRel = isBlankTarget
      ? Array.from(
          new Set([...(rel?.split(/\s+/).filter(Boolean) ?? []), 'noopener', 'noreferrer'])
        ).join(' ')
      : rel;
    return ['a', { href: safeLinkHref(href), title, target, rel: safeRel }, 0];
  },
};
