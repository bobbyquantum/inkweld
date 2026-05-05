/**
 * Convert canonical Inkweld ProseMirror XML to GitHub-Flavored Markdown
 * with HTML span pass-through for lossy marks.
 *
 * The mapping is intentionally conservative — round-tripping through
 * `markdownToXml` will preserve content but not byte-for-byte equality
 * (e.g. blank lines may be normalized, attribute ordering may differ).
 *
 * Lossy mark preservation
 * -----------------------
 * Marks that have no native markdown syntax (comment, text_color,
 * text_background_color, …) are emitted as inline HTML
 * `<span data-mark="...">` so they survive a round-trip. The same form
 * is used by the XML serializer; see `../xml/serializer.ts`.
 *
 * elementRef encoding
 * -------------------
 * `<elementRef elementId="..." displayText="..." />` becomes a markdown
 * link whose href is an `inkweld://` URI. The encoder is injected so
 * callers can decide whether to scope the URI to a project (preferred)
 * or use the bare `inkweld://element/{id}` form.
 */
import type { AstElement, AstNode, AstText } from '../xml/ast';
import { parseXmlToAst } from '../xml/ast';
import { MARK_TO_TAG } from '../xml/tags';

/**
 * Strategy for encoding `<elementRef>` nodes as markdown links. Returns
 * the URL portion of the link (the encoder owns the choice between
 * `inkweld://{user}/{slug}/element/{id}` and `inkweld://element/{id}`).
 */
export type ElementRefHrefEncoder = (attrs: Record<string, unknown>) => string;

export interface XmlToMarkdownOptions {
  /**
   * Encoder for `elementRef` nodes. Defaults to the bare project-less
   * form (`inkweld://element/{elementId}`). Inkweld's MCP layer should
   * pass a project-scoped encoder.
   */
  encodeElementRefHref?: ElementRefHrefEncoder;
}

/** Convert an XML string to a markdown string. */
export function xmlToMarkdown(xml: string, options: XmlToMarkdownOptions = {}): string {
  const ast = parseXmlToAst(xml);
  const ctx: RenderContext = {
    encodeElementRefHref: options.encodeElementRefHref ?? defaultElementRefHrefEncoder,
  };
  const blocks = renderBlocks(ast, ctx);
  // Collapse 3+ blank lines to 2. We deliberately do NOT trim trailing
  // whitespace per line because that would destroy the two-space
  // markdown hard-break marker (`  \n`).
  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface RenderContext {
  encodeElementRefHref: ElementRefHrefEncoder;
}

function defaultElementRefHrefEncoder(attrs: Record<string, unknown>): string {
  const id = typeof attrs['elementId'] === 'string' ? attrs['elementId'] : '';
  return `inkweld://element/${encodeURIComponent(id)}`;
}

function renderBlocks(nodes: AstNode[], ctx: RenderContext): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      // Free-floating text at the block level becomes its own paragraph.
      const txt = renderInlineNodes([node], ctx).trim();
      if (txt) out.push(txt);
      continue;
    }
    const rendered = renderBlockElement(node, ctx);
    if (rendered) out.push(rendered);
  }
  return out;
}

function renderBlockElement(node: AstElement, ctx: RenderContext): string {
  switch (node.name) {
    case 'paragraph':
      return renderInlineNodes(node.children, ctx);
    case 'heading': {
      const level = clampHeadingLevel(node.attrs['level']);
      return `${'#'.repeat(level)} ${renderInlineNodes(node.children, ctx)}`;
    }
    case 'blockquote': {
      const inner = renderBlocks(node.children, ctx).join('\n\n');
      return inner
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    }
    case 'bullet_list':
    case 'bulletList':
      return renderList(node, '-', ctx);
    case 'ordered_list':
    case 'orderedList':
      return renderList(node, 'ordered', ctx);
    case 'code_block':
    case 'codeBlock': {
      const lang = stringAttr(node.attrs, 'lang') ?? stringAttr(node.attrs, 'language') ?? '';
      const content = collectRawText(node.children);
      return '```' + lang + '\n' + content + '\n```';
    }
    case 'horizontal_rule':
    case 'horizontalRule':
    case 'hr':
      return '---';
    case 'image':
      return renderImage(node);
    default:
      // Unknown block: best-effort render its children.
      if (node.children.length === 0) return '';
      return renderInlineNodes(node.children, ctx);
  }
}

