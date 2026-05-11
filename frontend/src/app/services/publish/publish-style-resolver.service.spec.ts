import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultPublishStyles,
  DEFAULT_BASE_TEXT,
  DEFAULT_PAGE_STYLE,
  DEFAULT_STRUCTURE_STYLES,
  DEFAULT_WORLDBUILDING_STYLES,
  type PublishStyles,
} from '@models/publish-style';
import { beforeEach, describe, expect, it } from 'vitest';

import { PublishStyleResolverService } from './publish-style-resolver.service';

describe('PublishStyleResolverService', () => {
  let service: PublishStyleResolverService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        PublishStyleResolverService,
      ],
    });
    service = TestBed.inject(PublishStyleResolverService);
  });

  describe('resolveNodeKey', () => {
    it('returns null for empty / nullish names', () => {
      expect(service.resolveNodeKey('')).toBeNull();
      expect(service.resolveNodeKey(undefined as unknown as string)).toBeNull();
    });

    it('returns headingN for heading with clamped level', () => {
      expect(service.resolveNodeKey('heading')).toBe('heading1');
      expect(service.resolveNodeKey('Heading', 3)).toBe('heading3');
      expect(service.resolveNodeKey('heading', 0)).toBe('heading1');
      expect(service.resolveNodeKey('heading', 99)).toBe('heading6');
    });

    it('maps snake_case and camelCase aliases', () => {
      expect(service.resolveNodeKey('paragraph')).toBe('paragraph');
      expect(service.resolveNodeKey('code_block')).toBe('codeBlock');
      expect(service.resolveNodeKey('codeBlock')).toBe('codeBlock');
      expect(service.resolveNodeKey('bullet_list')).toBe('bulletList');
      expect(service.resolveNodeKey('bulletList')).toBe('bulletList');
      expect(service.resolveNodeKey('ordered_list')).toBe('orderedList');
      expect(service.resolveNodeKey('list_item')).toBe('listItem');
      expect(service.resolveNodeKey('horizontal_rule')).toBe('horizontalRule');
      expect(service.resolveNodeKey('IMAGE')).toBe('image');
    });

    it('returns null for unknown node names', () => {
      expect(service.resolveNodeKey('not_a_node')).toBeNull();
      expect(service.resolveNodeKey('Custom')).toBeNull();
    });
  });

  describe('resolveNode', () => {
    it('falls back to base + defaults when styles is null/undefined', () => {
      const a = service.resolveNode(null, 'paragraph');
      const b = service.resolveNode(undefined, 'paragraph');
      expect(a.text.font).toBe(DEFAULT_BASE_TEXT.font);
      expect(b.text.font).toBe(DEFAULT_BASE_TEXT.font);
      expect(a.box).toBeDefined();
    });

    it('layers base text < default node < plan override', () => {
      const styles = createDefaultPublishStyles();
      styles.baseText.fontSize = 11;
      styles.nodes.paragraph = {
        text: { firstLineIndent: 0.25 },
        box: { marginTop: 4 },
      };
      const resolved = service.resolveNode(styles, 'paragraph');
      expect(resolved.text.fontSize).toBe(11);
      expect(resolved.text.firstLineIndent).toBe(0.25);
      expect(resolved.box?.marginTop).toBe(4);
    });

    it('handles missing default node entries (returns just base merged with override)', () => {
      const styles = createDefaultPublishStyles();
      // heading6 may not have explicit default override; resolution must still succeed.
      const resolved = service.resolveNode(styles, 'heading6');
      expect(resolved.text).toBeDefined();
      expect(resolved.box).toBeDefined();
    });
  });

  describe('resolveMark', () => {
    it('returns defaults when no override', () => {
      const styles = createDefaultPublishStyles();
      const resolved = service.resolveMark(styles, 'bold');
      expect(resolved.weight).toBe('bold');
    });

    it('override wins, undefined values fall through', () => {
      const styles = createDefaultPublishStyles();
      styles.marks['bold'] = { weight: undefined, color: '#ff0000' };
      const resolved = service.resolveMark(styles, 'bold');
      expect(resolved.weight).toBe('bold'); // undefined override falls through
      expect(resolved.color).toBe('#ff0000');
    });

    it('returns empty-ish text when both default + override missing', () => {
      const styles: PublishStyles = createDefaultPublishStyles();
      const resolved = service.resolveMark(
        styles,
        'unknownMark' as unknown as Parameters<
          PublishStyleResolverService['resolveMark']
        >[1]
      );
      expect(resolved).toEqual({});
    });
  });

  describe('resolvePage', () => {
    it('returns defaults when no override', () => {
      expect(service.resolvePage(null)).toEqual(DEFAULT_PAGE_STYLE);
      expect(service.resolvePage(undefined)).toEqual(DEFAULT_PAGE_STYLE);
    });

    it('merges override over defaults', () => {
      const styles = createDefaultPublishStyles();
      styles.page.size = 'us-letter';
      styles.page.runningHeader = false;
      const resolved = service.resolvePage(styles);
      expect(resolved.size).toBe('us-letter');
      expect(resolved.runningHeader).toBe(false);
      expect(resolved.marginTop).toBe(DEFAULT_PAGE_STYLE.marginTop);
    });
  });

  describe('resolveChapterTitle', () => {
    it('returns defaults when no override given', () => {
      const resolved = service.resolveChapterTitle(undefined);
      expect(resolved.text).toBeDefined();
      expect(resolved.box).toBeDefined();
      expect(resolved.numberPrefix).toEqual(
        DEFAULT_STRUCTURE_STYLES.chapterTitle.numberPrefix ?? {}
      );
      expect(resolved.pageBreakBefore).toBe(
        DEFAULT_STRUCTURE_STYLES.chapterTitle.pageBreakBefore
      );
    });

    it('layers base text + defaults + plan override', () => {
      const styles = createDefaultPublishStyles();
      styles.baseText.fontSize = 11;
      styles.structure.chapterTitle = {
        ...styles.structure.chapterTitle,
        text: { transform: 'uppercase', fontSize: 24 },
        box: { marginTop: 100 },
        numberPrefix: { weight: 'bold' },
        pageBreakBefore: true,
      };
      const resolved = service.resolveChapterTitle(styles);
      expect(resolved.text.fontSize).toBe(24);
      expect(resolved.text.transform).toBe('uppercase');
      expect(resolved.box.marginTop).toBe(100);
      expect(resolved.numberPrefix.weight).toBe('bold');
      expect(resolved.pageBreakBefore).toBe(true);
    });

    it('falls back to defaults.pageBreakBefore when override omits it', () => {
      const styles = createDefaultPublishStyles();
      // pageBreakBefore explicitly removed from override
      styles.structure.chapterTitle = {
        ...styles.structure.chapterTitle,
        pageBreakBefore: undefined as unknown as boolean,
      };
      const resolved = service.resolveChapterTitle(styles);
      expect(resolved.pageBreakBefore).toBe(
        DEFAULT_STRUCTURE_STYLES.chapterTitle.pageBreakBefore
      );
    });
  });

  describe('resolveSceneBreak / resolveToc / resolveFrontmatter / resolveBackmatter', () => {
    it('return resolved structures with defaults when no override', () => {
      const sb = service.resolveSceneBreak(null);
      expect(sb.text).toBeDefined();
      expect(sb.box).toBeDefined();

      const toc = service.resolveToc(null);
      expect(toc.title).toBeDefined();
      expect(toc.entry).toBeDefined();
      expect(toc.indentPerLevel).toBe(
        DEFAULT_STRUCTURE_STYLES.toc.indentPerLevel
      );

      const fm = service.resolveFrontmatter(null);
      expect(fm.title).toBeDefined();
      expect(fm.body).toBeDefined();
      expect(fm.box).toBeDefined();

      const bm = service.resolveBackmatter(null);
      expect(bm.title).toBeDefined();
      expect(bm.body).toBeDefined();
      expect(bm.box).toBeDefined();
    });

    it('toc indentPerLevel uses override when provided', () => {
      const styles = createDefaultPublishStyles();
      styles.structure.toc = { ...styles.structure.toc, indentPerLevel: 99 };
      expect(service.resolveToc(styles).indentPerLevel).toBe(99);
    });

    it('frontmatter and backmatter merge title + body + box overrides', () => {
      const styles = createDefaultPublishStyles();
      styles.structure.frontmatter = {
        ...styles.structure.frontmatter,
        title: { fontSize: 30 },
        body: { fontSize: 13 },
        box: { marginTop: 50 },
      };
      styles.structure.backmatter = {
        ...styles.structure.backmatter,
        title: { color: '#aaaaaa' },
        body: { lineHeight: 1.8 },
        box: { marginBottom: 40 },
      };

      const fm = service.resolveFrontmatter(styles);
      expect(fm.title.fontSize).toBe(30);
      expect(fm.body.fontSize).toBe(13);
      expect(fm.box.marginTop).toBe(50);

      const bm = service.resolveBackmatter(styles);
      expect(bm.title.color).toBe('#aaaaaa');
      expect(bm.body.lineHeight).toBe(1.8);
      expect(bm.box.marginBottom).toBe(40);
    });
  });

  describe('resolveWorldbuildingEntry', () => {
    it('returns defaults when styles is null and no schema given', () => {
      const resolved = service.resolveWorldbuildingEntry(null, undefined);
      expect(resolved.layout).toBe(
        DEFAULT_WORLDBUILDING_STYLES.defaultLayout ?? 'card'
      );
      expect(resolved.entryTitle).toBeDefined();
      expect(resolved.entryBox).toBeDefined();
      expect(resolved.fieldOverrides).toEqual({});
      expect(resolved.tabOverrides).toEqual({});
    });

    it('layout precedence: requested > schema override > wb.defaultLayout > "card"', () => {
      const styles = createDefaultPublishStyles();
      styles.worldbuilding = {
        ...styles.worldbuilding,
        defaultLayout: 'compact',
        schemas: { character: { layout: 'detail' } },
      };

      // requested wins
      expect(
        service.resolveWorldbuildingEntry(styles, 'character', 'appendix')
          .layout
      ).toBe('appendix');

      // schema override wins when no request
      expect(
        service.resolveWorldbuildingEntry(styles, 'character').layout
      ).toBe('detail');

      // wb.defaultLayout wins when no schema override
      expect(service.resolveWorldbuildingEntry(styles, 'unknown').layout).toBe(
        'compact'
      );

      // 'card' fallback when defaultLayout undefined
      const styles2 = createDefaultPublishStyles();
      styles2.worldbuilding = {
        ...styles2.worldbuilding,
        defaultLayout: undefined as unknown as 'card',
      };
      expect(service.resolveWorldbuildingEntry(styles2, undefined).layout).toBe(
        'card'
      );
    });

    it('merges per-schema entryTitle and entryBox overrides', () => {
      const styles = createDefaultPublishStyles();
      styles.worldbuilding = {
        ...styles.worldbuilding,
        schemas: {
          character: {
            entryTitle: { fontSize: 22, color: '#112233' },
            entryBox: { borderWidth: 2, borderColor: '#445566' },
            fields: { name: { label: { weight: 'bold' } } },
            tabs: { identity: { heading: { transform: 'uppercase' } } },
          },
        },
      };
      const resolved = service.resolveWorldbuildingEntry(styles, 'character');
      expect(resolved.entryTitle.fontSize).toBe(22);
      expect(resolved.entryTitle.color).toBe('#112233');
      expect(resolved.entryBox.borderWidth).toBe(2);
      expect(resolved.entryBox.borderColor).toBe('#445566');
      expect(resolved.fieldOverrides['name']).toBeDefined();
      expect(resolved.tabOverrides['identity']).toBeDefined();
    });

    it('ignores schema lookup when schemaId is undefined or missing', () => {
      const styles = createDefaultPublishStyles();
      styles.worldbuilding = {
        ...styles.worldbuilding,
        schemas: { character: { entryTitle: { fontSize: 99 } } },
      };
      const resolved = service.resolveWorldbuildingEntry(styles, undefined);
      expect(resolved.entryTitle.fontSize).not.toBe(99);
    });
  });
});
