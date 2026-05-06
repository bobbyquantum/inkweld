/**
 * Lightweight XML → AST parser for the Inkweld ProseMirror XML subset.
 *
 * Unlike `../xml/parser.ts` this does NOT depend on Yjs — it produces a
 * plain JavaScript AST so that conversion layers (markdown, HTML, …)
 * can run in environments without a Y.Doc constructed (e.g. server-side
 * read paths in MCP tools).
 *
 * Mark handling
 * -------------
 * Mark tags (`<strong>`, `<em>`, `<a>`, `<span data-mark="...">`)
 * collapse into formatting attributes on text runs, mirroring the
 * behaviour of the canonical Yjs parser. Marks accumulated by parent
 * mark wrappers propagate into all descendants — the same fix applied
 * to the Yjs parser to avoid silently dropping marks.
 */
import { decodeXmlEntities, skipTopLevelWhitespace } from './entities';
import { NODE_TAG_ALIASES, TAG_TO_MARK } from './tags';

/** Mark map: `{ markName: markAttrs }`. */
export type MarkMap = Record<string, Record<string, unknown>>;

/** A formatted text run inside an element's children. */
export interface AstText {
  type: 'text';
  text: string;
  marks?: MarkMap;
}

/** A structural element with attributes and children. */
export interface AstElement {
  type: 'element';
  name: string;
  attrs: Record<string, unknown>;
  children: AstNode[];
}

export type AstNode = AstText | AstElement;

/**
 * Parse a ProseMirror XML string into a plain JS AST. Returns the
 * top-level child sequence (typically a list of block nodes).
 */
export function parseXmlToAst(xmlString: string): AstNode[] {
  if (!xmlString.trim()) return [];
  const out: AstNode[] = [];
  let pos = 0;
  while (pos < xmlString.length) {
    pos = skipTopLevelWhitespace(xmlString, pos);
    if (pos >= xmlString.length) break;
    const result = parseAstNode(xmlString, pos, {});
    if (!result || result.pos <= pos) break;
    out.push(...result.nodes);
    pos = result.pos;
  }
  return out;
}

interface ParseResult {
  nodes: AstNode[];
  pos: number;
}

function parseAstNode(xml: string, pos: number, marks: MarkMap): ParseResult | null {
  if (pos >= xml.length) return null;
  if (xml[pos] === '<') {
    if (xml.startsWith('<!--', pos)) {
      const end = xml.indexOf('-->', pos + 4);
      if (end === -1) return null;
      return { nodes: [], pos: end + 3 };
    }
    if (xml[pos + 1] === '/') return null;
    return parseAstElement(xml, pos, marks);
  }
  return parseAstText(xml, pos, marks);
}

function parseAstText(xml: string, pos: number, marks: MarkMap): ParseResult {
  let end = xml.indexOf('<', pos);
  if (end === -1) end = xml.length;
  const raw = xml.substring(pos, end);
  const text = decodeXmlEntities(raw);
  if (!text.trim() && /\n/.test(text)) {
    return { nodes: [], pos: end };
  }
  const node: AstText = { type: 'text', text };
  if (Object.keys(marks).length > 0) node.marks = { ...marks };
  return { nodes: [node], pos: end };
}

