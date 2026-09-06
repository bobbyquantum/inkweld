import { inject, Injectable } from '@angular/core';
import {
  type DocNodeKey,
  type MarkKey,
  PUBLISH_FONT_TOKENS,
  type PublishStyles,
  type TextStyle,
} from '@models/publish-style';

import {
  PublishStyleResolverService,
  type ResolvedNodeStyle,
} from './publish-style-resolver.service';

/** Document node keys we emit dedicated rules for. */
const NODE_KEYS: DocNodeKey[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'horizontalRule',
  'image',
  'figure',
  'caption',
];

const NODE_TAGS: Record<DocNodeKey, string> = {
  paragraph: 'p',
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  heading4: 'h4',
  heading5: 'h5',
  heading6: 'h6',
  blockquote: 'blockquote',
  codeBlock: 'pre',
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li',
  horizontalRule: 'hr',
  image: 'img',
  figure: 'figure',
  caption: 'figcaption',
};

const MARK_KEYS: MarkKey[] = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'subscript',
  'superscript',
];

const MARK_TAGS: Record<MarkKey, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  link: 'a',
  subscript: 'sub',
  superscript: 'sup',
  comment: 'span',
};

/**
 * Emits format-specific CSS for a {@link PublishStyles} tree.
 *
 * - {@link emitHtmlStylesheet} produces a full document stylesheet for the
 *   single-file HTML output; uses class selectors (`.ink-doc-paragraph`,
 *   `.ink-mark-bold`, `.ink-wb-entry`) so HTML output is self-contained and
 *   readable.
 * - {@link emitEpubStylesheet} produces a conservative subset that EPUB
 *   readers reliably honor (no flexbox, no CSS variables, no @page where it
 *   would cause issues with poor renderers).
 */
@Injectable({ providedIn: 'root' })
export class PublishCssEmitterService {
  private readonly resolver = inject(PublishStyleResolverService);

