import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ChapterNumbering,
  PublishFormat,
  type PublishPlan,
} from '@models/publish-plan';
import { createDefaultPublishStyles } from '@models/publish-style';
import { HtmlGeneratorService } from '@services/publish/html-generator.service';
import { MarkdownGeneratorService } from '@services/publish/markdown-generator.service';
import { PdfGeneratorService } from '@services/publish/pdf-generator.service';
import { type Mock } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  countSvgPages,
  PublishPreviewComponent,
} from './publish-preview.component';

describe('PublishPreviewComponent', () => {
  let component: PublishPreviewComponent;
  let fixture: ComponentFixture<PublishPreviewComponent>;
  let mockPdfGenerator: Partial<PdfGeneratorService>;
  let mockHtmlGenerator: Partial<HtmlGeneratorService>;
  let mockMarkdownGenerator: Partial<MarkdownGeneratorService>;

  const mockPlan: PublishPlan = {
    id: 'test-plan',
    name: 'Test Plan',
    format: PublishFormat.HTML,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      title: 'Test Book',
      author: 'Test Author',
      language: 'en',
    },
    items: [],
    options: {
      chapterNumbering: ChapterNumbering.None,
      sceneBreakText: '* * *',
      includeWordCounts: false,
      includeToc: false,
      includeCover: false,
    },
    styles: createDefaultPublishStyles(),
  };

  beforeEach(async () => {
    mockPdfGenerator = {
      renderSvgPreview: vi.fn().mockResolvedValue('<svg></svg>'),
    };
    mockHtmlGenerator = {
      generateHtml: vi.fn().mockResolvedValue({
        success: true,
        file: new Blob(['<html><body>Test</body></html>'], {
          type: 'text/html',
        }),
        warnings: [],
      }),
    };
    mockMarkdownGenerator = {
      generateMarkdown: vi.fn().mockResolvedValue({
        success: true,
        file: new Blob(['# Test'], { type: 'text/markdown' }),
        warnings: [],
      }),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), PublishPreviewComponent],
      providers: [
        { provide: PdfGeneratorService, useValue: mockPdfGenerator },
        { provide: HtmlGeneratorService, useValue: mockHtmlGenerator },
        {
          provide: MarkdownGeneratorService,
          useValue: mockMarkdownGenerator,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishPreviewComponent);
    component = fixture.componentInstance;
    component.plan = { ...mockPlan };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty state initially', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector('[data-testid="generate-preview-button"]')
    ).toBeTruthy();
  });

  it('should generate HTML preview', async () => {
    await component.generatePreview();
    fixture.detectChanges();
    expect(mockHtmlGenerator.generateHtml).toHaveBeenCalledWith(component.plan);
    expect(component['hasPreview']()).toBe(true);
  });

  it('should generate PDF preview via SVG', async () => {
    component.plan = { ...mockPlan, format: PublishFormat.PDF_SIMPLE };
    await component.generatePreview();
    fixture.detectChanges();
    expect(mockPdfGenerator.renderSvgPreview).toHaveBeenCalledWith(
      component.plan
    );
    expect(component['svgContent']()).toBeTruthy();
  });

  it('should generate markdown preview', async () => {
    component.plan = { ...mockPlan, format: PublishFormat.MARKDOWN };
    await component.generatePreview();
    fixture.detectChanges();
    expect(mockMarkdownGenerator.generateMarkdown).toHaveBeenCalledWith(
      component.plan
    );
    expect(component['markdownText']()).toBe('# Test');
  });

  it('should show error on generation failure', async () => {
    mockHtmlGenerator.generateHtml = vi.fn().mockResolvedValue({
      success: false,
      error: 'Test error',
      warnings: [],
    });
    await component.generatePreview();
    fixture.detectChanges();
    expect(component['error']()).toBe('Test error');
  });

  it('should show error when PDF preview generation fails', async () => {
    component.plan = { ...mockPlan, format: PublishFormat.PDF_SIMPLE };
    mockPdfGenerator.renderSvgPreview = vi
      .fn()
      .mockRejectedValue(new Error('Typst compilation failed'));
    await component.generatePreview();
    fixture.detectChanges();
    expect(component['error']()).toBe('Typst compilation failed');
    expect(component['hasPreview']()).toBe(false);
    expect(component['svgContent']()).toBeNull();
  });

  it('should show outdated banner when outdated', async () => {
    component.outdated = true;
    await component.generatePreview();
    fixture.detectChanges();
    const banner = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="preview-outdated-banner"]'
    );
    expect(banner).toBeTruthy();
  });

  it('should show device presets for HTML format', async () => {
    await component.generatePreview();
    fixture.detectChanges();
    const presets = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="device-presets"]'
    );
    expect(presets).toBeTruthy();
  });

  it('should not show device presets for PDF format', async () => {
    component.plan = { ...mockPlan, format: PublishFormat.PDF_SIMPLE };
    await component.generatePreview();
    fixture.detectChanges();
    const presets = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="device-presets"]'
    );
    expect(presets).toBeFalsy();
  });

  it('should emit refreshRequested when generating preview', async () => {
    const spy = vi.spyOn(component.refreshRequested, 'emit');
    await component.generatePreview();
    expect(spy).toHaveBeenCalled();
  });

  it('should clean up blob URL on destroy', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    await component.generatePreview();
    component.ngOnDestroy();
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('should auto-load preview when autoLoad is true', () => {
    const spy = vi.spyOn(component, 'generatePreview');
    component.autoLoad = true;
    component.ngAfterViewInit();
    expect(spy).toHaveBeenCalled();
  });

  it('should not auto-load when autoLoad is false', () => {
    const spy = vi.spyOn(component, 'generatePreview');
    component.autoLoad = false;
    component.ngAfterViewInit();
    expect(spy).not.toHaveBeenCalled();
  });

  describe('toolbar', () => {
    it('should show word count from the generator result', async () => {
      (mockHtmlGenerator.generateHtml as Mock).mockResolvedValue({
        success: true,
        file: new Blob(['<html></html>'], { type: 'text/html' }),
        warnings: [],
        stats: { wordCount: 1234, chapterCount: 2 },
      });
      await component.generatePreview();
      fixture.detectChanges();
      const stats = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="preview-stats"]'
      );
      expect(stats?.textContent).toContain('1,234');
    });

    it('should show page count for PDF previews', async () => {
      component.plan = { ...mockPlan, format: PublishFormat.PDF_SIMPLE };
      (mockPdfGenerator.renderSvgPreview as Mock).mockResolvedValue(
        '<svg></svg><svg></svg><svg></svg>'
      );
      await component.generatePreview();
      fixture.detectChanges();
      const stats = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="preview-stats"]'
      );
      expect(stats?.textContent).toContain('3');
    });

    it('should show the outdated notice and a refresh button', async () => {
      await component.generatePreview();
      component.outdated = true;
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="preview-outdated-banner"]')
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="refresh-preview-button"]')
      ).toBeTruthy();
    });

    it('should show a format note for EPUB and website formats only', async () => {
      component.plan = { ...mockPlan, format: PublishFormat.EPUB };
      await component.generatePreview();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="preview-note"]')).toBeTruthy();

      component.plan = { ...mockPlan, format: PublishFormat.HTML };
      await component.generatePreview();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="preview-note"]')).toBeFalsy();
    });
  });

  describe('autoRefresh', () => {
    it('should re-render when outdated flips to true and autoRefresh is on', async () => {
      await component.generatePreview();
      const spy = vi.spyOn(component, 'generatePreview');
      component.autoRefresh = true;
      component.ngOnChanges({
        outdated: {
          currentValue: true,
          previousValue: false,
          firstChange: false,
          isFirstChange: () => false,
        },
      });
      expect(spy).toHaveBeenCalled();
    });

    it('should not re-render without autoRefresh or before a first render', async () => {
      const spy = vi.spyOn(component, 'generatePreview');
      const change = {
        outdated: {
          currentValue: true,
          previousValue: false,
          firstChange: false,
          isFirstChange: () => false,
        },
      };
      component.autoRefresh = false;
      component.ngOnChanges(change);
      expect(spy).not.toHaveBeenCalled();

      component.autoRefresh = true;
      component.ngOnChanges(change); // no preview yet
      expect(spy).not.toHaveBeenCalled();
      await Promise.resolve();
    });
  });

  it('should ignore results from a superseded render', async () => {
    let resolveFirst!: (value: unknown) => void;
    (mockHtmlGenerator.generateHtml as Mock)
      .mockReturnValueOnce(new Promise(r => (resolveFirst = r)))
      .mockResolvedValueOnce({
        success: true,
        file: new Blob(['second'], { type: 'text/html' }),
        warnings: [],
        stats: { wordCount: 2, chapterCount: 1 },
      });

    const first = component.generatePreview();
    const second = component.generatePreview();
    await second;
    resolveFirst({
      success: true,
      file: new Blob(['first'], { type: 'text/html' }),
      warnings: [],
      stats: { wordCount: 1, chapterCount: 1 },
    });
    await first;

    expect(component['stats']()?.words).toBe(2);
    expect(component['loading']()).toBe(false);
  });
});

describe('countSvgPages', () => {
  it('counts root svg elements', () => {
    expect(countSvgPages('<svg xmlns="x"></svg><svg></svg>')).toBe(2);
  });

  it('returns 0 for empty output', () => {
    expect(countSvgPages('')).toBe(0);
  });
});
