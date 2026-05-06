/**
 * Convert GitHub-Flavored-Markdown (subset) to canonical Inkweld
 * ProseMirror XML. The output is consumable by `parseXmlToYjsNodes`
 * from `../xml/parser.ts`.
 *
 * Supported block constructs
 * --------------------------
 *   - ATX headings (`# … ######`) and setext headings (`===` / `---`)
 *   - Paragraphs (with hard-break support via trailing two spaces)
 *   - Blockquotes (`> …`), nested
 *   - Bullet lists (`-`, `*`, `+`) and ordered lists (`1.`, `1)`)
 *   - Fenced code blocks (` ``` ` and `~~~`) with optional language
 *   - Thematic breaks (`---`, `***`, `___`)
 *
 * Supported inline constructs
 * ---------------------------
 *   - Strong (`**…**`, `__…__`), emphasis (`*…*`, `_…_`)
 *   - Strikethrough (`~~…~~`)
 *   - Inline code (`` `…` ``) — including backtick fences for content
 *     containing backticks
 *   - Links `[text](href)` and `[text](href "title")`
 *   - Images `![alt](src)` / `![alt](src "title")`
 *   - Hard line breaks (trailing `  \n` or `<br/>`)
 *   - HTML pass-through for `<u>`, `<sup>`, `<sub>`,
 *     `<span data-mark="…">…</span>` so lossy marks round-trip
 *
 * URI handling
 * ------------
 * Markdown links whose href matches `inkweld://…` are decoded to
 * `<elementRef>` nodes via the injected `decodeElementRefHref` callback.
 * If the callback returns `null` the link is rendered as a plain link
 * mark instead.
 */
import { escapeXmlAttr, escapeXmlText } from '../xml/entities';
import { parseAttrValue } from '../xml/parser';

/** Decode an `inkweld://…` href into `elementRef` attrs, or `null` to keep as a plain link. */
export type ElementRefHrefDecoder = (
  href: string
) => Record<string, unknown> | null;

export interface MarkdownToXmlOptions {
  /** Decoder for `inkweld://…` hrefs. Defaults to a permissive decoder
   * that recognises both `inkweld://element/{id}` and
   * `inkweld://{user}/{slug}/element/{id}` plus optional query params. */
  decodeElementRefHref?: ElementRefHrefDecoder;
}

/**
 * Convert markdown to canonical Inkweld ProseMirror XML.
 */
export function markdownToXml(markdown: string, options: MarkdownToXmlOptions = {}): string {
  const ctx: ParseContext = {
    decodeElementRefHref: options.decodeElementRefHref ?? defaultDecodeElementRefHref,
  };
  const blocks = parseBlocks(normalizeLineEndings(markdown));
  return blocks.map((b) => renderBlock(b, ctx)).join('');
}

interface ParseContext {
  decodeElementRefHref: ElementRefHrefDecoder;
}

function normalizeLineEndings(s: string): string {
  return s.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/**
 * Decode a percent-encoded segment without throwing. Malformed inputs
 * (e.g. lone `%` characters) are returned verbatim so a single bad URL
 * cannot abort the whole markdown → XML conversion.
 */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Default `inkweld://` decoder. */
function defaultDecodeElementRefHref(href: string): Record<string, unknown> | null {
  if (!href.startsWith('inkweld://')) return null;
  // Strip protocol + parse query string.
  const rest = href.slice('inkweld://'.length);
  const [pathPart, queryPart] = rest.split('?', 2);
  const segments = pathPart.split('/').map(safeDecodeURIComponent);
  // Forms supported:
  //   element/{id}
  //   {username}/{slug}/element/{id}
  let elementId: string | null = null;
  if (
    segments.length === 4 &&
    segments[0] &&
    segments[1] &&
    segments[2] === 'element' &&
    segments[3]
  ) {
    elementId = segments[3];
  } else if (segments.length === 2 && segments[0] === 'element' && segments[1]) {
    elementId = segments[1];
  }
  if (!elementId) return null;

  const attrs: Record<string, unknown> = { elementId };
  if (queryPart) {
    for (const param of queryPart.split('&')) {
      const [k, v = ''] = param.split('=', 2);
      if (!k) continue;
      attrs[safeDecodeURIComponent(k)] = safeDecodeURIComponent(v);
    }
  }
  return attrs;
}

// ---------------------------------------------------------------------------
// Block-level parser
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'blockquote'; children: Block[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'code'; lang: string; content: string }
  | { kind: 'hr' };

function parseBlocks(input: string): Block[] {
  const lines = input.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (line.trim() === '') {
      i++;
      continue;
    }

    const consumed = tryParseBlock(lines, i, blocks);
    if (consumed > 0) {
      i += consumed;
      continue;
    }

    // Paragraph fallback: gather subsequent non-blank, non-special lines.
    const { end, paragraph } = collectParagraph(lines, i);
    blocks.push(paragraph);
    i = end;
  }

  return blocks;
}

