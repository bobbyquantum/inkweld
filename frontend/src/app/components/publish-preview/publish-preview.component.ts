import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  type OnChanges,
  type OnDestroy,
  Output,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DomSanitizer,
  type SafeHtml,
  type SafeResourceUrl,
} from '@angular/platform-browser';
import { TranslocoModule } from '@jsverse/transloco';
import {
  PublishFormat,
  type PublishPlan,
  type PublishStats,
} from '@models/publish-plan';
import { HtmlGeneratorService } from '@services/publish/html-generator.service';
import { MarkdownGeneratorService } from '@services/publish/markdown-generator.service';
import { PdfGeneratorService } from '@services/publish/pdf-generator.service';

type DevicePreset = 'phone' | 'tablet' | 'desktop';

/** Summary line shown in the preview toolbar after a successful render. */
export interface PreviewStats {
  words: number | null;
  /** Rendered page count (PDF only). */
  pages: number | null;
}

@Component({
  selector: 'app-publish-preview',
  templateUrl: './publish-preview.component.html',
  styleUrls: ['./publish-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
})
export class PublishPreviewComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  private readonly pdfGenerator = inject(PdfGeneratorService);
  private readonly htmlGenerator = inject(HtmlGeneratorService);
  private readonly markdownGenerator = inject(MarkdownGeneratorService);
  private readonly sanitizer = inject(DomSanitizer);

  @Input({ required: true }) plan!: PublishPlan;
  /** The plan changed since the last render. */
  @Input() outdated = false;
  /** Render as soon as the component is shown. */
  @Input() autoLoad = false;
  /**
   * Re-render automatically when `outdated` flips to true while a preview is
   * already displayed. Off by default so heavy PDF renders only happen when
   * the user asks (or re-opens the preview section, which recreates us).
   */
  @Input() autoRefresh = false;
  @Output() refreshRequested = new EventEmitter<void>();

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected hasPreview = signal(false);
  protected devicePreset = signal<DevicePreset>('desktop');
  protected stats = signal<PreviewStats | null>(null);

  /** SVG content for PDF preview (rendered by Typst WASM) */
  protected svgContent = signal<SafeHtml | null>(null);
  /** Blob URL for HTML/EPUB preview iframe */
  protected htmlBlobUrl = signal<SafeResourceUrl | null>(null);
  /** Plain text for markdown preview */
  protected markdownText = signal<string | null>(null);

  protected readonly PublishFormat = PublishFormat;
  protected readonly devicePresets: {
    value: DevicePreset;
    icon: string;
    labelKey: string;
    width: number;
  }[] = [
    {
      value: 'phone',
      icon: 'phone_android',
      labelKey: 'publish.preview.phone',
      width: 375,
    },
    {
      value: 'tablet',
      icon: 'tablet',
      labelKey: 'publish.preview.tablet',
      width: 768,
    },
    {
      value: 'desktop',
      icon: 'desktop_windows',
      labelKey: 'publish.preview.desktop',
      width: 1024,
    },
  ];

  private currentBlobUrl: string | null = null;
  /** Ignore results from a render that was superseded by a newer one. */
  private renderToken = 0;

  ngAfterViewInit(): void {
    if (this.autoLoad && !this.hasPreview() && !this.loading()) {
      void this.generatePreview();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const outdatedChange = changes['outdated'];
    if (
      this.autoRefresh &&
      outdatedChange &&
      !outdatedChange.firstChange &&
      outdatedChange.currentValue === true &&
      this.hasPreview() &&
      !this.loading()
    ) {
      void this.generatePreview();
    }
  }

  ngOnDestroy(): void {
    this.cleanupBlobUrl();
  }

  /** Whether the current format renders into a resizable device frame. */
  protected get isHtmlLike(): boolean {
    return (
      this.plan.format === PublishFormat.HTML ||
      this.plan.format === PublishFormat.HTML_SITE ||
      this.plan.format === PublishFormat.EPUB
    );
  }

  /** Translation key describing what this preview approximates. */
  protected get formatNoteKey(): string | null {
    switch (this.plan.format) {
      case PublishFormat.EPUB:
        return 'publish.preview.noteEpub';
      case PublishFormat.HTML_SITE:
        return 'publish.preview.noteSite';
      default:
        return null;
    }
  }

  async generatePreview(): Promise<void> {
    const token = ++this.renderToken;
    this.loading.set(true);
    this.error.set(null);
    this.refreshRequested.emit();

    try {
      switch (this.plan.format) {
        case PublishFormat.PDF_SIMPLE:
          await this.generatePdfPreview(token);
          break;
        case PublishFormat.HTML:
        case PublishFormat.HTML_SITE:
        case PublishFormat.EPUB:
          await this.generateHtmlPreview(token);
          break;
        case PublishFormat.MARKDOWN:
          await this.generateMarkdownPreview(token);
          break;
      }
      if (token !== this.renderToken) return;
      this.hasPreview.set(true);
    } catch (e) {
      if (token !== this.renderToken) return;
      this.error.set(
        e instanceof Error ? e.message : 'Preview generation failed'
      );
    } finally {
      if (token === this.renderToken) {
        this.loading.set(false);
      }
    }
  }

  protected setDevicePreset(preset: DevicePreset): void {
    this.devicePreset.set(preset);
  }

  protected getPreviewWidth(): number {
    return (
      this.devicePresets.find(p => p.value === this.devicePreset())?.width ??
      1024
    );
  }

  private async generatePdfPreview(token: number): Promise<void> {
    const svg = await this.pdfGenerator.renderSvgPreview(this.plan);
    if (token !== this.renderToken) return;
    this.cleanupBlobUrl();
    // SECURITY: SVG is generated internally by the Typst WASM compiler from
    // trusted plan data — it does not contain user-supplied HTML/script content.
    this.svgContent.set(this.sanitizer.bypassSecurityTrustHtml(svg));
    this.htmlBlobUrl.set(null);
    this.markdownText.set(null);
    this.stats.set({ words: null, pages: countSvgPages(svg) });
  }

  private async generateHtmlPreview(token: number): Promise<void> {
    const result = await this.htmlGenerator.generateHtml(this.plan);
    if (token !== this.renderToken) return;
    if (!result.success || !result.file) {
      throw new Error(result.error || 'HTML generation failed');
    }
    this.cleanupBlobUrl();
    const url = URL.createObjectURL(result.file);
    this.currentBlobUrl = url;
    // SECURITY: Blob URL points to locally generated HTML content from the
    // HtmlGeneratorService — it does not embed external or user-supplied scripts.
    this.htmlBlobUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    this.svgContent.set(null);
    this.markdownText.set(null);
    this.stats.set(statsFromResult(result.stats));
  }

  private async generateMarkdownPreview(token: number): Promise<void> {
    const result = await this.markdownGenerator.generateMarkdown(this.plan);
    if (token !== this.renderToken) return;
    if (!result.success || !result.file) {
      throw new Error(result.error || 'Markdown generation failed');
    }
    const text = await result.file.text();
    if (token !== this.renderToken) return;
    this.cleanupBlobUrl();
    this.markdownText.set(text);
    this.svgContent.set(null);
    this.htmlBlobUrl.set(null);
    this.stats.set(statsFromResult(result.stats));
  }

  private cleanupBlobUrl(): void {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }
}

/** Typst emits one root `<svg>` element per page. */
export function countSvgPages(svg: string): number {
  const matches = svg.match(/<svg[\s>]/g);
  return matches ? matches.length : 0;
}

function statsFromResult(stats: PublishStats | undefined): PreviewStats {
  return { words: stats?.wordCount ?? null, pages: null };
}
