import { Injectable } from '@angular/core';
import {
  DEFAULT_BASE_TEXT,
  DEFAULT_DOC_NODE_STYLES,
  DEFAULT_MARK_STYLES,
  DEFAULT_PAGE_STYLE,
  DEFAULT_STRUCTURE_STYLES,
  DEFAULT_WORLDBUILDING_STYLES,
  type DocNodeKey,
  type DocNodeStyles,
  type MarkKey,
  type PublishStyles,
  type TextStyle,
  type WorldbuildingLayout,
  type WorldbuildingSchemaOverride,
  type WorldbuildingStyles,
} from '@models/publish-style';

/**
 * Resolved style for a single ProseMirror node, with the inherited base text
 * style flattened into it. The {@link PublishCssEmitterService} and
 * {@link PublishTypstEmitterService} consume the resolved shape.
 */
export interface ResolvedNodeStyle {
  text: TextStyle;
  box: NonNullable<DocNodeStyles[DocNodeKey]>['box'];
}

/**
 * Resolved style for a worldbuilding entry.
 */
export interface ResolvedWorldbuildingEntryStyle {
  layout: WorldbuildingLayout;
  entryTitle: TextStyle;
  entryBox: NonNullable<WorldbuildingStyles['entryBox']>;
  tabHeading: TextStyle;
  fieldLabel: TextStyle;
  fieldValue: TextStyle;
  /** Lookup field-specific overrides by dotted key. */
  fieldOverrides: NonNullable<WorldbuildingSchemaOverride['fields']>;
  /** Lookup tab-specific overrides by tab id. */
  tabOverrides: NonNullable<WorldbuildingSchemaOverride['tabs']>;
}

/**
 * Maps ProseMirror node names (snake_case or camelCase, with alternative
 * spellings) to the canonical {@link DocNodeKey} we style by.
 */
const NODE_KEY_ALIASES: Record<string, DocNodeKey> = {
  paragraph: 'paragraph',
  blockquote: 'blockquote',
  code_block: 'codeBlock',
  codeblock: 'codeBlock',
  bullet_list: 'bulletList',
  bulletlist: 'bulletList',
  ordered_list: 'orderedList',
  orderedlist: 'orderedList',
  list_item: 'listItem',
  listitem: 'listItem',
  horizontal_rule: 'horizontalRule',
  horizontalrule: 'horizontalRule',
  image: 'image',
  figure: 'figure',
  caption: 'caption',
};

/**
 * Resolves canonical, format-agnostic styles from a {@link PublishStyles}
 * tree. Generators consume the resolved values rather than reading the raw
 * style maps so heading levels, mark aliases, and worldbuilding overrides
 * are normalized in one place.
 */
@Injectable({ providedIn: 'root' })
export class PublishStyleResolverService {
  /**
   * Returns the canonical node key for a raw PM node name. Supports
   * `heading` with a `level` attribute and the snake_case/camelCase aliases.
   */
  resolveNodeKey(name: string, level?: number): DocNodeKey | null {
    const normalized = name?.toLowerCase?.() ?? '';
    if (!normalized) return null;
    if (normalized === 'heading') {
      const lvl = clamp(level ?? 1, 1, 6);
      return `heading${lvl}` as DocNodeKey;
    }
    return NODE_KEY_ALIASES[normalized] ?? null;
  }

  /**
   * Returns the resolved style for a node, merging base text + default
   * node style + plan override.
   */
  resolveNode(
    styles: PublishStyles | undefined | null,
    key: DocNodeKey
  ): ResolvedNodeStyle {
    const base = mergeText(DEFAULT_BASE_TEXT, styles?.baseText ?? {});
    const defaultNode = DEFAULT_DOC_NODE_STYLES[key] ?? {};
    const overrideNode = styles?.nodes?.[key] ?? {};
    return {
      text: mergeText(
        base,
        mergeText(defaultNode.text ?? {}, overrideNode.text ?? {})
      ),
      box: { ...(defaultNode.box ?? {}), ...(overrideNode.box ?? {}) },
    };
  }

  /**
   * Returns the resolved style for a mark.
   */
  resolveMark(
    styles: PublishStyles | undefined | null,
    key: MarkKey
  ): TextStyle {
    return mergeText(
      DEFAULT_MARK_STYLES[key] ?? {},
      styles?.marks?.[key] ?? {}
    );
  }

  /**
   * Returns the resolved page style.
   */
  resolvePage(styles: PublishStyles | undefined | null) {
    return { ...DEFAULT_PAGE_STYLE, ...(styles?.page ?? {}) };
  }