function parseAstElement(xml: string, pos: number, marks: MarkMap): ParseResult {
  const tagMatch = /^<([a-zA-Z_][a-zA-Z0-9_-]*)/.exec(xml.substring(pos));
  if (!tagMatch) return parseAstText(xml, pos, marks);

  const rawTagName = tagMatch[1];
  const lowerTagName = rawTagName.toLowerCase();
  let cursor = pos + tagMatch[0].length;

  const { attrs: rawAttrs, cursor: afterAttrs } = parseAttrs(xml, cursor);
  cursor = afterAttrs;

  // Generic mark <span data-mark="...">
  if (lowerTagName === 'span' && typeof rawAttrs['data-mark'] === 'string') {
    return parseGenericMark(xml, cursor, rawAttrs, marks);
  }

  // Known mark tag
  const markName = TAG_TO_MARK[lowerTagName];
  if (markName) {
    return parseKnownMark(xml, cursor, lowerTagName, markName, rawAttrs, marks);
  }

  // Structural element
  const tagName = NODE_TAG_ALIASES[lowerTagName] ?? rawTagName;
  const parsedAttrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawAttrs)) {
    parsedAttrs[k] = parseAttrValue(v);
  }

  const selfClosing = xml[cursor] === '/' && xml[cursor + 1] === '>';
  if (selfClosing) {
    cursor += 2;
    return {
      nodes: [{ type: 'element', name: tagName, attrs: parsedAttrs, children: [] }],
      pos: cursor,
    };
  }
  if (xml[cursor] === '>') cursor++;

  const { children, cursor: afterChildren } = parseChildren(xml, cursor, rawTagName, marks);
  return {
    nodes: [{ type: 'element', name: tagName, attrs: parsedAttrs, children }],
    pos: afterChildren,
  };
}

function parseKnownMark(
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
    return { nodes: [], pos: cursor + 2 };
  }
  if (xml[cursor] === '>') cursor++;

  const { children, cursor: afterChildren } = parseChildren(xml, cursor, rawTagName, newMarks);
  return { nodes: children, pos: afterChildren };
}

function parseGenericMark(
  xml: string,
  cursor: number,
  attrs: Record<string, string>,
  marks: MarkMap
): ParseResult {
  const markName = attrs['data-mark'];
  const markAttrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'data-mark') continue;
    markAttrs[k] = parseAttrValue(v);
  }
  const newMarks: MarkMap = { ...marks, [markName]: markAttrs };

  if (xml[cursor] === '/' && xml[cursor + 1] === '>') {
    return { nodes: [], pos: cursor + 2 };
  }
  if (xml[cursor] === '>') cursor++;

  const { children, cursor: afterChildren } = parseChildren(xml, cursor, 'span', newMarks);
  return { nodes: children, pos: afterChildren };
}

function parseChildren(
  xml: string,
  start: number,
  rawTagName: string,
  marks: MarkMap
): { children: AstNode[]; cursor: number } {
  const children: AstNode[] = [];
  const closingTag = `</${rawTagName.toLowerCase()}>`;
  let cursor = start;

  while (cursor < xml.length) {
    if (xml.substring(cursor).toLowerCase().startsWith(closingTag)) {
      cursor += closingTag.length;
      break;
    }
    const result = parseAstNode(xml, cursor, marks);
    if (!result) {
      // See `parser.ts` — refuse to silently consume a closing tag that
      // belongs to an ancestor; otherwise malformed XML is normalised
      // into a different AST.
      const closeMatch = /^<\/([a-zA-Z_][a-zA-Z0-9_-]*)>/.exec(xml.substring(cursor));
      if (closeMatch) {
        throw new Error(
          `Mismatched closing tag </${closeMatch[1]}> while inside <${rawTagName}> at offset ${cursor}`
        );
      }
      break;
    }
    for (const n of result.nodes) children.push(n);
    if (result.pos <= cursor) break;
    cursor = result.pos;
  }

  return { children, cursor };
}

function parseAttrs(xml: string, start: number): { attrs: Record<string, string>; cursor: number } {
  const attrs: Record<string, string> = {};
  let cursor = start;
  while (cursor < xml.length) {
    while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
    if (xml[cursor] === '>' || (xml[cursor] === '/' && xml[cursor + 1] === '>')) break;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/.exec(xml.substring(cursor));
    if (m) {
      attrs[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? '');
      cursor += m[0].length;
    } else {
      cursor++;
    }
  }
  return { attrs, cursor };
}

/**
 * Parse an XML attribute value. Only JSON objects and arrays are
 * unmarshalled; numeric- or boolean-looking strings round-trip as raw
 * strings to avoid corrupting identifiers like `elementId="123"`.
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
