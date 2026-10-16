import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '@models/publish-style';
import { beforeEach, describe, expect, it } from 'vitest';

import { PublishCssEmitterService } from './publish-css-emitter.service';

describe('PublishCssEmitterService page columns', () => {
  let service: PublishCssEmitterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), PublishCssEmitterService],
    });
    service = TestBed.inject(PublishCssEmitterService);
  });

  function html(modify?: (s: PublishStyles) => void): string {
    const styles = createDefaultPublishStyles();
    modify?.(styles);
    return service.emitHtmlStylesheet(styles);
  }

  it('emits no column rules for a single-column page', () => {
    const css = html();
    expect(css).not.toContain('column-count');
    expect(css).not.toContain('.ink-columns');
  });

  it('treats a plan saved without columns as one column', () => {
    const css = html(s => {
      delete s.page.columns;
      delete s.page.columnGap;
    });
    expect(css).not.toContain('column-count');
  });

  it('emits column-count, the gap and a narrow-screen fallback for two columns', () => {
    const css = html(s => {
      s.page.columns = 2;
      s.page.columnGap = 0.4;
    });
    expect(css).toContain(
      '.ink-columns { column-count: 2; column-gap: 0.4in; }'
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\) \{ \.ink-columns \{ column-count: 1;/
    );
  });

  it('uses the default gap when none is set', () => {
    const css = html(s => {
      s.page.columns = 2;
      delete s.page.columnGap;
    });
    expect(css).toContain('column-gap: 0.25in');
  });

  it('spans headings and front matter and keeps worldbuilding entries whole', () => {
    const css = html(s => {
      s.page.columns = 2;
    });
    expect(css).toMatch(
      /\.ink-columns \.title-page[^{]*\.ink-columns \.ink-toc[^{]*\.ink-columns \.ink-chapter-title[^{]*\{ column-span: all; \}/
    );
    expect(css).toMatch(
      /\.ink-columns \.ink-wb-entry[^{]*\{ break-inside: avoid; \}/
    );
    expect(css).toContain(
      '.ink-columns .ink-wb-field { grid-column: span 12 !important; }'
    );
  });

  it('never emits column rules into the EPUB stylesheet', () => {
    const styles = createDefaultPublishStyles();
    styles.page.columns = 2;
    const css = service.emitEpubStylesheet(styles);
    expect(css).not.toContain('column-count');
    expect(css).not.toContain('.ink-columns');
  });
});

describe('PublishCssEmitterService page and entries', () => {
  let service: PublishCssEmitterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), PublishCssEmitterService],
    });
    service = TestBed.inject(PublishCssEmitterService);
  });

  it('declares a light page so a dark-mode reader keeps the text readable', () => {
    const css = service.emitHtmlStylesheet(createDefaultPublishStyles());
    expect(css).toContain(':root { color-scheme: light; }');
    expect(css).toContain('html { background: #ffffff; }');
    expect(
      service.emitEpubStylesheet(createDefaultPublishStyles())
    ).not.toContain('color-scheme');
  });

  it('rules entry titles instead of boxing entries', () => {
    const styles = createDefaultPublishStyles();
    styles.worldbuilding.entryTitle = {
      ...styles.worldbuilding.entryTitle,
      color: '#225566',
    };
    const css = service.emitHtmlStylesheet(styles);
    const entryRule = /\.ink-wb-entry \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(entryRule).not.toContain('border');
    expect(css).toContain('border-bottom: 0.75pt solid #225566;');
  });

  it('sets entry text flush rather than indented and justified', () => {
    expect(service.emitHtmlStylesheet(createDefaultPublishStyles())).toContain(
      '.ink-wb-entry-description, .ink-wb-long p, .ink-wb-long li { text-indent: 0; text-align: left; }'
    );
  });

  it('starts a row for a run of fields in a way the span rules cannot undo', () => {
    expect(service.emitHtmlStylesheet(createDefaultPublishStyles())).toContain(
      '.ink-wb-field.ink-wb-row-start { grid-column-start: 1; }'
    );
  });

  it('draws no title rule when the entry border is off', () => {
    const styles = createDefaultPublishStyles();
    styles.worldbuilding.entryBox = {
      ...styles.worldbuilding.entryBox,
      borderWidth: 0,
    };
    expect(service.emitHtmlStylesheet(styles)).not.toContain(
      '.ink-wb-entry-header { border-bottom'
    );
  });
});