/**
 * Try to parse a structural block (fence, hr, heading, blockquote, list,
 * setext) starting at `lines[i]`. Returns the number of lines consumed, or
 * 0 when no match — in which case the caller falls back to paragraph
 * collection. On a match, the parsed block is appended to `out`.
 */
function tryParseBlock(lines: string[], i: number, out: Block[]): number {
  const line = lines[i];

  // Fenced code block.
  const fence = matchFenceOpen(line);
  if (fence) {
    const { closeIndex, content } = readFenceContent(lines, i + 1, fence.fence);
    out.push({ kind: 'code', lang: fence.lang, content });
    return closeIndex - i + 1;
  }

  // Thematic break.
  if (isThematicBreak(line)) {
    out.push({ kind: 'hr' });
    return 1;
  }

  // ATX heading. NOSONAR(typescript:S5852) - linear: anchored, single-line, bounded quantifiers.
  const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line); // NOSONAR
  if (atx) {
    out.push({ kind: 'heading', level: atx[1].length, text: atx[2] });
    return 1;
  }

  // Blockquote.
  if (/^\s{0,3}>/.test(line)) {
    const { end, inner } = collectBlockquote(lines, i);
    out.push({ kind: 'blockquote', children: parseBlocks(inner) });
    return end - i;
  }

  // List.
  const listStart = matchListMarker(line);
  if (listStart) {
    const { end, list } = collectList(lines, i, listStart.ordered);
    out.push(list);
    return end - i;
  }

  // Setext heading? (current line is paragraph text; next line is === or ---)
  const setext = lookaheadSetext(lines, i);
  if (setext) {
    out.push({ kind: 'heading', level: setext.level, text: line.trim() });
    return 2;
  }

  return 0;
}

function collectParagraph(lines: string[], start: number): { end: number; paragraph: Block } {
  const paraLines = [lines[start]];
  let j = start + 1;
  while (j < lines.length && !isParagraphTerminator(lines[j])) {
    paraLines.push(lines[j]);
    j++;
  }
  return { end: j, paragraph: { kind: 'paragraph', text: paraLines.join('\n') } };
}

