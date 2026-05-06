/**
 * Canonical Inkweld ProseMirror XML → Y.Xml{Element,Text} parser.
 *
 * This is the **single** XML parser for the project. Both the backend
 * MCP layer (Bun + Cloudflare Workers) and the frontend snapshot/import
 * code call into it. It is deliberately portable:
 *
 *   - No DOM (`DOMParser`) dependency, so it runs on Workers.
 *   - The `Y` module is injected so callers control which yjs build
 *     they're using (avoids dual-package hazards across runtimes).
 *
 * The XML subset matches what the serializer in `./serializer.ts`
 * produces — the two functions are designed as a round-trip pair.
 *
 * Mark handling
 * -------------
 * Mark tags such as `<strong>`, `<em>`, `<a>` and the generic
 * `<span data-mark="...">` form (used for lossy marks like comments)
 * never become Y.XmlElement nodes — y-prosemirror crashes if mark
 * tags are stored as elements. Instead they collapse into formatting
 * runs on Y.XmlText.
 *
 * Marks accumulated by parent mark tags propagate to *all* descendants,
 * including text inside structural child elements (this fixes a latent
 * bug in the previous Durable Object implementation that dropped marks
 * when a structural element appeared inside a mark wrapper).
 *
 * Internal IR
 * -----------
 * Internally the parser yields a flat stream of `IntermediateChild`
 * items (text-runs OR fully-built XmlElement). Adjacent text-runs are
 * coalesced into a single Y.XmlText only at the moment of insertion
 * into a parent. We never read deltas back from a detached Y.XmlText
 * (yjs throws "Invalid access" on detached types), so all run merging
 * happens on plain JS objects.
 */

import type * as YModule from 'yjs';
import { decodeXmlEntities, skipTopLevelWhitespace } from './entities';
import { NODE_TAG_ALIASES, TAG_TO_MARK } from './tags';

/**
 * A loose Yjs node returned by the parser. Either Y.XmlElement or
 * Y.XmlText — kept generic so we don't pin the parser to a particular
 * yjs version's exported types.
 */
export type YxmlNode = YModule.XmlElement | YModule.XmlText;

/** Accumulated inline marks: `{ markName: markAttrs }`. */
export type MarkMap = Record<string, Record<string, unknown>>;

/** A formatted text run waiting to be flushed into a Y.XmlText. */
interface TextRun {
  kind: 'text';
  insert: string;
  attributes?: Record<string, unknown>;
}

/** A fully-constructed structural Y.XmlElement (no inline marks). */
interface ElementChild {
  kind: 'element';
  element: YModule.XmlElement;
}

type IntermediateChild = TextRun | ElementChild;

interface ParseResult {
  children: IntermediateChild[];
  pos: number;
}

/**
 * Parse a ProseMirror XML string into a flat list of Y.XmlElement /
 * Y.XmlText nodes ready to be inserted into a Y.XmlFragment.
 *
 * The caller owns transaction wrapping — this function is pure
 * construction and does not touch any Yjs document.
 *
 * @param Y - Reference to the `yjs` module the caller is using.
 * @param xmlString - XML source. Empty / whitespace input returns `[]`.
 * @returns Top-level nodes in document order.
 */
export function parseXmlToYjsNodes(Y: typeof YModule, xmlString: string): YxmlNode[] {
  if (!xmlString.trim()) return [];

  const intermediates: IntermediateChild[] = [];
  let pos = 0;

  while (pos < xmlString.length) {
    pos = skipTopLevelWhitespace(xmlString, pos);
    if (pos >= xmlString.length) break;

    const result = parseNode(Y, xmlString, pos, {});
    if (!result || result.pos <= pos) break;
    intermediates.push(...result.children);
    pos = result.pos;
  }

  return materialize(Y, intermediates);
}

/**
 * Convert an intermediate-children stream into the final Y.XmlText /
 * Y.XmlElement list. Adjacent text runs collapse into a single
 * Y.XmlText whose formatting runs are inserted via `insert(pos, str,
 * attrs)` — a freshly-constructed Y.XmlText accepts inserts even when
 * detached from a document, but it does NOT permit `toDelta()`, which
 * is why we never round-trip through a Y.XmlText.
 */
function materialize(Y: typeof YModule, intermediates: IntermediateChild[]): YxmlNode[] {
  const out: YxmlNode[] = [];
  let pending: TextRun[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const merged = new Y.XmlText();
    let offset = 0;
    // Track marks active in the previous run so that we can explicitly
    // clear them on the next run when they're absent. Y.XmlText.insert
    // does NOT clear formatting from neighbouring runs — without explicit
    // null values yjs will merge the new run into the previous one's
    // formatting (turning "bold" + " " into "bold " all-strong).
    let activeMarks: Set<string> = new Set();
    for (const run of pending) {
      if (!run.insert) continue;
      const runMarks = run.attributes ?? {};
      const runMarkKeys = new Set(Object.keys(runMarks));

      // Build the attribute map: everything in this run, plus explicit
      // `null` for marks that were active before but no longer apply.
      const attrs: Record<string, unknown> = { ...runMarks };
      for (const prev of activeMarks) {
        if (!runMarkKeys.has(prev)) attrs[prev] = null;
      }

      const hasAnyAttr = Object.keys(attrs).length > 0;
      merged.insert(offset, run.insert, hasAnyAttr ? attrs : undefined);
      offset += run.insert.length;
      activeMarks = runMarkKeys;
    }
    if (offset > 0) out.push(merged);
    pending = [];
  };

  for (const child of intermediates) {
    if (child.kind === 'text') {
      pending.push(child);
    } else {
      flush();
      out.push(child.element);
    }
  }
  flush();

  return out;
}