function clampHeadingLevel(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(n)));
}

function renderList(
  node: AstElement,
  marker: '-' | 'ordered',
  ctx: RenderContext
): string {
  const items: string[] = [];
  let index = 0;
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    const isItem = child.name === 'list_item' || child.name === 'listItem' || child.name === 'li';
    if (!isItem) continue;
    const bullet = marker === '-' ? '-' : `${index + 1}.`;
    items.push(renderListItem(child, bullet, ctx));
    index++;
  }
  return items.join('\n');
}

function renderListItem(
  node: AstElement,
  bullet: string,
  ctx: RenderContext
): string {
  const blocks = renderBlocks(node.children, ctx);
  if (blocks.length === 0) return `${bullet} `;
  const [first, ...rest] = blocks;
  // Indent continuation lines so the markdown parser keeps them inside
  // the list item.
  const indent = ' '.repeat(bullet.length + 1);
  const restIndented = rest
    .join('\n\n')
    .split('\n')
    .map((l) => (l ? indent + l : l))
    .join('\n');
  return rest.length > 0 ? `${bullet} ${first}\n${restIndented}` : `${bullet} ${first}`;
}

function renderImage(node: AstElement): string {
  const src = stringAttr(node.attrs, 'src') ?? '';
  const alt = stringAttr(node.attrs, 'alt') ?? '';
  const title = stringAttr(node.attrs, 'title');
  if (!src) return '';
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

/**
 * Render a list of inline nodes (text runs and inline elements) as
 * markdown. Marks are applied in a stable order:
 *
 *   `code` (innermost) → `strong`/`em`/`s`/`u`/`sub`/`sup` → `link`
 *
 * Lossy marks (anything not in `MARK_TO_TAG`) wrap with inline HTML.
 */
function renderInlineNodes(nodes: AstNode[], ctx: RenderContext): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') {
      out += renderTextRun(n);
    } else {
      out += renderInlineElement(n, ctx);
    }
  }
  return out;
}

function renderInlineElement(node: AstElement, ctx: RenderContext): string {
  switch (node.name) {
    case 'hard_break':
    case 'hardBreak':
    case 'br':
      return '  \n';
    case 'image':
      return renderImage(node);
    case 'elementRef': {
      const display =
        stringAttr(node.attrs, 'displayText') ??
        stringAttr(node.attrs, 'originalName') ??
        stringAttr(node.attrs, 'elementId') ??
        'link';
      const href = ctx.encodeElementRefHref(node.attrs);
      return `[${escapeMarkdownLinkText(display)}](${href})`;
    }
    case 'secureLink': {
      const display =
        stringAttr(node.attrs, 'displayText') ?? stringAttr(node.attrs, 'token') ?? 'link';
      const href = stringAttr(node.attrs, 'href') ?? '';
      return `[${escapeMarkdownLinkText(display)}](${href})`;
    }
    default: {
      // Unknown inline element — most likely a lossy mark that wasn't
      // collapsed into a `marks` map by the AST parser (anything not in
      // `TAG_TO_MARK`, e.g. `<comment>`, `<text_color>`). Preserve it as
      // an inline `<span data-mark="...">` so it survives a round-trip.
      const inner = renderInlineNodes(node.children, ctx);
      const isLossyMarkLike = node.children.every(
        (c) => c.type === 'text' || (c.type === 'element' && isInlineLike(c.name))
      );
      if (!isLossyMarkLike) return inner;
      return `<span ${spanAttrString(node.name, node.attrs)}>${inner}</span>`;
    }
  }
}

