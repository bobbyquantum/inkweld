import { inject, Injectable } from '@angular/core';

import {
  type DocNodeKey,
  type PageStyle,
  PUBLISH_FONT_TOKENS,
  type PublishStyles,
  type TextStyle,
} from '../../models/publish-style';
import { PublishStyleResolverService } from './publish-style-resolver.service';

/**
 * Page configuration per page-size token.
 *
 * Typst's `#set page(paper: ...)` only accepts a fixed list of named paper
 * sizes (a4, a5, us-letter, etc.). For our custom book sizes (us-trade,
 * pocket) we instead emit explicit `width:` and `height:` arguments and
 * omit the `paper:` argument entirely.
 */
type PageDims =
  | { kind: 'paper'; paper: string }
  | { kind: 'custom'; width: string; height: string };

const PAGE_TYPST: Record<PageStyle['size'], PageDims> = {
  'us-letter': { kind: 'paper', paper: '"us-letter"' },
  'us-trade': { kind: 'custom', width: '6in', height: '9in' },
  a4: { kind: 'paper', paper: '"a4"' },
  a5: { kind: 'paper', paper: '"a5"' },
  b5: { kind: 'paper', paper: '"iso-b5"' },
  pocket: { kind: 'custom', width: '4.25in', height: '6.87in' },
};

/**
 * Emits a Typst preamble for a {@link PublishStyles} tree. The preamble:
 *
 * - Sets `#set page(...)` from the page style.
 * - Sets `#set text(...)` from the base text style.
 * - Defines helper functions (`#let doc-paragraph`, `doc-heading`,
 *   `doc-blockquote`, `chapter-title`, `scene-break`, `wb-entry`,
 *   `wb-field`, ...) used by the PDF generator when emitting markup.
 *
 * Generators concatenate the preamble with the document body produced via
 * the helper functions.
 */
@Injectable({ providedIn: 'root' })
export class PublishTypstEmitterService {
  private readonly resolver = inject(PublishStyleResolverService);