function parseNode(
  Y: typeof YModule,
  xml: string,
  pos: number,
  marks: MarkMap
): ParseResult | null {
  if (pos >= xml.length) return null;

  if (xml[pos] === '<') {
    if (xml.startsWith('<!--', pos)) {
      const endComment = xml.indexOf('-->', pos + 4);
      if (endComment === -1) return null;
      return { children: [], pos: endComment + 3 };
    }
    if (xml[pos + 1] === '/') {
      // Closing tag — signal parent to stop.
      return null;
    }
    return parseElement(Y, xml, pos, marks);
  }

  return parseText(xml, pos, marks);
}

function parseText(xml: string, pos: number, marks: MarkMap): ParseResult {
  let end = xml.indexOf('<', pos);
  if (end === -1) end = xml.length;

  const rawText = xml.substring(pos, end);
  const text = decodeXmlEntities(rawText);

  // Insignificant whitespace between block elements (newline-bearing,
  // empty-after-trim) gets dropped to avoid free-floating Y.XmlText at
  // the fragment level.
  if (!text.trim() && /\n/.test(text)) {
    return { children: [], pos: end };
  }

  const hasMarks = Object.keys(marks).length > 0;
  const run: TextRun = {
    kind: 'text',
    insert: text,
    ...(hasMarks ? { attributes: { ...marks } } : {}),
  };

  return { children: [run], pos: end };
}

function parseElement(Y: typeof YModule, xml: string, pos: number, marks: MarkMap): ParseResult {
  const tagMatch = /^<([a-zA-Z_][a-zA-Z0-9_-]*)/.exec(xml.substring(pos));
  if (!tagMatch) {
    return parseText(xml, pos, marks);
  }

  // Preserve the original case of the tag name. y-prosemirror uses the
  // ProseMirror schema's node type names verbatim (e.g. `elementRef`,
  // `codeBlock`, `listItem`). Lowercasing here would turn those into
  // invalid PM node types, so we lower-case only for the case-insensitive
  // table lookups (mark tags + node aliases).
  const rawTagName = tagMatch[1];
  const lowerTagName = rawTagName.toLowerCase();
  let cursor = pos + tagMatch[0].length;

  const { attrs, cursor: afterAttrs } = parseAttributes(xml, cursor);
  cursor = afterAttrs;

  // 1. Generic mark via `<span data-mark="...">`.
  if (lowerTagName === 'span' && typeof attrs['data-mark'] === 'string') {
    return parseGenericMarkTag(Y, xml, cursor, attrs, marks);
  }

  // 2. Known mark tag (strong, em, a, …).
  const markName = TAG_TO_MARK[lowerTagName];
  if (markName) {
    return parseKnownMarkTag(Y, xml, cursor, lowerTagName, markName, attrs, marks);
  }

  // 3. Structural element — preserve original casing.
  return parseRegularElement(Y, xml, cursor, rawTagName, lowerTagName, attrs, marks);
}

interface ParsedAttrs {
  attrs: Record<string, string>;
  cursor: number;
}

function parseAttributes(xml: string, start: number): ParsedAttrs {
  const attrs: Record<string, string> = {};
  let cursor = start;

  while (cursor < xml.length) {
    while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;

    if (xml[cursor] === '>' || (xml[cursor] === '/' && xml[cursor + 1] === '>')) {
      break;
    }

    const attrMatch = /^([a-zA-Z_:][a-zA-Z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/.exec(
      xml.substring(cursor)
    );
    if (attrMatch) {
      attrs[attrMatch[1]] = decodeXmlEntities(attrMatch[2] ?? attrMatch[3] ?? '');
      cursor += attrMatch[0].length;
    } else {
      cursor++;
    }
  }

  return { attrs, cursor };
}

function parseKnownMarkTag(
  Y: typeof YModule,
  xml: string,
  cursor: number,
  rawTagName: string,
  markName: string,
  attrs: Record<string, string>,
  marks: MarkMap
): ParseResult {
  const markValue: Record<string, unknown> =
    rawTagName === 'a' || markName === 'link'
      ? { href: attrs['href'] || '', ...(attrs['title'] ? { title: attrs['title'] } : {}) }
      : {};
  const newMarks: MarkMap = { ...marks, [markName]: markValue };

  if (xml[cursor] === '/' && xml[cursor + 1] === '>') {
    return { children: [], pos: cursor + 2 };
  }
  if (xml[cursor] === '>') cursor++;

  const { children, cursor: afterChildren } = parseChildren(Y, xml, cursor, rawTagName, newMarks);
  return { children, pos: afterChildren };
}

/**
 * Parse `<span data-mark="commentMark" commentId="..." ...>` style
 * generic mark wrappers used to round-trip lossy marks (comment,
 * text_color, text_background_color, …).
 *
 * Attribute names are preserved verbatim so the schema's exact attr
 * casing (e.g. `commentId`) survives round-tripping.
 */
function parseGenericMarkTag(
  Y: typeof YModule,
  xml: string,
  cursor: number,
  attrs: Record<string, string>,
  marks: MarkMap
): ParseResult {
  const markName = attrs['data-mark'];
  const markAttrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'data-mark') continue;
    markAttrs[key] = parseAttrValue(value);
  }
  const newMarks: MarkMap = { ...marks, [markName]: markAttrs };

  if (xml[cursor] === '/' && xml[cursor + 1] === '>') {
    return { children: [], pos: cursor + 2 };
  }
  if (xml[cursor] === '>') cursor++;

  const { children, cursor: afterChildren } = parseChildren(Y, xml, cursor, 'span', newMarks);
  return { children, pos: afterChildren };
}