function isParagraphTerminator(line: string): boolean {
  if (line.trim() === '') return true;
  if (matchFenceOpen(line)) return true;
  if (isThematicBreak(line)) return true;
  if (/^(#{1,6})\s/.test(line)) return true;
  if (/^\s{0,3}>/.test(line)) return true;
  if (matchListMarker(line)) return true;
  // Setext underline ends the paragraph (and is handled by lookaheadSetext).
  if (/^\s{0,3}(=+|-+)\s*$/.test(line)) return true;
  return false;
}

function matchFenceOpen(line: string): { fence: string; lang: string } | null {
  // NOSONAR(typescript:S5852) - linear: anchored, single line, no nested quantifiers.
  const m = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`~]*)\s*$/.exec(line); // NOSONAR
  if (!m) return null;
  return { fence: m[2], lang: m[3] || '' };
}

function readFenceContent(
  lines: string[],
  start: number,
  fence: string
): { closeIndex: number; content: string } {
  const closeRe = new RegExp(String.raw`^\s{0,3}${escapeRegex(fence[0])}{${fence.length},}\s*$`);
  const content: string[] = [];
  let i = start;
  while (i < lines.length) {
    if (closeRe.test(lines[i])) {
      return { closeIndex: i, content: content.join('\n') };
    }
    content.push(lines[i]);
    i++;
  }
  return { closeIndex: i - 1, content: content.join('\n') };
}

function escapeRegex(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function isThematicBreak(line: string): boolean {
  if (!/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return false;
  return true;
}

function lookaheadSetext(lines: string[], i: number): { level: number } | null {
  const cur = lines[i];
  if (cur.trim() === '') return null;
  const next = lines[i + 1];
  if (next === undefined) return null;
  if (/^\s{0,3}=+\s*$/.test(next)) return { level: 1 };
  if (/^\s{0,3}-+\s*$/.test(next)) return { level: 2 };
  return null;
}

function collectBlockquote(lines: string[], start: number): { end: number; inner: string } {
  const inner: string[] = [];
  let i = start;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s{0,3}>/.test(l)) {
      inner.push(l.replace(/^\s{0,3}>\s?/, ''));
      i++;
    } else if (l.trim() === '') {
      // Lazy continuation — only consume blank if next line is also a quote.
      const next = lines[i + 1];
      if (next !== undefined && /^\s{0,3}>/.test(next)) {
        inner.push('');
        i++;
      } else {
        break;
      }
    } else {
      // Non-blank, non-quote line ends the blockquote (no lazy continuation).
      break;
    }
  }
  return { end: i, inner: inner.join('\n') };
}

interface ListMarker {
  ordered: boolean;
  start: number;
  markerLength: number;
  contentStart: number;
}

function matchListMarker(line: string): ListMarker | null {
  // NOSONAR(typescript:S5852) - linear: anchored, single line, bounded.
  const bullet = /^(\s{0,3})([-*+])(\s+)(.*)$/.exec(line); // NOSONAR
  if (bullet) {
    const indent = bullet[1].length;
    return {
      ordered: false,
      start: 1,
      markerLength: 1,
      contentStart: indent + 1 + bullet[3].length,
    };
  }
  // NOSONAR(typescript:S5852) - linear: anchored, single line, bounded.
  const ordered = /^(\s{0,3})(\d{1,9})([.)])(\s+)(.*)$/.exec(line); // NOSONAR
  if (ordered) {
    const indent = ordered[1].length;
    return {
      ordered: true,
      start: Number.parseInt(ordered[2], 10),
      markerLength: ordered[2].length + 1,
      contentStart: indent + ordered[2].length + 1 + ordered[4].length,
    };
  }
  return null;
}

function collectList(
  lines: string[],
  start: number,
  ordered: boolean
): { end: number; list: Block } {
  const items: Block[][] = [];
  let i = start;
  let listStart = 1;
  let firstItem = true;

  while (i < lines.length) {
    const marker = matchListMarker(lines[i]);
    if (marker?.ordered !== ordered) break;
    if (firstItem) {
      listStart = marker.start;
      firstItem = false;
    }
    const { end: itemEnd, itemLines } = collectListItemLines(lines, i, marker, ordered);
    items.push(parseBlocks(itemLines.join('\n')));
    i = itemEnd;
  }

  return {
    end: i,
    list: { kind: 'list', ordered, start: listStart, items },
  };
}

/**
 * Collect the lines belonging to a single list item. Returns the next index
 * after the item and the item's content lines (with the marker stripped from
 * the first line and continuation indent normalised).
 */
function collectListItemLines(
  lines: string[],
  itemStart: number,
  marker: ListMarker,
  ordered: boolean
): { end: number; itemLines: string[] } {
  // First line: strip marker prefix.
  const itemLines: string[] = [lines[itemStart].slice(marker.contentStart)];
  let j = itemStart + 1;

  while (j < lines.length) {
    const l = lines[j];
    if (l.trim() === '') {
      const next = handleBlankInsideListItem(lines, j, itemLines, marker, ordered);
      if (next === null) break;
      j = next;
      continue;
    }
    if (isSiblingMarkerForItem(l, marker, ordered)) break;
    // Lazy continuation: any non-blank line that isn't a sibling marker
    // belongs to the current item, with leading indent stripped if it
    // matches the content column.
    itemLines.push(stripIndent(l, marker.contentStart));
    j++;
  }

  return { end: j, itemLines };
}

/**
 * Decide what to do with a blank line inside a list item. Returns the next
 * `j` to continue at (with appropriate blank lines pushed into `itemLines`),
 * or `null` to terminate the item.
 */
function handleBlankInsideListItem(
  lines: string[],
  j: number,
  itemLines: string[],
  marker: ListMarker,
  ordered: boolean
): number | null {
  // Peek ahead: skip consecutive blank lines.
  let k = j + 1;
  while (k < lines.length && lines[k].trim() === '') k++;
  if (k >= lines.length) return null;

  const nextLine = lines[k];
  const nextMarker = matchListMarker(nextLine);
  if (nextMarker?.ordered === ordered) {
    // Sibling list item — terminate so the outer loop picks it up.
    return null;
  }
  if (countLeadingSpaces(nextLine) >= marker.contentStart) {
    // Continuation belongs to current item — preserve blank separator(s).
    for (let p = j; p < k; p++) itemLines.push('');
    return k;
  }
  return null;
}

function isSiblingMarkerForItem(
  line: string,
  marker: ListMarker,
  ordered: boolean
): boolean {
  const m = matchListMarker(line);
  if (!m) return false;
  if (m.ordered !== ordered) return false;
  return countLeadingSpaces(line) < marker.contentStart;
}

function countLeadingSpaces(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

function stripIndent(line: string, n: number): string {
  let stripped = 0;
  let i = 0;
  while (i < line.length && stripped < n) {
    const ch = line[i];
    if (ch === ' ') {
      stripped++;
      i++;
    } else if (ch === '\t') {
      stripped += 4;
      i++;
    } else {
      break;
    }
  }
  return line.slice(i);
}

// ---------------------------------------------------------------------------
// Block → XML rendering
// ---------------------------------------------------------------------------

function renderBlock(block: Block, ctx: ParseContext): string {
  switch (block.kind) {
    case 'heading':
      return `<heading level="${block.level}">${renderInline(block.text, ctx)}</heading>`;
    case 'paragraph':
      return `<paragraph>${renderInline(block.text, ctx)}</paragraph>`;
    case 'blockquote':
      return `<blockquote>${block.children.map((c) => renderBlock(c, ctx)).join('')}</blockquote>`;
    case 'list':
      return renderListBlock(block, ctx);
    case 'code':
      return renderCodeBlock(block);
    case 'hr':
      return '<horizontal_rule/>';
  }
}

function renderListBlock(
  block: Extract<Block, { kind: 'list' }>,
  ctx: ParseContext
): string {
  const itemsXml = block.items
    .map(
      (itemBlocks) =>
        `<list_item>${itemBlocks.map((b) => renderBlock(b, ctx)).join('')}</list_item>`
    )
    .join('');
  const tag = block.ordered ? 'ordered_list' : 'bullet_list';
  const attrs = block.ordered && block.start !== 1 ? ` order="${block.start}"` : '';
  return `<${tag}${attrs}>${itemsXml}</${tag}>`;
}

function renderCodeBlock(block: Extract<Block, { kind: 'code' }>): string {
  const langAttr = block.lang ? ` lang="${escapeXmlAttr(block.lang)}"` : '';
  return `<code_block${langAttr}>${escapeXmlText(block.content)}</code_block>`;
}

// ---------------------------------------------------------------------------
// Inline parser
// ---------------------------------------------------------------------------

interface InlineMarks {
  strong?: boolean;
  em?: boolean;
  s?: boolean;
  u?: boolean;
  sup?: boolean;
  sub?: boolean;
  code?: boolean;
  link?: { href: string; title?: string };
  /** Generic / lossy marks captured from `<span data-mark="…">`. */
  generic?: Array<{ name: string; attrs: Record<string, unknown> }>;
}

interface InlineRun {
  kind: 'text';
  text: string;
  marks: InlineMarks;
}

interface InlineImage {
  kind: 'image';
  src: string;
  alt: string;
  title?: string;
}

interface InlineHardBreak {
  kind: 'hardBreak';
}

interface InlineElementRef {
  kind: 'elementRef';
  attrs: Record<string, unknown>;
}

type InlineNode = InlineRun | InlineImage | InlineHardBreak | InlineElementRef;

function renderInline(text: string, ctx: ParseContext): string {
  const nodes = parseInline(text, ctx);
  return nodes.map((n) => renderInlineNode(n)).join('');
}

function renderInlineNode(node: InlineNode): string {
  switch (node.kind) {
    case 'hardBreak':
      return '<hard_break/>';
    case 'image':
      return renderImageNode(node);
    case 'elementRef':
      return renderElementRefNode(node);
    case 'text':
      return renderTextNode(node);
  }
}

function renderImageNode(node: InlineImage): string {
  const titleAttr = node.title ? ` title="${escapeXmlAttr(node.title)}"` : '';
  return `<image src="${escapeXmlAttr(node.src)}" alt="${escapeXmlAttr(node.alt)}"${titleAttr}/>`;
}

function renderElementRefNode(node: InlineElementRef): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(node.attrs)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}="${escapeXmlAttr(stringifyAttrValue(v))}"`);
  }
  return `<elementRef ${parts.join(' ')}/>`;
}

