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

/** Default `inkweld://` decoder. */
function defaultDecodeElementRefHref(href: string): Record<string, unknown> | null {
  if (!href.startsWith('inkweld://')) return null;
  // Strip protocol + parse query string.
  const rest = href.slice('inkweld://'.length);
  const [pathPart, queryPart] = rest.split('?', 2);
  const segments = pathPart.split('/').map((s) => decodeURIComponent(s));
  // Forms supported:
  //   element/{id}
  //   {username}/{slug}/element/{id}
  let elementId: string | null = null;
  if (segments[0] === 'element' && segments[1]) {
    elementId = segments[1];
  } else if (segments[2] === 'element' && segments[3]) {
    elementId = segments[3];
  }
  if (!elementId) return null;

  const attrs: Record<string, unknown> = { elementId };
  if (queryPart) {
    for (const param of queryPart.split('&')) {
      const [k, v = ''] = param.split('=', 2);
      if (!k) continue;
      attrs[decodeURIComponent(k)] = decodeURIComponent(v);
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

    // Fenced code block.
    const fence = matchFenceOpen(line);
    if (fence) {
      const { closeIndex, content } = readFenceContent(lines, i + 1, fence.fence);
      blocks.push({ kind: 'code', lang: fence.lang, content });
      i = closeIndex + 1;
      continue;
    }

    // Thematic break.
    if (isThematicBreak(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // ATX heading. NOSONAR(typescript:S5852) - linear: anchored, single-line, bounded quantifiers.
    const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line); // NOSONAR
    if (atx) {
      blocks.push({ kind: 'heading', level: atx[1].length, text: atx[2] });
      i++;
      continue;
    }

    // Blockquote.
    if (/^\s{0,3}>/.test(line)) {
      const { end, inner } = collectBlockquote(lines, i);
      blocks.push({ kind: 'blockquote', children: parseBlocks(inner) });
      i = end;
      continue;
    }

    // List.
    const listStart = matchListMarker(line);
    if (listStart) {
      const { end, list } = collectList(lines, i, listStart.ordered);
      blocks.push(list);
      i = end;
      continue;
    }

    // Setext heading? (current line is paragraph text; next line is === or ---)
    const setext = lookaheadSetext(lines, i);
    if (setext) {
      blocks.push({ kind: 'heading', level: setext.level, text: line.trim() });
      i += 2;
      continue;
    }

    // Paragraph: gather subsequent non-blank, non-special lines.
    const paraLines = [line];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (l.trim() === '') break;
      if (matchFenceOpen(l)) break;
      if (isThematicBreak(l)) break;
      if (/^(#{1,6})\s/.test(l)) break;
      if (/^\s{0,3}>/.test(l)) break;
      if (matchListMarker(l)) break;
      // Setext underline ends the paragraph (and would have been handled above).
      if (/^\s{0,3}(=+|-+)\s*$/.test(l)) break;
      paraLines.push(l);
      j++;
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join('\n') });
    i = j;
  }

  return blocks;
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
  const closeRe = new RegExp(`^\\s{0,3}${escapeRegex(fence[0])}{${fence.length},}\\s*$`);
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
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (!marker || marker.ordered !== ordered) break;
    if (firstItem) {
      listStart = marker.start;
      firstItem = false;
    }

    // Collect item content: first line after marker, plus any continuation
    // lines indented at least `marker.contentStart` columns.
    const itemLines: string[] = [lines[i].slice(marker.contentStart)];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (l.trim() === '') {
        // Blank line might be inside item OR end the list.
        // Peek ahead: if next non-blank is indented >= contentStart, continue.
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        if (k >= lines.length) break;
        const nextLine = lines[k];
        const nextMarker = matchListMarker(nextLine);
        if (nextMarker && nextMarker.ordered === ordered) {
          // Sibling list item — break out so outer loop picks it up.
          break;
        }
        if (countLeadingSpaces(nextLine) >= marker.contentStart) {
          // Continuation belongs to current item.
          for (; j < k; j++) itemLines.push('');
          continue;
        }
        break;
      }
      const nextMarker = matchListMarker(l);
      if (nextMarker && countLeadingSpaces(l) < marker.contentStart) {
        // Sibling marker at same indent — end this item.
        break;
      }
      // Lazy continuation: any non-blank line that isn't a sibling marker
      // belongs to the current item, with leading indent stripped if it
      // matches the content column.
      const stripped = stripIndent(l, marker.contentStart);
      itemLines.push(stripped);
      j++;
    }

    items.push(parseBlocks(itemLines.join('\n')));
    i = j;
  }

  return {
    end: i,
    list: { kind: 'list', ordered, start: listStart, items },
  };
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
    case 'list': {
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
    case 'code': {
      const langAttr = block.lang ? ` lang="${escapeXmlAttr(block.lang)}"` : '';
      return `<code_block${langAttr}>${escapeXmlText(block.content)}</code_block>`;
    }
    case 'hr':
      return '<horizontal_rule/>';
  }
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
    case 'image': {
      const titleAttr = node.title ? ` title="${escapeXmlAttr(node.title)}"` : '';
      return `<image src="${escapeXmlAttr(node.src)}" alt="${escapeXmlAttr(node.alt)}"${titleAttr}/>`;
    }
    case 'elementRef': {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(node.attrs)) {
        if (v === undefined || v === null) continue;
        const str =
          typeof v === 'object'
            ? JSON.stringify(v)
            : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional primitive coercion
              String(v);
        parts.push(`${k}="${escapeXmlAttr(str)}"`);
      }
      return `<elementRef ${parts.join(' ')}/>`;
    }
    case 'text': {
      let inner = escapeXmlText(node.text);
      const m = node.marks;
      // Inside-out wrapping order: code → emphasis-like → generic → link.
      if (m.code) inner = `<code>${inner}</code>`;
      if (m.strong) inner = `<strong>${inner}</strong>`;
      if (m.em) inner = `<em>${inner}</em>`;
      if (m.s) inner = `<s>${inner}</s>`;
      if (m.u) inner = `<u>${inner}</u>`;
      if (m.sup) inner = `<sup>${inner}</sup>`;
      if (m.sub) inner = `<sub>${inner}</sub>`;
      if (m.generic) {
        for (const g of m.generic) {
          inner = `<span ${spanAttrs(g.name, g.attrs)}>${inner}</span>`;
        }
      }
      if (m.link) {
        const titleAttr = m.link.title ? ` title="${escapeXmlAttr(m.link.title)}"` : '';
        inner = `<a href="${escapeXmlAttr(m.link.href)}"${titleAttr}>${inner}</a>`;
      }
      return inner;
    }
  }
}

