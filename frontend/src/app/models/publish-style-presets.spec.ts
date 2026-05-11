import { describe, expect, it } from 'vitest';

import {
  getPublishStylePreset,
  PUBLISH_STYLE_PRESETS,
} from './publish-style-presets';

describe('publish-style-presets', () => {
  it('exposes 6 presets with unique ids and stable required fields', () => {
    const ids = PUBLISH_STYLE_PRESETS.map(p => p.id);
    expect(ids).toEqual([
      'manuscript',
      'paperback',
      'ebook',
      'webSerial',
      'largePrint',
      'reference',
    ]);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of PUBLISH_STYLE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      expect(typeof preset.build).toBe('function');
    }
  });

  it('every preset.build() stamps its own id on styles.preset', () => {
    for (const preset of PUBLISH_STYLE_PRESETS) {
      const styles = preset.build();
      expect(styles.preset).toBe(preset.id);
    }
  });

  it('build() returns a fresh object each call (no shared mutable state)', () => {
    for (const preset of PUBLISH_STYLE_PRESETS) {
      const a = preset.build();
      const b = preset.build();
      expect(a).not.toBe(b);
      expect(a.baseText).not.toBe(b.baseText);
      a.baseText.fontSize = 999;
      expect(b.baseText.fontSize).not.toBe(999);
    }
  });

  describe('manuscript', () => {
    const styles = getPublishStylePreset('manuscript')!.build();

    it('uses Courier-style submission format', () => {
      expect(styles.baseText.font).toBe('serifManuscript');
      expect(styles.baseText.fontSize).toBe(12);
      expect(styles.baseText.lineHeight).toBe(2);
      expect(styles.baseText.firstLineIndent).toBe(0.5);
    });

    it('uses 1" margins on US Letter with running header', () => {
      expect(styles.page.size).toBe('us-letter');
      expect(styles.page.marginTop).toBe(1);
      expect(styles.page.marginBottom).toBe(1);
      expect(styles.page.marginInside).toBe(1);
      expect(styles.page.marginOutside).toBe(1);
      expect(styles.page.runningHeader).toBe(true);
      expect(styles.page.pageNumbers).toBe('numeric');
    });

    it('chapter titles uppercase, page break, generous top margin', () => {
      expect(styles.structure.chapterTitle.text.transform).toBe('uppercase');
      expect(styles.structure.chapterTitle.pageBreakBefore).toBe(true);
      expect(styles.structure.chapterTitle.box.marginTop).toBe(144);
    });
  });

  describe('paperback', () => {
    it('returns mostly default styles tagged with preset id', () => {
      const styles = getPublishStylePreset('paperback')!.build();
      expect(styles.preset).toBe('paperback');
      // Defaults aren't asserted in detail (covered by createDefaultPublishStyles spec).
      expect(styles.baseText).toBeDefined();
      expect(styles.page).toBeDefined();
    });
  });

  describe('ebook', () => {
    const styles = getPublishStylePreset('ebook')!.build();

    it('uses serif body tuned for e-readers', () => {
      expect(styles.baseText.font).toBe('serifBook');
      expect(styles.baseText.lineHeight).toBe(1.5);
      expect(styles.baseText.firstLineIndent).toBe(1);
    });

    it('disables page chrome the way reflowable readers expect', () => {
      expect(styles.page.size).toBe('us-trade');
      expect(styles.page.runningHeader).toBe(false);
      expect(styles.page.pageNumbers).toBe('none');
    });
  });

  describe('webSerial', () => {
    const styles = getPublishStylePreset('webSerial')!.build();

    it('uses sans-serif left-aligned body with no first-line indent', () => {
      expect(styles.baseText.font).toBe('sansHumanist');
      expect(styles.baseText.align).toBe('left');
      expect(styles.baseText.firstLineIndent).toBe(0);
      expect(styles.baseText.color).toBe('#1a1a1a');
    });

    it('uses bottom-margin paragraphs (block spacing) instead of indents', () => {
      expect(styles.nodes.paragraph?.text?.firstLineIndent).toBe(0);
      expect(styles.nodes.paragraph?.box?.marginBottom).toBe(12);
    });

    it('chapter titles left-aligned in matching sans family', () => {
      expect(styles.structure.chapterTitle.text.font).toBe('sansHumanist');
      expect(styles.structure.chapterTitle.text.align).toBe('left');
      expect(styles.structure.chapterTitle.text.fontSize).toBe(28);
    });
  });

  describe('largePrint', () => {
    const styles = getPublishStylePreset('largePrint')!.build();

    it('uses 14pt sans-serif with looser leading', () => {
      expect(styles.baseText.font).toBe('sansHumanist');
      expect(styles.baseText.fontSize).toBe(14);
      expect(styles.baseText.lineHeight).toBe(1.7);
    });

    it('inflates the inside margin for binding-friendly large-print layouts', () => {
      expect(styles.page.marginInside).toBe(1.25);
      expect(styles.page.marginOutside).toBe(1);
    });
  });

  describe('reference', () => {
    const styles = getPublishStylePreset('reference')!.build();

    it('uses dense sans body suited to reference material', () => {
      expect(styles.baseText.font).toBe('sansClean');
      expect(styles.baseText.fontSize).toBe(10);
      expect(styles.baseText.lineHeight).toBe(1.35);
      expect(styles.baseText.align).toBe('left');
      expect(styles.baseText.firstLineIndent).toBe(0);
    });

    it('promotes worldbuilding entries to detail layout with bordered cards', () => {
      expect(styles.worldbuilding.defaultLayout).toBe('detail');
      expect(styles.worldbuilding.entryTitle.fontSize).toBe(16);
      expect(styles.worldbuilding.entryBox.borderWidth).toBe(1);
      expect(styles.worldbuilding.entryBox.borderColor).toBe('#888888');
    });
  });

  describe('getPublishStylePreset', () => {
    it('returns the preset for known ids', () => {
      expect(getPublishStylePreset('paperback')?.id).toBe('paperback');
      expect(getPublishStylePreset('manuscript')?.label).toBe('Manuscript');
    });

    it('returns undefined for unknown / empty / case-mismatched ids', () => {
      expect(getPublishStylePreset('nope')).toBeUndefined();
      expect(getPublishStylePreset('')).toBeUndefined();
      expect(getPublishStylePreset('PAPERBACK')).toBeUndefined();
    });
  });
});