  /**
   * Resolved chapter title style (text + box + numberPrefix + pageBreak flag).
   */
  resolveChapterTitle(styles: PublishStyles | undefined | null) {
    const base = mergeText(DEFAULT_BASE_TEXT, styles?.baseText ?? {});
    const defaults = DEFAULT_STRUCTURE_STYLES.chapterTitle;
    const override = styles?.structure?.chapterTitle ?? defaults;
    return {
      text: mergeText(base, mergeText(defaults.text, override.text ?? {})),
      box: { ...defaults.box, ...(override.box ?? {}) },
      numberPrefix: mergeText(
        defaults.numberPrefix ?? {},
        override.numberPrefix ?? {}
      ),
      pageBreakBefore: override.pageBreakBefore ?? defaults.pageBreakBefore,
    };
  }

  resolveSceneBreak(styles: PublishStyles | undefined | null) {
    const base = mergeText(DEFAULT_BASE_TEXT, styles?.baseText ?? {});
    const defaults = DEFAULT_STRUCTURE_STYLES.sceneBreak;
    const override = styles?.structure?.sceneBreak ?? defaults;
    return {
      text: mergeText(base, mergeText(defaults.text, override.text ?? {})),
      box: { ...defaults.box, ...(override.box ?? {}) },
    };
  }

  resolveToc(styles: PublishStyles | undefined | null) {
    const base = mergeText(DEFAULT_BASE_TEXT, styles?.baseText ?? {});
    const defaults = DEFAULT_STRUCTURE_STYLES.toc;
    const override = styles?.structure?.toc ?? defaults;
    return {
      title: mergeText(base, mergeText(defaults.title, override.title ?? {})),
      entry: mergeText(base, mergeText(defaults.entry, override.entry ?? {})),
      indentPerLevel: override.indentPerLevel ?? defaults.indentPerLevel,
    };
  }

  resolveFrontmatter(styles: PublishStyles | undefined | null) {
    return this.resolveMatter(styles, 'frontmatter');
  }

  resolveBackmatter(styles: PublishStyles | undefined | null) {
    return this.resolveMatter(styles, 'backmatter');
  }

  private resolveMatter(
    styles: PublishStyles | undefined | null,
    which: 'frontmatter' | 'backmatter'
  ) {
    const base = mergeText(DEFAULT_BASE_TEXT, styles?.baseText ?? {});
    const defaults = DEFAULT_STRUCTURE_STYLES[which];
    const override = styles?.structure?.[which] ?? defaults;
    return {
      title: mergeText(base, mergeText(defaults.title, override.title ?? {})),
      body: mergeText(base, mergeText(defaults.body, override.body ?? {})),
      box: { ...defaults.box, ...(override.box ?? {}) },
    };
  }

  /**
   * Resolves the style applied to a single worldbuilding entry, merging the
   * global worldbuilding style with the per-schema override (when present)
   * and the layout requested by the publish item.
   */
  resolveWorldbuildingEntry(
    styles: PublishStyles | undefined | null,
    schemaId: string | undefined,
    requestedLayout?: WorldbuildingLayout
  ): ResolvedWorldbuildingEntryStyle {
    const base = mergeText(DEFAULT_BASE_TEXT, styles?.baseText ?? {});
    const defaults = DEFAULT_WORLDBUILDING_STYLES;
    const wb: WorldbuildingStyles = {
      ...defaults,
      ...(styles?.worldbuilding ?? {}),
    };
    const schemaOverride: WorldbuildingSchemaOverride | undefined = schemaId
      ? wb.schemas?.[schemaId]
      : undefined;

    return {
      layout:
        requestedLayout ?? schemaOverride?.layout ?? wb.defaultLayout ?? 'card',
      entryTitle: mergeText(
        base,
        mergeText(wb.entryTitle, schemaOverride?.entryTitle ?? {})
      ),
      entryBox: { ...wb.entryBox, ...(schemaOverride?.entryBox ?? {}) },
      tabHeading: mergeText(base, wb.tabHeading),
      fieldLabel: mergeText(base, wb.fieldLabel),
      fieldValue: mergeText(base, wb.fieldValue),
      fieldOverrides: schemaOverride?.fields ?? {},
      tabOverrides: schemaOverride?.tabs ?? {},
    };
  }
}

/**
 * Shallow-merges TextStyle with override winning. Undefined override values
 * fall through to the base.
 */
function mergeText(base: TextStyle, override: TextStyle): TextStyle {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(override) as (keyof TextStyle)[]) {
    const v = override[k];
    if (v !== undefined) {
      out[k as string] = v;
    }
  }
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