function spanAttrs(name: string, attrs: Record<string, unknown>): string {
  const parts = [`data-mark="${escapeXmlAttr(name)}"`];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    const str =
      typeof v === 'object'
        ? JSON.stringify(v)
        : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional primitive coercion
          String(v);
    parts.push(`${k}="${escapeXmlAttr(str)}"`);
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
function parseInline(input: string, ctx: ParseContext): InlineNode[] {
  // Stage 1: tokenize into segments separated by inline constructs.
  const out: InlineNode[] = [];
  let pos = 0;
  let pendingText = '';
  const marks: InlineMarks = {};

  const flushText = () => {
    if (pendingText.length === 0) return;
    out.push({ kind: 'text', text: pendingText, marks: cloneMarks(marks) });
    pendingText = '';
  };

  while (pos < input.length) {
    const ch = input[pos];

    // Hard break: backslash at end of line, or two trailing spaces + newline.
    if (ch === '\n') {
      // Two-space hard break.
      if (pendingText.endsWith('  ')) {
        pendingText = pendingText.slice(0, -2);
        flushText();
        out.push({ kind: 'hardBreak' });
        pos++;
        continue;
      }
      // Otherwise treat as soft line break — represent as a literal space.
      pendingText += ' ';
      pos++;
      continue;
    }

    if (ch === '\\' && pos + 1 < input.length) {
      // Backslash escape.
      const next = input[pos + 1];
      if (next === '\n') {
        flushText();
        out.push({ kind: 'hardBreak' });
        pos += 2;
        continue;
      }
      if (isMdEscapable(next)) {
        pendingText += next;
        pos += 2;
        continue;
      }
    }

    // Inline code.
    if (ch === '`') {
      const code = readInlineCode(input, pos);
      if (code) {
        flushText();
        out.push({ kind: 'text', text: code.content, marks: { ...cloneMarks(marks), code: true } });
        pos = code.end;
        continue;
      }
    }

    // Image: ![alt](src "title")
    if (ch === '!' && input[pos + 1] === '[') {
      const img = readImage(input, pos);
      if (img) {
        flushText();
        out.push({ kind: 'image', src: img.src, alt: img.alt, title: img.title });
        pos = img.end;
        continue;
      }
    }

    // Link: [text](href "title")
    if (ch === '[') {
      const link = readLink(input, pos);
      if (link) {
        flushText();
        // If the href decodes to an elementRef, emit that. Otherwise,
        // recursively render the link text with a link mark.
        const refAttrs = ctx.decodeElementRefHref(link.href);
        if (refAttrs) {
          // Use plain link text as displayText if not provided in attrs.
          if (refAttrs['displayText'] === undefined) {
            refAttrs['displayText'] = link.text;
          }
          out.push({ kind: 'elementRef', attrs: refAttrs });
        } else {
          const inner = parseInline(link.text, ctx);
          for (const n of inner) {
            if (n.kind === 'text') {
              n.marks.link = { href: link.href, ...(link.title ? { title: link.title } : {}) };
              out.push(n);
            } else {
              out.push(n);
            }
          }
        }
        pos = link.end;
        continue;
      }
    }

    // Strong/emphasis (`**`, `__`, `*`, `_`).
    if (ch === '*' || ch === '_') {
      const delim = ch;
      const isStrong = input[pos + 1] === delim;
      const close = findClosingDelim(input, pos + (isStrong ? 2 : 1), delim, isStrong);
      if (close !== -1) {
        const inner = input.substring(pos + (isStrong ? 2 : 1), close);
        flushText();
        const innerMarks = { ...cloneMarks(marks), [isStrong ? 'strong' : 'em']: true };
        const innerCtx: ParseContext = ctx;
        const innerNodes = parseInlineWithMarks(inner, innerCtx, innerMarks);
        out.push(...innerNodes);
        pos = close + (isStrong ? 2 : 1);
        continue;
      }
    }

    // Strikethrough `~~…~~`
    if (ch === '~' && input[pos + 1] === '~') {
      const close = input.indexOf('~~', pos + 2);
      if (close !== -1) {
        const inner = input.substring(pos + 2, close);
        flushText();
        const innerNodes = parseInlineWithMarks(inner, ctx, { ...cloneMarks(marks), s: true });
        out.push(...innerNodes);
        pos = close + 2;
        continue;
      }
    }

    // Inline HTML for u/sup/sub/br/span data-mark.
    if (ch === '<') {
      const html = readInlineHtml(input, pos);
      if (html) {
        flushText();
        if (html.kind === 'br') {
          out.push({ kind: 'hardBreak' });
        } else if (html.kind === 'tag') {
          const innerMarks = applyHtmlTagToMarks(marks, html);
          const innerNodes = parseInlineWithMarks(html.content, ctx, innerMarks);
          out.push(...innerNodes);
        }
        pos = html.end;
        continue;
      }
    }

    pendingText += ch;
    pos++;
  }

  flushText();
  return out;
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
  // Find matching `]` (allowing nested brackets).
  let depth = 1;
  let i = pos + 1;
  while (i < input.length && depth > 0) {
    const c = input[i];
    if (c === '\\' && i + 1 < input.length) {
      i += 2;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  const text = input.substring(pos + 1, i);
  if (input[i + 1] !== '(') return null;
  // Read href (and optional title).
  let j = i + 2;
  // Skip leading whitespace.
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
  // Optional title.
  let title: string | undefined;
  while (j < input.length && /\s/.test(input[j])) j++;
  if (input[j] === '"' || input[j] === "'") {
    const quote = input[j];
    j++;
    let titleBuf = '';
    while (j < input.length && input[j] !== quote) {
      if (input[j] === '\\' && j + 1 < input.length) {
        titleBuf += input[j + 1];
        j += 2;
      } else {
        titleBuf += input[j];
        j++;
      }
    }
    if (input[j] !== quote) return null;
    j++;
    title = titleBuf;
    while (j < input.length && /\s/.test(input[j])) j++;
  }
  if (input[j] !== ')') return null;
  return { text, href, title, end: j + 1 };
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
      // Skip code spans so we don't match delimiters inside them.
      const code = readInlineCode(input, i);
      if (code) {
        i = code.end;
        continue;
      }
    }
    if (input.startsWith(target, i)) {
      // For single-char delim, ensure it isn't actually the start of a double.
      if (!isDouble && input[i + 1] === delim) {
        i++;
        continue;
      }
      // Skip leading whitespace check: emphasis delimiters can't be
      // preceded by whitespace on the closing side. Approximate by
      // requiring the previous char to be non-whitespace.
      if (i > start && /\s/.test(input[i - 1])) {
        i++;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
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
