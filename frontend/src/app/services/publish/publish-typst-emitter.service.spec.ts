import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '@models/publish-style';
import { beforeEach, describe, expect, it } from 'vitest';

import { PublishTypstEmitterService } from './publish-typst-emitter.service';

/**
 * Unit tests for the Typst preamble emitter. The preamble is concatenated
 * into a generated Typst source by the PDF generator; tests assert the
 * critical branch behaviours (page sizes, color validation, alignment +
 * uppercase wrapping, weight + font fallback, pagebreak flag) by string
 * matching on the emitted preamble.
 */
describe('PublishTypstEmitterService', () => {
  let service: PublishTypstEmitterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), PublishTypstEmitterService],
    });
    service = TestBed.inject(PublishTypstEmitterService);
  });

  function emit(modify?: (s: PublishStyles) => void): string {
    const styles = createDefaultPublishStyles();
    modify?.(styles);
    return service.emitPreamble(styles);
  }

  it('emits a preamble even when styles is null/undefined', () => {
    const a = service.emitPreamble(null);
    const b = service.emitPreamble(undefined);
    expect(a).toContain('#set page(');
    expect(a).toContain('#set text(');
    expect(b).toContain('#set page(');
  });

  describe('page size handling', () => {
    it('emits paper:"us-letter" for us-letter', () => {
      const out = emit(s => {
        s.page.size = 'us-letter';
      });
      expect(out).toContain('paper: "us-letter"');
      expect(out).not.toContain('width:');
    });

    it('emits explicit width/height for us-trade (custom)', () => {
      const out = emit(s => {
        s.page.size = 'us-trade';
      });
      expect(out).toContain('width: 6in');
      expect(out).toContain('height: 9in');
      expect(out).not.toContain('paper:');
    });

    it('emits explicit width/height for pocket (custom)', () => {
      const out = emit(s => {
        s.page.size = 'pocket';
      });
      expect(out).toContain('width: 4.25in');
      expect(out).toContain('height: 6.87in');
    });

    it('uses iso-b5 for b5', () => {
      const out = emit(s => {
        s.page.size = 'b5';
      });
      expect(out).toContain('paper: "iso-b5"');
    });

    it('falls back to us-letter for an unknown page size', () => {
      const out = emit(s => {
        (s.page as { size: string }).size = 'unknown';
      });
      expect(out).toContain('paper: "us-letter"');
    });
  });

  describe('page numbering', () => {
    it('emits numbering: none', () => {
      const out = emit(s => {
        s.page.pageNumbers = 'none';
      });
      expect(out).toContain('numbering: none');
    });

    it('emits numbering: "i" for roman', () => {
      const out = emit(s => {
        s.page.pageNumbers = 'roman';
      });
      expect(out).toContain('numbering: "i"');
    });

    it('emits numbering: "1" for numeric', () => {
      const out = emit(s => {
        s.page.pageNumbers = 'numeric';
      });
      expect(out).toContain('numbering: "1"');
    });
  });

  describe('text setup + line height -> leading conversion', () => {
    it('subtracts 1 from line-height to get leading (clamped at 0)', () => {
      const doubled = emit(s => {
        s.baseText.lineHeight = 2;
      });
      expect(doubled).toContain('leading: 1.00em');

      const tight = emit(s => {
        s.baseText.lineHeight = 0.8;
      });
      expect(tight).toContain('leading: 0.00em');

      const oneFive = emit(s => {
        s.baseText.lineHeight = 1.5;
      });
      expect(oneFive).toContain('leading: 0.50em');
    });

    it('emits justify:true only when align is justify', () => {
      const j = emit(s => {
        s.baseText.align = 'justify';
      });
      expect(j).toContain('justify: true');

      const left = emit(s => {
        s.baseText.align = 'left';
      });
      expect(left).toContain('justify: false');
    });
  });

  describe('color sanitization (typstColor)', () => {
    it('accepts #RGB / #RRGGBB / #RRGGBBAA', () => {
      const out = emit(s => {
        s.baseText.color = '#abcdef';
      });
      expect(out).toContain('rgb("#abcdef")');

      const short = emit(s => {
        s.baseText.color = '#fff';
      });
      expect(short).toContain('rgb("#fff")');

      const alpha = emit(s => {
        s.baseText.color = '#11223344';
      });
      expect(alpha).toContain('rgb("#11223344")');
    });

    it('replaces invalid colors with the safe fallback', () => {
      const named = emit(s => {
        s.baseText.color = 'red';
      });
      expect(named).not.toContain('rgb("red")');
      expect(named).toContain('rgb("#111111")');

      const fnExpr = emit(s => {
        s.baseText.color = 'rgb(255,0,0)';
      });
      expect(fnExpr).toContain('rgb("#111111")');

      const hostile = emit(s => {
        s.baseText.color = '#"); danger //';
      });
      expect(hostile).toContain('rgb("#111111")');
      expect(hostile).not.toContain('danger');
    });
  });

  describe('font fallback (typstFontList)', () => {
    it('emits the resolved typst family for a known token', () => {
      const out = emit(s => {
        s.baseText.font = 'serifClassic';
      });
      // Default token serifClassic should resolve via PUBLISH_FONT_TOKENS.
      expect(out).toMatch(/font: \("[^"]+",\)/);
    });

    it('uses the serifClassic fallback when token is unset on baseText', () => {
      const out = emit(s => {
        s.baseText.font = undefined;
      });
      expect(out).toMatch(/font: \("[^"]+",\)/);
    });
  });

  describe('chapter title alignment + uppercase wrapping (wrapAlignTransform)', () => {
    it('wraps title in upper(...) when transform is uppercase', () => {
      const out = emit(s => {
        s.structure.chapterTitle.text.transform = 'uppercase';
        s.structure.chapterTitle.text.align = 'left';
      });
      expect(out).toContain('upper(');
      // Left alignment must NOT introduce an align(...) wrapper.
      expect(out).not.toMatch(/align\(left\)/);
    });

    it('wraps title in align(center)[...] when align is center', () => {
      const out = emit(s => {
        s.structure.chapterTitle.text.align = 'center';
        s.structure.chapterTitle.text.transform = undefined;
      });
      expect(out).toContain('align(center)');
    });

    it('combines align(right) + upper for right-aligned uppercase chapters', () => {
      const out = emit(s => {
        s.structure.chapterTitle.text.align = 'right';
        s.structure.chapterTitle.text.transform = 'uppercase';
      });
      expect(out).toContain('align(right)');
      expect(out).toContain('upper(');
    });

    it('handles uppercase + non-left alignment on the number prefix', () => {
      const out = emit(s => {
        s.structure.chapterTitle.numberPrefix = {
          align: 'center',
          transform: 'uppercase',
        };
      });
      expect(out).toMatch(/align\(center\)\[#upper\(/);
    });

    it('handles plain (no-uppercase, non-left) number prefix alignment', () => {
      const out = emit(s => {
        s.structure.chapterTitle.numberPrefix = {
          align: 'right',
          transform: 'none',
        };
      });
      // align(right)[ wraps the inner [#text(...)[...]]; no upper(...) wrapper.
      expect(out).toMatch(/align\(right\)\[\[#text\(/);
      expect(out).not.toMatch(/upper\(\[#text\([^)]*\)\[#num/);
    });
  });

  describe('chapter pageBreakBefore', () => {
    it('inserts pagebreak(weak: true) when enabled', () => {
      const out = emit(s => {
        s.structure.chapterTitle.pageBreakBefore = true;
      });
      expect(out).toContain('pagebreak(weak: true)');
    });

    it('omits pagebreak when disabled', () => {
      const out = emit(s => {
        s.structure.chapterTitle.pageBreakBefore = false;
      });
      expect(out).not.toContain('pagebreak(weak: true)');
    });
  });

  describe('text style emission (typstTextArgs / typstWeight)', () => {
    it('emits weight bold/light/medium/semibold and "regular" for normal', () => {
      const bold = emit(s => {
        s.baseText.weight = 'bold';
        s.nodes.heading1 = { text: { weight: 'bold' } };
      });
      expect(bold).toContain('weight: "bold"');

      const light = emit(s => {
        s.nodes.heading2 = { text: { weight: 'light' } };
      });
      expect(light).toContain('weight: "light"');

      const med = emit(s => {
        s.nodes.heading3 = { text: { weight: 'medium' } };
      });
      expect(med).toContain('weight: "medium"');

      const semi = emit(s => {
        s.nodes.heading4 = { text: { weight: 'semibold' } };
      });
      expect(semi).toContain('weight: "semibold"');

      const norm = emit(s => {
        s.nodes.heading5 = { text: { weight: 'normal' } };
      });
      expect(norm).toContain('weight: "regular"');
    });

    it('emits style "italic" only for italic', () => {
      const it = emit(s => {
        s.nodes.heading1 = { text: { style: 'italic' } };
      });
      expect(it).toContain('style: "italic"');

      const norm = emit(s => {
        s.nodes.heading2 = { text: { style: 'normal' } };
      });
      // normal style suppresses the explicit style: arg
      expect(norm).not.toContain('style: "normal"');
    });

    it('emits tracking when transform is uppercase (letterspacing hint)', () => {
      const out = emit(s => {
        s.nodes.heading1 = { text: { transform: 'uppercase' } };
      });
      expect(out).toContain('tracking: 0.05em');
    });
  });

  describe('worldbuilding helpers', () => {
    it('emits stroke:none when borderWidth is zero/unset', () => {
      const out = emit(s => {
        s.worldbuilding.entryBox = {
          ...s.worldbuilding.entryBox,
          borderWidth: 0,
        };
      });
      expect(out).toContain('stroke: none');
    });

    it('emits stroke with sanitized color when borderWidth is set', () => {
      const out = emit(s => {
        s.worldbuilding.entryBox = {
          ...s.worldbuilding.entryBox,
          borderWidth: 2,
          borderColor: '#aabbcc',
        };
      });
      expect(out).toContain('2pt + rgb("#aabbcc")');
    });

    it('falls back to safe color when borderColor is invalid', () => {
      const out = emit(s => {
        s.worldbuilding.entryBox = {
          ...s.worldbuilding.entryBox,
          borderWidth: 1,
          borderColor: 'javascript:bad',
        };
      });
      expect(out).toContain('1pt + rgb("#111111")');
    });
  });
});