function renderTextNode(node: InlineRun): string {
  let inner = escapeXmlText(node.text);
  const m = node.marks;
  // Inside-out wrapping order: code → emphasis-like → generic → link.
  inner = applyEmphasisMarks(inner, m);
  inner = applyGenericMarks(inner, m);
  inner = applyLinkMark(inner, m);
  return inner;
}

/**
 * Apply the set of mutually-exclusive emphasis / styling marks (code,
 * strong, em, s, u, sup, sub) inside-out so the rendered XML mirrors the
 * original mark stacking. The relative order is preserved across all
 * call-sites.
 */
function applyEmphasisMarks(inner: string, m: InlineMarks): string {
  let out = inner;
  if (m.code) out = `<code>${out}</code>`;
  if (m.strong) out = `<strong>${out}</strong>`;
  if (m.em) out = `<em>${out}</em>`;
  if (m.s) out = `<s>${out}</s>`;
  if (m.u) out = `<u>${out}</u>`;
  if (m.sup) out = `<sup>${out}</sup>`;
  if (m.sub) out = `<sub>${out}</sub>`;
  return out;
}

function applyGenericMarks(inner: string, m: InlineMarks): string {
  if (!m.generic) return inner;
  let out = inner;
  for (const g of m.generic) {
    out = `<span ${spanAttrs(g.name, g.attrs)}>${out}</span>`;
  }
  return out;
}