function parseRegularElement(
  Y: typeof YModule,
  xml: string,
  cursor: number,
  rawTagName: string,
  lowerTagName: string,
  attrs: Record<string, string>,
  marks: MarkMap
): ParseResult {
  // Aliases match case-insensitively (`<ol>`, `<UL>`); when no alias hits,
  // preserve the source's exact casing (`elementRef`, `codeBlock`, …).
  const tagName = NODE_TAG_ALIASES[lowerTagName] ?? rawTagName;

  const selfClosing = xml[cursor] === '/' && xml[cursor + 1] === '>';
  if (selfClosing) {
    cursor += 2;
    const yElement = new Y.XmlElement(tagName);
    for (const [key, value] of Object.entries(attrs)) {
      yElement.setAttribute(key, parseAttrValue(value) as string);
    }
    return { children: [{ kind: 'element', element: yElement }], pos: cursor };
  }

  if (xml[cursor] === '>') cursor++;

  // Marks accumulated from parent mark wrappers must propagate to text
  // nested inside this structural element, otherwise marks silently drop
  // when nodes appear inside mark tags. (This was a latent bug in the
  // previous Durable Object parser.)
  const { children, cursor: afterChildren } = parseChildren(Y, xml, cursor, rawTagName, marks);

  const yElement = new Y.XmlElement(tagName);
  for (const [key, value] of Object.entries(attrs)) {
    yElement.setAttribute(key, parseAttrValue(value) as string);
  }
  const finalChildren = materialize(Y, children);
  if (finalChildren.length > 0) {
    yElement.insert(0, finalChildren);
  }

  return { children: [{ kind: 'element', element: yElement }], pos: afterChildren };
}

interface ParsedChildren {
  children: IntermediateChild[];
  cursor: number;
}

function parseChildren(
  Y: typeof YModule,
  xml: string,
  start: number,
  rawTagName: string,
  marks: MarkMap
): ParsedChildren {
  const children: IntermediateChild[] = [];
  // Closing-tag match is case-insensitive (`<Paragraph>…</paragraph>`
  // and `<elementRef …/>` both work).
  const closingTag = `</${rawTagName.toLowerCase()}>`;
  let cursor = start;

  while (cursor < xml.length) {
    if (xml.substring(cursor).toLowerCase().startsWith(closingTag)) {
      cursor += closingTag.length;
      break;
    }

    const childResult = parseNode(Y, xml, cursor, marks);
    if (!childResult) {
      // We hit a closing tag that doesn't belong to us (mismatched
      // nesting). Refuse to silently consume it — that turns malformed
      // XML into a different document tree, which could be surfaced to
      // an LLM as if it were the user's authored content. Surface the
      // failure so callers can fall back to a recovery strategy.
      const closeMatch = /^<\/([a-zA-Z_][a-zA-Z0-9_-]*)>/.exec(xml.substring(cursor));
      if (closeMatch) {
        throw new Error(
          `Mismatched closing tag </${closeMatch[1]}> while inside <${rawTagName}> at offset ${cursor}`
        );
      }
      break;
    }
    for (const child of childResult.children) children.push(child);
    if (childResult.pos <= cursor) break;
    cursor = childResult.pos;
  }

  return { children, cursor };
}

/**
 * Parse an XML attribute value, decoding the JSON-encoded objects and
 * arrays that the serializer is allowed to emit. Pure strings round-trip
 * unchanged.
 *
 * NOTE: We intentionally do NOT coerce numeric- or boolean-looking
 * strings (e.g. `"123"`, `"true"`) into their scalar forms. Element IDs
 * and similar identifiers are frequently numeric strings, and silently
 * turning them into `number` would break round-tripping and downstream
 * type assumptions. Schemas that need typed scalars should encode them
 * explicitly as JSON (e.g. `attr='[42]'`) or unmarshal at the consumer.
 */
export function parseAttrValue(value: string): unknown {
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
