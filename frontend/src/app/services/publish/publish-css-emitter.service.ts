import { inject, Injectable } from '@angular/core';

import {
  type DocNodeKey,
  type MarkKey,
  PUBLISH_FONT_TOKENS,
  type PublishStyles,
  type TextStyle,
} from '../../models/publish-style';
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
    const out: string[] = [];
    out.push(this.baseHtmlReset());
    out.push(this.bodyRule(styles));
    out.push(this.nodeRules(styles, /* asTag */ true));
    out.push(this.markRules(styles));
    out.push(this.structureRules(styles));
    out.push(this.worldbuildingRules(styles));
    return out.filter(Boolean).join('\n\n');
  }

  emitEpubStylesheet(styles: PublishStyles | undefined | null): string {
    const out: string[] = [];
    out.push(this.bodyRule(styles, /* epub */ true));
    out.push(this.nodeRules(styles, /* asTag */ true, /* epub */ true));
    out.push(this.markRules(styles, /* epub */ true));
    out.push(this.structureRules(styles, /* epub */ true));
    out.push(this.worldbuildingRules(styles, /* epub */ true));
    return out.filter(Boolean).join('\n\n');
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

    const rules: string[] = [];
    rules.push(
      `.ink-chapter-title { ${textStyleDecls(ch.text, { epub })
        .concat(boxStyleDecls(ch.box, { epub }))
        .concat(ch.pageBreakBefore ? ['page-break-before: always;'] : [])
        .join(' ')} }`
    );
    rules.push(
      `.ink-chapter-number { ${textStyleDecls(ch.numberPrefix, { epub }).join(' ')} display: block; }`
    );
    rules.push(
      `.ink-scene-break { ${textStyleDecls(sb.text, { epub })
        .concat(boxStyleDecls(sb.box, { epub }))
        .join(' ')} }`
    );
    rules.push(
      `.ink-toc-title { ${textStyleDecls(toc.title, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-toc-entry { ${textStyleDecls(toc.entry, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-toc-entry[data-level="2"] { padding-left: ${toc.indentPerLevel}em; }`
    );
    rules.push(
      `.ink-toc-entry[data-level="3"] { padding-left: ${toc.indentPerLevel * 2}em; }`
    );
    rules.push(
      `.ink-frontmatter-title { ${textStyleDecls(fm.title, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-frontmatter { ${textStyleDecls(fm.body, { epub })
        .concat(boxStyleDecls(fm.box, { epub }))
        .join(' ')} }`
    );
    rules.push(
      `.ink-backmatter-title { ${textStyleDecls(bm.title, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-backmatter { ${textStyleDecls(bm.body, { epub })
        .concat(boxStyleDecls(bm.box, { epub }))
        .join(' ')} }`
    );
    rules.push('.ink-page-break { page-break-after: always; }');
    return rules.join('\n');
  }

  private worldbuildingRules(
    styles: PublishStyles | undefined | null,
    epub = false
  ): string {
    const wb = this.resolver.resolveWorldbuildingEntry(styles, undefined);
    const rules: string[] = [];
    rules.push(
      `.ink-wb-section-title { ${textStyleDecls(
        textStyleFromWorldbuildingSection(styles),
        { epub }
      ).join(' ')} }`
    );
    rules.push(
      `.ink-wb-entry { ${boxStyleDecls(wb.entryBox, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-wb-entry-title { ${textStyleDecls(wb.entryTitle, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-wb-tab-heading { ${textStyleDecls(wb.tabHeading, { epub }).join(' ')} }`
    );
    rules.push(
      `.ink-wb-field-label { ${textStyleDecls(wb.fieldLabel, { epub }).join(' ')} display: inline-block; min-width: 8em; margin-right: 0.5em; }`
    );
    rules.push(
      `.ink-wb-field-value { ${textStyleDecls(wb.fieldValue, { epub }).join(' ')} }`
    );
    // Layout-specific tweaks
    rules.push(
      `.ink-wb-entry.ink-wb-layout-compact { border-width: 0; padding: 4pt 0; }`
    );
    rules.push(
      `.ink-wb-entry.ink-wb-layout-detail { border-width: 0; padding: 16pt 0; }`
    );
    rules.push(
      `.ink-wb-entry.ink-wb-layout-appendix { border-width: 0; padding: 4pt 0; page-break-inside: avoid; }`
    );
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