function applyLinkMark(inner: string, m: InlineMarks): string {
  if (!m.link) return inner;
  const titleAttr = m.link.title ? ` title="${escapeXmlAttr(m.link.title)}"` : '';
  return `<a href="${escapeXmlAttr(m.link.href)}"${titleAttr}>${inner}</a>`;
}

function stringifyAttrValue(v: unknown): string {
  if (typeof v === 'object') return JSON.stringify(v);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional primitive coercion
  return String(v);
}

function spanAttrs(name: string, attrs: Record<string, unknown>): string {
  const parts = [`data-mark="${escapeXmlAttr(name)}"`];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}="${escapeXmlAttr(stringifyAttrValue(v))}"`);
  }
  return parts.join(' ');
}

/**
 * Parse an inline markdown string into a flat sequence of inline nodes.
 *
 * The implementation is a single-pass stack-based parser. It is NOT a
 * full CommonMark inline parser; it handles the subset documented at
 * the top of this file. Edge cases (e.g. nested emphasis with mixed
 * delimiters) follow a simple "earliest match wins" heuristic.
 */
/**
 * Mutable cursor passed to per-character inline handlers. Handlers may
 * push nodes into `out`, mutate `pendingText`, and advance `pos`. They
 * return `true` if they consumed input (in which case the main loop
 * `continue`s), or `false` to indicate "no match — try the next handler
 * or fall through to literal text accumulation".
 */
interface InlineParseState {
  input: string;
  ctx: ParseContext;
  out: InlineNode[];
  marks: InlineMarks;
  pos: number;
  pendingText: string;
}

function flushPending(state: InlineParseState): void {
  if (state.pendingText.length === 0) return;
  state.out.push({ kind: 'text', text: state.pendingText, marks: cloneMarks(state.marks) });
  state.pendingText = '';
}

function parseInline(input: string, ctx: ParseContext): InlineNode[] {
  const state: InlineParseState = {
    input,
    ctx,
    out: [],
    marks: {},
    pos: 0,
    pendingText: '',
  };

  while (state.pos < input.length) {
    if (handleInlineChar(state)) continue;
    state.pendingText += input[state.pos];
    state.pos++;
  }

  flushPending(state);
  return state.out;
}

/**
 * Try each inline construct handler in priority order. Returns true if
 * one of them consumed input.
 */
function handleInlineChar(state: InlineParseState): boolean {
  const ch = state.input[state.pos];
  if (ch === '\n') return handleNewline(state);
  if (ch === '\\') return handleBackslash(state);
  if (ch === '`' && tryConsumeInlineCode(state)) return true;
  if (ch === '!' && state.input[state.pos + 1] === '[' && tryConsumeImage(state)) return true;
  if (ch === '[' && tryConsumeLink(state)) return true;
  if ((ch === '*' || ch === '_') && tryConsumeEmphasis(state, ch)) return true;
  if (ch === '~' && state.input[state.pos + 1] === '~' && tryConsumeStrikethrough(state)) {
    return true;
  }
  if (ch === '<' && tryConsumeInlineHtml(state)) return true;
  return false;
}

