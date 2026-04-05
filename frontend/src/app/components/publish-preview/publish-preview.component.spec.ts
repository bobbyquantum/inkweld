import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ChapterNumbering,
  PublishFormat,
  type PublishPlan,
} from '@models/publish-plan';
import { HtmlGeneratorService } from '@services/publish/html-generator.service';
import { MarkdownGeneratorService } from '@services/publish/markdown-generator.service';
import { PdfGeneratorService } from '@services/publish/pdf-generator.service';

import { PublishPreviewComponent } from './publish-preview.component';

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
      fontFamily: 'Georgia, serif',
      fontSize: 12,
      lineHeight: 1.5,
    },
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
      imports: [PublishPreviewComponent],
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
});
