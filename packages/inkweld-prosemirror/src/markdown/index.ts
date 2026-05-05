/**
 * Inkweld ProseMirror XML ↔ Markdown bridge.
 *
 * Both functions are pure string-to-string. Yjs is not required.
 *
 * The pair is designed to round-trip Inkweld's content faithfully:
 *   - Lossy marks (comment, text_color, …) survive via inline HTML
 *     `<span data-mark="…">` wrappers.
 *   - `elementRef` nodes survive as `inkweld://…` markdown links;
 *     callers control URI shape via `encodeElementRefHref` and
 *     decode via `decodeElementRefHref`.
 */
export {
  xmlToMarkdown,
  type ElementRefHrefEncoder,
  type XmlToMarkdownOptions,
} from './xml-to-markdown';
export {
  markdownToXml,
  type ElementRefHrefDecoder,
  type MarkdownToXmlOptions,
} from './markdown-to-xml';