function handleNewline(state: InlineParseState): boolean {
  // Two-space hard break.
  if (state.pendingText.endsWith('  ')) {
    state.pendingText = state.pendingText.slice(0, -2);
    flushPending(state);
    state.out.push({ kind: 'hardBreak' });
    state.pos++;
    return true;
  }
  // Otherwise treat as soft line break — represent as a literal space.
  state.pendingText += ' ';
  state.pos++;
  return true;
}

function handleBackslash(state: InlineParseState): boolean {
  if (state.pos + 1 >= state.input.length) return false;
  const next = state.input[state.pos + 1];
  if (next === '\n') {
    flushPending(state);
    state.out.push({ kind: 'hardBreak' });
    state.pos += 2;
    return true;
  }
  if (isMdEscapable(next)) {
    state.pendingText += next;
    state.pos += 2;
    return true;
  }
  return false;
}

function tryConsumeInlineCode(state: InlineParseState): boolean {
  const code = readInlineCode(state.input, state.pos);
  if (!code) return false;
  flushPending(state);
  state.out.push({
    kind: 'text',
    text: code.content,
    marks: { ...cloneMarks(state.marks), code: true },
  });
  state.pos = code.end;
  return true;
}

function tryConsumeImage(state: InlineParseState): boolean {
  const img = readImage(state.input, state.pos);
  if (!img) return false;
  flushPending(state);
  state.out.push({ kind: 'image', src: img.src, alt: img.alt, title: img.title });
  state.pos = img.end;
  return true;
}

function tryConsumeLink(state: InlineParseState): boolean {
  const link = readLink(state.input, state.pos);
  if (!link) return false;
  flushPending(state);
  // If the href decodes to an elementRef, emit that. Otherwise render the
  // link text recursively with a `link` mark applied to its text nodes.
  const refAttrs = state.ctx.decodeElementRefHref(link.href);
  if (refAttrs) {
    if (refAttrs['displayText'] === undefined) {
      refAttrs['displayText'] = link.text;
    }
    state.out.push({ kind: 'elementRef', attrs: refAttrs });
  } else {
    appendLinkInner(state, link);
  }
  state.pos = link.end;
  return true;
}

function appendLinkInner(
  state: InlineParseState,
  link: { text: string; href: string; title?: string }
): void {
  const inner = parseInline(link.text, state.ctx);
  for (const n of inner) {
    if (n.kind === 'text') {
      n.marks.link = { href: link.href, ...(link.title ? { title: link.title } : {}) };
    }
    state.out.push(n);
  }
}

function tryConsumeEmphasis(state: InlineParseState, delim: string): boolean {
  const isStrong = state.input[state.pos + 1] === delim;
  const offset = isStrong ? 2 : 1;
  const close = findClosingDelim(state.input, state.pos + offset, delim, isStrong);
  if (close === -1) return false;
  const inner = state.input.substring(state.pos + offset, close);
  flushPending(state);
  const innerMarks = { ...cloneMarks(state.marks), [isStrong ? 'strong' : 'em']: true };
  state.out.push(...parseInlineWithMarks(inner, state.ctx, innerMarks));
  state.pos = close + offset;
  return true;
}