function isInlineLike(name: string): boolean {
  // Conservative inline allow-list: marks-as-tags, breaks, and refs.
  return (
    name === 'hard_break' ||
    name === 'hardBreak' ||
    name === 'br' ||
    name === 'image' ||
    name === 'elementRef' ||
    name === 'secureLink' ||
    name === 'span'
  );
}

function renderTextRun(node: AstText): string {
  const text = escapeMarkdownText(node.text);
  const marks = node.marks ?? {};
  const markEntries = Object.entries(marks);
  if (markEntries.length === 0) return text;

  // Order: code → emphasis-like → link → lossy. Linkifying last keeps
  // the bracketed text containing the formatting.
  const codeMark = marks['code'];
  const linkMark = marks['link'];
  const emphasisOrder = ['strong', 'em', 's', 'u', 'sup', 'sub'] as const;
  const lossy = markEntries
    .filter(([k]) => !MARK_TO_TAG[k])
    .map(([k, v]) => [k, v] as [string, Record<string, unknown>])
    // Stable order for diffability.
    .sort((a, b) => a[0].localeCompare(b[0]));

  let result = text;

  if (codeMark) {
    // Code formatting: wrap in backticks. The text inside `<code>` is
    // already escaped above which is wrong for code spans (they preserve
    // verbatim text), so use the raw original.
    const raw = node.text;
    // Pick a backtick run longer than any backtick run inside the text.
    const longest = (raw.match(/`+/g) ?? []).reduce(
      (max, run) => Math.max(max, run.length),
      0
    );
    const fence = '`'.repeat(longest + 1);
    const pad = raw.startsWith('`') || raw.endsWith('`') ? ' ' : '';
    result = `${fence}${pad}${raw}${pad}${fence}`;
  }

  for (const m of emphasisOrder) {
    if (!marks[m]) continue;
    switch (m) {
      case 'strong':
        result = `**${result}**`;
        break;
      case 'em':
        result = `*${result}*`;
        break;
      case 's':
        result = `~~${result}~~`;
        break;
      case 'u':
        result = `<u>${result}</u>`;
        break;
      case 'sup':
        result = `<sup>${result}</sup>`;
        break;
      case 'sub':
        result = `<sub>${result}</sub>`;
        break;
    }
  }

  for (const [name, attrs] of lossy) {
    result = `<span ${spanAttrString(name, attrs)}>${result}</span>`;
  }

  if (linkMark) {
    const href = stringAttr(linkMark, 'href') ?? '';
    const title = stringAttr(linkMark, 'title');
    result = title
      ? `[${result}](${href} "${title}")`
      : `[${result}](${href})`;
  }

  return result;
}

function spanAttrString(markName: string, attrs: Record<string, unknown>): string {
  const parts = [`data-mark="${escapeAttr(markName)}"`];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    const str =
      typeof v === 'object'
        ? JSON.stringify(v)
        : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional primitive coercion
          String(v);
    parts.push(`${k}="${escapeAttr(str)}"`);
  }
  return parts.join(' ');
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

/**
 * Escape characters that have special meaning in markdown body text.
 * We deliberately do NOT escape `*`/`_` inside words (e.g. `foo_bar`)
 * because most markdown parsers don't treat them as emphasis there;
 * over-escaping makes for noisy output.
 */
function escapeMarkdownText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    // Only escape leading list/heading markers / blockquote markers.
    .replace(/^(\s*)([#>\-+])/gm, '$1\\$2')
    // Escape pipes (used in tables), brackets (used in links).
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

function escapeMarkdownLinkText(text: string): string {
  return text.replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function stringAttr(attrs: Record<string, unknown>, key: string): string | undefined {
  const v = attrs[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function collectRawText(nodes: AstNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.text;
    else out += collectRawText(n.children);
  }
  return out;
}