  emitPreamble(styles: PublishStyles | undefined | null): string {
    const page = this.resolver.resolvePage(styles);
    const base = this.resolver.resolveNode(styles, 'paragraph').text;
    const ch = this.resolver.resolveChapterTitle(styles);
    const sb = this.resolver.resolveSceneBreak(styles);

    const out: string[] = [];

    // Page setup
    const dims = PAGE_TYPST[page.size] ?? {
      kind: 'paper' as const,
      paper: '"us-letter"',
    };
    const paperLine =
      dims.kind === 'paper'
        ? `  paper: ${dims.paper},`
        : `  width: ${dims.width},\n  height: ${dims.height},`;
    out.push(`#set page(
${paperLine}
  margin: (top: ${page.marginTop}in, bottom: ${page.marginBottom}in, inside: ${page.marginInside}in, outside: ${page.marginOutside}in),
  numbering: ${page.pageNumbers === 'none' ? 'none' : page.pageNumbers === 'roman' ? '"i"' : '"1"'},
)`);

    // Base text
    out.push(`#set text(
  font: ${typstFontList(base.font)},
  size: ${base.fontSize ?? 11}pt,
  fill: ${typstColor(base.color)},
)`);

    // Paragraph defaults
    const indent = base.firstLineIndent ?? 1.25;
    // CSS line-height is a unitless multiplier on font-size that includes
    // the glyph box; Typst `leading` is the additional gap inserted
    // between consecutive lines, on top of the glyph box. Convert by
    // subtracting 1 (clamped at 0): line-height 1.0 -> leading 0em
    // (single spaced, lines touch), 1.5 -> 0.5em, 2.0 -> 1em (double).
    const lineHeight = base.lineHeight ?? 1.45;
    const leading = Math.max(0, lineHeight - 1);
    out.push(`#set par(
  leading: ${leading.toFixed(2)}em,
  first-line-indent: (amount: ${indent}em, all: false),
  justify: ${base.align === 'justify' ? 'true' : 'false'},
)`);

    // Helper: heading levels 1-6
    for (
      let lvl = 1 as 1 | 2 | 3 | 4 | 5 | 6;
      lvl <= 6;
      lvl = (lvl + 1) as 1 | 2 | 3 | 4 | 5 | 6
    ) {
      const key = `heading${lvl}` as DocNodeKey;
      const r = this.resolver.resolveNode(styles, key);
      out.push(
        `#let doc-heading-${lvl}(body) = block(above: ${r.box?.marginTop ?? 12}pt, below: ${r.box?.marginBottom ?? 6}pt)[#text(${typstTextArgs(r.text)})[#body]]`
      );
    }

    // Helper: paragraph (uses default par settings; provided for symmetry)
    out.push(`#let doc-paragraph(body) = par[#body]`);

    // Helper: blockquote
    const bq = this.resolver.resolveNode(styles, 'blockquote');
    out.push(
      `#let doc-blockquote(body) = block(inset: (left: ${bq.box?.marginLeft ?? 24}pt, right: ${bq.box?.marginRight ?? 24}pt), above: ${bq.box?.marginTop ?? 10}pt, below: ${bq.box?.marginBottom ?? 10}pt)[#text(${typstTextArgs(bq.text)})[#body]]`
    );

    // Helper: code block
    const cb = this.resolver.resolveNode(styles, 'codeBlock');
    out.push(
      `#let doc-code-block(body) = block(fill: ${typstColor(cb.box?.background ?? '#f5f5f5')}, inset: ${cb.box?.paddingLeft ?? 12}pt, above: ${cb.box?.marginTop ?? 10}pt, below: ${cb.box?.marginBottom ?? 10}pt, radius: ${cb.box?.borderRadius ?? 4}pt)[#text(${typstTextArgs(cb.text)})[#raw(body)]]`
    );

    // Helper: chapter title
    out.push(
      `#let chapter-title(num: none, body) = {
${ch.pageBreakBefore ? '  pagebreak(weak: true)\n' : ''}  block(above: ${ch.box.marginTop ?? 48}pt, below: ${ch.box.marginBottom ?? 24}pt)[
    #if num != none [#text(${typstTextArgs(ch.numberPrefix)})[#num]]
    #text(${typstTextArgs(ch.text)})[#body]
  ]
}`
    );

    // Helper: scene break
    out.push(
      `#let scene-break(text-content) = block(above: ${sb.box.marginTop ?? 18}pt, below: ${sb.box.marginBottom ?? 18}pt)[#align(center)[#text(${typstTextArgs(sb.text)})[#text-content]]]`
    );

    // Helper: worldbuilding entry + field
    const wb = this.resolver.resolveWorldbuildingEntry(styles, undefined);
    out.push(
      `#let wb-entry(title, body) = block(stroke: ${wb.entryBox.borderWidth ? `${wb.entryBox.borderWidth}pt + ${typstColor(wb.entryBox.borderColor ?? '#888')}` : 'none'}, inset: ${wb.entryBox.paddingLeft ?? 12}pt, above: ${wb.entryBox.marginTop ?? 12}pt, below: ${wb.entryBox.marginBottom ?? 12}pt, radius: ${wb.entryBox.borderRadius ?? 4}pt)[
  #text(${typstTextArgs(wb.entryTitle)})[#title]
  #v(4pt)
  #body
]`
    );
    out.push(
      `#let wb-tab(title, body) = {
  block(above: 8pt, below: 4pt)[#text(${typstTextArgs(wb.tabHeading)})[#title]]
  body
}`
    );
    out.push(
      `#let wb-field(label, value) = grid(columns: (auto, 1fr), column-gutter: 8pt, [#text(${typstTextArgs(wb.fieldLabel)})[#label]], [#text(${typstTextArgs(wb.fieldValue)})[#value]])`
    );
    out.push(
      `#let wb-section-title(body) = block(above: 24pt, below: 12pt)[#text(${typstTextArgs(styles?.worldbuilding?.sectionTitle ?? {})})[#body]]`
    );

    return out.join('\n\n') + '\n\n';
  }
}

function typstFontList(token: TextStyle['font']): string {
  if (!token) return `("${PUBLISH_FONT_TOKENS.serifClassic.typst}",)`;
  const primary =
    PUBLISH_FONT_TOKENS[token]?.typst ?? PUBLISH_FONT_TOKENS.serifClassic.typst;
  return `("${primary}",)`;
}

function typstColor(hexOrName: string | undefined): string {
  if (!hexOrName) return 'rgb("#111111")';
  if (hexOrName.startsWith('#')) return `rgb("${hexOrName}")`;
  return `rgb("${hexOrName}")`;
}

function typstTextArgs(s: TextStyle): string {
  const parts: string[] = [];
  if (s.font) parts.push(`font: ${typstFontList(s.font)}`);
  if (s.fontSize !== undefined) parts.push(`size: ${s.fontSize}pt`);
  if (s.weight) parts.push(`weight: "${typstWeight(s.weight)}"`);
  if (s.style === 'italic') parts.push(`style: "italic"`);
  if (s.color) parts.push(`fill: ${typstColor(s.color)}`);
  if (s.transform === 'uppercase') parts.push(`tracking: 0.05em`);
  return parts.join(', ');
}

function typstWeight(w: NonNullable<TextStyle['weight']>): string {
  switch (w) {
    case 'light':
      return 'light';
    case 'medium':
      return 'medium';
    case 'semibold':
      return 'semibold';
    case 'bold':
      return 'bold';
    default:
      return 'regular';
  }
}