function tryConsumeStrikethrough(state: InlineParseState): boolean {
  const close = state.input.indexOf('~~', state.pos + 2);
  if (close === -1) return false;
  const inner = state.input.substring(state.pos + 2, close);
  flushPending(state);
  state.out.push(
    ...parseInlineWithMarks(inner, state.ctx, { ...cloneMarks(state.marks), s: true })
  );
  state.pos = close + 2;
  return true;
}

function tryConsumeInlineHtml(state: InlineParseState): boolean {
  const html = readInlineHtml(state.input, state.pos);
  if (!html) return false;
  flushPending(state);
  if (html.kind === 'br') {
    state.out.push({ kind: 'hardBreak' });
  } else if (html.kind === 'tag') {
    const innerMarks = applyHtmlTagToMarks(state.marks, html);
    state.out.push(...parseInlineWithMarks(html.content, state.ctx, innerMarks));
  }
  state.pos = html.end;
  return true;
}

function parseInlineWithMarks(
  text: string,
  ctx: ParseContext,
  marks: InlineMarks
): InlineNode[] {
  const inner = parseInline(text, ctx);
  for (const n of inner) {
    if (n.kind === 'text') {
      // Merge outer marks under inner ones (inner take precedence).
      n.marks = mergeMarks(marks, n.marks);
    }
  }
  return inner;
}

function mergeMarks(outer: InlineMarks, inner: InlineMarks): InlineMarks {
  return {
    ...cloneMarks(outer),
    ...cloneMarks(inner),
    generic: [...(outer.generic ?? []), ...(inner.generic ?? [])],
    link: inner.link ?? outer.link,
  };
}

function cloneMarks(m: InlineMarks): InlineMarks {
  const clone: InlineMarks = { ...m };
  if (m.generic) clone.generic = [...m.generic];
  if (m.link) clone.link = { ...m.link };
  return clone;
}

function isMdEscapable(ch: string): boolean {
  return '\\`*_{}[]()#+-.!>~|<'.includes(ch);
}

function readInlineCode(input: string, pos: number): { content: string; end: number } | null {
  // Match the opening backtick run.
  const openMatch = /^`+/.exec(input.substring(pos));
  if (!openMatch) return null;
  const fence = openMatch[0];
  const start = pos + fence.length;
  const closeIdx = input.indexOf(fence, start);
  if (closeIdx === -1) return null;
  // Make sure the closing run isn't immediately followed by another backtick
  // (i.e. it's a longer run than the opener).
  if (input[closeIdx + fence.length] === '`') return null;
  let content = input.substring(start, closeIdx);
  // CommonMark: strip a single leading and trailing space if both are present
  // and content isn't all spaces.
  if (content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
    content = content.slice(1, -1);
  }
  return { content, end: closeIdx + fence.length };
}

function readImage(
  input: string,
  pos: number
): { alt: string; src: string; title?: string; end: number } | null {
  // pos points at `!`.
  const link = readLink(input, pos + 1);
  if (!link) return null;
  return { alt: link.text, src: link.href, title: link.title, end: link.end };
}

function readLink(
  input: string,
  pos: number
): { text: string; href: string; title?: string; end: number } | null {
  if (input[pos] !== '[') return null;
  const labelEnd = findLinkLabelEnd(input, pos + 1);
  if (labelEnd === -1) return null;
  if (input[labelEnd + 1] !== '(') return null;

  const text = input.substring(pos + 1, labelEnd);
  const hrefResult = readLinkHref(input, labelEnd + 2);
  const titleResult = readLinkTitle(input, hrefResult.end);
  if (!titleResult) return null;
  if (input[titleResult.end] !== ')') return null;

  return {
    text,
    href: hrefResult.href,
    title: titleResult.title,
    end: titleResult.end + 1,
  };
}

/** Find the matching `]` for a link label starting at `start`, allowing
 * nested `[...]` and backslash escapes. Returns the index of the closing
 * `]`, or -1 if unmatched. */