  emitHtmlStylesheet(styles: PublishStyles | undefined | null): string {
    return [
      this.baseHtmlReset(),
      this.bodyRule(styles),
      this.nodeRules(styles, /* asTag */ true),
      this.markRules(styles),
      this.structureRules(styles),
      this.worldbuildingRules(styles),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  emitEpubStylesheet(styles: PublishStyles | undefined | null): string {
    return [
      this.bodyRule(styles, /* epub */ true),
      this.nodeRules(styles, /* asTag */ true, /* epub */ true),
      this.markRules(styles, /* epub */ true),
      this.structureRules(styles, /* epub */ true),
      this.worldbuildingRules(styles, /* epub */ true),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private baseHtmlReset(): string {
    return `*,*::before,*::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
img { max-width: 100%; height: auto; }`;
  }

  private bodyRule(
    styles: PublishStyles | undefined | null,
    epub = false
  ): string {
    const base = this.resolver.resolveNode(styles, 'paragraph');
    const baseText = this.resolver.resolveChapterTitle(styles).text; // share font token
    const fontStack = fontFamilyForToken(baseText.font);
    const indent = epub
      ? ''
      : '  max-width: 800px;\n  margin: 0 auto;\n  padding: 2rem;\n';
    return `body {
  font-family: ${fontStack};
  font-size: ${base.text.fontSize ?? 11}pt;
  line-height: ${base.text.lineHeight ?? 1.45};
  color: ${base.text.color ?? '#111'};
${indent}}`;
  }

  private nodeRules(
    styles: PublishStyles | undefined | null,
    asTag: boolean,
    epub = false
  ): string {
    return NODE_KEYS.map(k => this.nodeRule(styles, k, asTag, epub))
      .filter(Boolean)
      .join('\n');
  }

  private nodeRule(
    styles: PublishStyles | undefined | null,
    key: DocNodeKey,
    asTag: boolean,
    epub: boolean
  ): string {
    const resolved = this.resolver.resolveNode(styles, key);
    const selector = asTag
      ? `${NODE_TAGS[key]}, .ink-doc-${kebab(key)}`
      : `.ink-doc-${kebab(key)}`;
    const decls = textStyleDecls(resolved.text, { epub })
      .concat(boxStyleDecls(resolved.box ?? {}, { epub }))
      .filter(Boolean);
    if (decls.length === 0) return '';
    return `${selector} { ${decls.join(' ')} }`;
  }

  private markRules(
    styles: PublishStyles | undefined | null,
    epub = false
  ): string {
    return MARK_KEYS.map(m => {
      const ts = this.resolver.resolveMark(styles, m);
      const decls = textStyleDecls(ts, { epub });
      const selector = `${MARK_TAGS[m]}, .ink-mark-${kebab(m)}`;
      if (decls.length === 0) return '';
      return `${selector} { ${decls.join(' ')} }`;
    })
      .filter(Boolean)
      .join('\n');
  }

  private structureRules(
    styles: PublishStyles | undefined | null,
    epub = false
  ): string {
    const ch = this.resolver.resolveChapterTitle(styles);
    const sb = this.resolver.resolveSceneBreak(styles);
    const toc = this.resolver.resolveToc(styles);
    const fm = this.resolver.resolveFrontmatter(styles);
    const bm = this.resolver.resolveBackmatter(styles);

    const rules: string[] = [
      `.ink-chapter-title { ${textStyleDecls(ch.text, { epub })
        .concat(boxStyleDecls(ch.box, { epub }))
        .concat(ch.pageBreakBefore ? ['page-break-before: always;'] : [])
        .join(' ')} }`,
      `.ink-chapter-number { ${textStyleDecls(ch.numberPrefix, { epub }).join(' ')} display: block; }`,
      `.ink-scene-break { ${textStyleDecls(sb.text, { epub })
        .concat(boxStyleDecls(sb.box, { epub }))
        .join(' ')} }`,
      `.ink-toc-title { ${textStyleDecls(toc.title, { epub }).join(' ')} }`,
      `.ink-toc-entry { ${textStyleDecls(toc.entry, { epub }).join(' ')} }`,
      `.ink-toc-entry[data-level="2"] { padding-left: ${toc.indentPerLevel}em; }`,
      `.ink-toc-entry[data-level="3"] { padding-left: ${toc.indentPerLevel * 2}em; }`,
      `.ink-frontmatter-title { ${textStyleDecls(fm.title, { epub }).join(' ')} }`,
      `.ink-frontmatter { ${textStyleDecls(fm.body, { epub })
        .concat(boxStyleDecls(fm.box, { epub }))
        .join(' ')} }`,
      `.ink-backmatter-title { ${textStyleDecls(bm.title, { epub }).join(' ')} }`,
      `.ink-backmatter { ${textStyleDecls(bm.body, { epub })
        .concat(boxStyleDecls(bm.box, { epub }))
        .join(' ')} }`,
      '.ink-page-break { page-break-after: always; }',
      // Tables are not yet part of the user-configurable publish styles,
      // so they get a neutral built-in treatment that reads correctly in
      // both HTML output and e-readers.
      '.ink-doc-table { border-collapse: collapse; width: 100%; margin: 1em 0; }',
      '.ink-doc-table-cell, .ink-doc-table-header { border: 1px solid #999; padding: 0.35em 0.6em; vertical-align: top; }',
      '.ink-doc-table-header { font-weight: bold; text-align: left; }',
      '.ink-doc-align-left { text-align: left; }',
      '.ink-doc-align-center { text-align: center; }',
      '.ink-doc-align-right { text-align: right; }',
      ...Array.from(
        { length: 8 },
        (_, i) => `.ink-doc-indent-${i + 1} { margin-left: ${(i + 1) * 2}em; }`
      ),
      '.ink-doc-code-block { overflow-x: auto; white-space: pre; }',
      '.ink-doc-code-block code { font-family: inherit; }',
      '.ink-doc-image-missing { display: inline-block; padding: 0.2em 0.5em; border: 1px dashed #999; color: #666; font-size: 0.85em; }',
      '.ink-backmatter-title { margin-top: 2em; }',
    ];
    return rules.join('\n');
  }

  private worldbuildingRules(
    styles: PublishStyles | undefined | null,
    epub = false
  ): string {
    const wb = this.resolver.resolveWorldbuildingEntry(styles, undefined);
    const rules: string[] = [
      `.ink-wb-section-title { ${textStyleDecls(
        textStyleFromWorldbuildingSection(styles),
        { epub }
      ).join(' ')} }`,
      `.ink-wb-entry { ${boxStyleDecls(wb.entryBox, { epub }).join(' ')} }`,
      `.ink-wb-entry-title { ${textStyleDecls(wb.entryTitle, { epub }).join(' ')} }`,
      `.ink-wb-tab-heading { ${textStyleDecls(wb.tabHeading, { epub }).join(' ')} }`,
      `.ink-wb-field-label { ${textStyleDecls(wb.fieldLabel, { epub }).join(' ')} display: inline-block; min-width: 8em; margin-right: 0.5em; }`,
      `.ink-wb-field-value { ${textStyleDecls(wb.fieldValue, { epub }).join(' ')} }`,
      // Entry chrome: header row, schema badge, icons (hidden until the
      // icon font is confirmed loaded), authored backgrounds, field grid.
      '.ink-wb-entry { border-radius: 12px; overflow: hidden; }',
      '.ink-wb-entry-header { display: flex; align-items: baseline; gap: 0.5em; flex-wrap: wrap; }',
      '.ink-wb-entry-header .ink-wb-entry-title { margin: 0; }',
      '.ink-wb-entry-schema { font-size: 0.75em; letter-spacing: 0.04em; text-transform: uppercase; color: #666; border: 1px solid #ccc; border-radius: 999px; padding: 0.1em 0.6em; }',
      '.ink-wb-icon { display: inline-block; width: 1.25em; height: 1.25em; vertical-align: -0.25em; margin-right: 0.35em; }',
      '.ink-wb-icon svg { display: block; width: 100%; height: 100%; fill: currentColor; }',
      '.ink-wb-entry-image { display: block; max-height: 420px; object-fit: cover; border-radius: 8px; margin: 0.75em 0; }',
      '.ink-wb-has-bg { background: var(--ink-wb-bg); background-size: cover; background-position: center; padding: 1em; }',
      '.ink-wb-has-bg .ink-wb-tab, .ink-wb-has-bg .ink-wb-entry-header, .ink-wb-has-bg .ink-wb-entry-description { background: rgba(255, 255, 255, 0.85); border-radius: 8px; padding: 0.6em 0.8em; }',
      '.ink-wb-has-bg-image .ink-wb-tab, .ink-wb-has-bg-image .ink-wb-entry-header, .ink-wb-has-bg-image .ink-wb-entry-description { -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }',
      '.ink-wb-tab { margin-top: 0.75em; }',
      '.ink-wb-fields { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 0.5em 1.25em; margin: 0; }',
      '.ink-wb-field { grid-column: span 12; min-width: 0; }',
      '.ink-wb-field .ink-wb-field-label { display: block; min-width: 0; margin: 0; }',
      '.ink-wb-field .ink-wb-field-value { margin: 0.15em 0 0; overflow-wrap: anywhere; }',
      '.ink-wb-field-type-textarea .ink-wb-field-value { white-space: pre-line; }',
      ...Array.from(
        { length: 12 },
        (_, i) => `.ink-wb-span-${i + 1} { grid-column: span ${i + 1}; }`
      ),
      '@media (max-width: 600px) { .ink-wb-field { grid-column: span 12 !important; } }',
      // Layout-specific tweaks
      `.ink-wb-entry.ink-wb-layout-compact { border-width: 0; padding: 4pt 0; }`,
      `.ink-wb-entry.ink-wb-layout-detail { border-width: 0; padding: 16pt 0; }`,
      `.ink-wb-entry.ink-wb-layout-appendix { border-width: 0; padding: 4pt 0; page-break-inside: avoid; }`,
    ];
    return rules.join('\n');
  }
}

function textStyleFromWorldbuildingSection(
  styles: PublishStyles | undefined | null
): TextStyle {
  return styles?.worldbuilding?.sectionTitle ?? {};
}

/**
 * Produces CSS declarations for a TextStyle. Skips undefined fields.
 * `epub` mode omits properties known to render poorly on legacy readers.
 */
function textStyleDecls(s: TextStyle, opts: { epub: boolean }): string[] {
  const out: string[] = [];
  if (s.font) out.push(`font-family: ${fontFamilyForToken(s.font)};`);
  if (s.fontSize !== undefined) out.push(`font-size: ${s.fontSize}pt;`);
  if (s.weight) out.push(`font-weight: ${cssWeight(s.weight)};`);
  if (s.style) out.push(`font-style: ${s.style};`);
  if (s.lineHeight !== undefined) out.push(`line-height: ${s.lineHeight};`);
  if (s.letterSpacing !== undefined)
    out.push(`letter-spacing: ${s.letterSpacing}em;`);
  if (s.align) out.push(`text-align: ${s.align};`);
  if (s.transform) out.push(`text-transform: ${s.transform};`);
  if (s.decoration) out.push(`text-decoration: ${s.decoration};`);
  if (s.color) out.push(`color: ${s.color};`);
  if (s.firstLineIndent !== undefined && !opts.epub)
    out.push(`text-indent: ${s.firstLineIndent}em;`);
  if (s.firstLineIndent !== undefined && opts.epub)
    out.push(`text-indent: ${s.firstLineIndent}em;`);
  return out;
}

function boxStyleDecls(
  b: NonNullable<ResolvedNodeStyle['box']>,
  opts: { epub: boolean }
): string[] {
  const out: string[] = [];
  if (b.marginTop !== undefined) out.push(`margin-top: ${b.marginTop}pt;`);
  if (b.marginBottom !== undefined)
    out.push(`margin-bottom: ${b.marginBottom}pt;`);
  if (b.marginLeft !== undefined) out.push(`margin-left: ${b.marginLeft}pt;`);
  if (b.marginRight !== undefined)
    out.push(`margin-right: ${b.marginRight}pt;`);
  if (b.paddingTop !== undefined) out.push(`padding-top: ${b.paddingTop}pt;`);
  if (b.paddingBottom !== undefined)
    out.push(`padding-bottom: ${b.paddingBottom}pt;`);
  if (b.paddingLeft !== undefined)
    out.push(`padding-left: ${b.paddingLeft}pt;`);
  if (b.paddingRight !== undefined)
    out.push(`padding-right: ${b.paddingRight}pt;`);
  if (b.background) out.push(`background: ${b.background};`);
  if (b.borderWidth !== undefined && b.borderWidth > 0)
    out.push(`border: ${b.borderWidth}pt solid ${b.borderColor ?? '#888'};`);
  if (b.borderRadius !== undefined && !opts.epub)
    out.push(`border-radius: ${b.borderRadius}pt;`);
  return out;
}

function fontFamilyForToken(token: TextStyle['font']): string {
  if (!token) return PUBLISH_FONT_TOKENS.serifClassic.css;
  return (
    PUBLISH_FONT_TOKENS[token]?.css ?? PUBLISH_FONT_TOKENS.serifClassic.css
  );
}

function cssWeight(w: NonNullable<TextStyle['weight']>): string {
  switch (w) {
    case 'light':
      return '300';
    case 'normal':
      return '400';
    case 'medium':
      return '500';
    case 'semibold':
      return '600';
    case 'bold':
      return '700';
    default:
      return '400';
  }
}

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}