function findLinkLabelEnd(input: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < input.length && depth > 0) {
    const c = input[i];
    if (c === '\\' && i + 1 < input.length) {
      i += 2;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1;
}

function readLinkHref(input: string, start: number): { href: string; end: number } {
  let j = start;
  while (j < input.length && /\s/.test(input[j])) j++;
  let href = '';
  while (j < input.length) {
    const c = input[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === ')') break;
    if (c === '\\' && j + 1 < input.length) {
      href += input[j + 1];
      j += 2;
      continue;
    }
    href += c;
    j++;
  }
  return { href, end: j };
}

/**
 * Read an optional `"title"` or `'title'` after the href. Returns the
 * advanced position (past trailing whitespace) and the parsed title (or
 * `undefined` if no title was present). Returns `null` only when a quote
 * was opened but never closed.
 */
function readLinkTitle(
  input: string,
  start: number
): { title?: string; end: number } | null {
  let j = start;
  while (j < input.length && /\s/.test(input[j])) j++;
  const quote = input[j];
  if (quote !== '"' && quote !== "'") return { end: j };
  j++;
  let title = '';
  while (j < input.length && input[j] !== quote) {
    if (input[j] === '\\' && j + 1 < input.length) {
      title += input[j + 1];
      j += 2;
    } else {
      title += input[j];
      j++;
    }
  }
  if (input[j] !== quote) return null;
  j++;
  while (j < input.length && /\s/.test(input[j])) j++;
  return { title, end: j };
}

function findClosingDelim(
  input: string,
  start: number,
  delim: string,
  isDouble: boolean
): number {
  const target = isDouble ? delim + delim : delim;
  let i = start;
  while (i < input.length) {
    if (input[i] === '\\' && i + 1 < input.length) {
      i += 2;
      continue;
    }
    if (input[i] === '`') {
      const code = readInlineCode(input, i);
      if (code) {
        i = code.end;
        continue;
      }
    }
    if (input.startsWith(target, i) && isValidClosingDelim(input, i, delim, isDouble, start)) {
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Decide whether `input.startsWith(target, i)` is a valid emphasis
 * closer. Two rules apply: a single-char delimiter must not be the start
 * of a double, and the closer cannot be preceded by whitespace.
 */
function isValidClosingDelim(
  input: string,
  i: number,
  delim: string,
  isDouble: boolean,
  start: number
): boolean {
  if (!isDouble && input[i + 1] === delim) return false;
  if (i > start && /\s/.test(input[i - 1])) return false;
  return true;
}

interface InlineHtmlTag {
  kind: 'tag';
  name: string;
  attrs: Record<string, string>;
  content: string;
  end: number;
}

interface InlineHtmlBr {
  kind: 'br';
  end: number;
}

type InlineHtml = InlineHtmlTag | InlineHtmlBr;

function readInlineHtml(input: string, pos: number): InlineHtml | null {
  // Self-closing <br/> or <br>.
  const br = /^<br\s*\/?>/i.exec(input.substring(pos));
  if (br) return { kind: 'br', end: pos + br[0].length };

  // Recognized inline tags: u, sup, sub, span.
  const open = /^<(u|sup|sub|span)([^>]*)>/i.exec(input.substring(pos));
  if (!open) return null;
  const tagName = open[1].toLowerCase();
  const attrPart = open[2];
  const closeTag = `</${tagName}>`;
  const contentStart = pos + open[0].length;
  const closeIdx = input.toLowerCase().indexOf(closeTag, contentStart);
  if (closeIdx === -1) return null;
  const content = input.substring(contentStart, closeIdx);
  const attrs = parseHtmlAttrs(attrPart);
  return {
    kind: 'tag',
    name: tagName,
    attrs,
    content,
    end: closeIdx + closeTag.length,
  };
}

function parseHtmlAttrs(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // NOSONAR(typescript:S5852) - linear: alternation of negated-class quantifiers cannot
  // overlap (an attr is either "..." or '...'), and the global match makes progress each step.
  const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; // NOSONAR
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? '';
  }
  return attrs;
}

function applyHtmlTagToMarks(outer: InlineMarks, html: InlineHtmlTag): InlineMarks {
  const m = cloneMarks(outer);
  switch (html.name) {
    case 'u':
      m.u = true;
      break;
    case 'sup':
      m.sup = true;
      break;
    case 'sub':
      m.sub = true;
      break;
    case 'span': {
      const markName = html.attrs['data-mark'];
      if (markName) {
        const attrs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(html.attrs)) {
          if (k === 'data-mark') continue;
          attrs[k] = parseAttrValue(v);
        }
        m.generic = [...(m.generic ?? []), { name: markName, attrs }];
      }
      break;
    }
  }
  return m;
}
