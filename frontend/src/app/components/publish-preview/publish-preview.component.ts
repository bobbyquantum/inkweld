import {
  type AfterViewInit,
  Component,
  EventEmitter,
  inject,
  Input,
  type OnDestroy,
  Output,
  signal,
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
import { PublishFormat, type PublishPlan } from '@models/publish-plan';
import { HtmlGeneratorService } from '@services/publish/html-generator.service';
import { MarkdownGeneratorService } from '@services/publish/markdown-generator.service';
import { PdfGeneratorService } from '@services/publish/pdf-generator.service';

type DevicePreset = 'phone' | 'tablet' | 'desktop';

@Component({
  selector: 'app-publish-preview',
  templateUrl: './publish-preview.component.html',
  styleUrls: ['./publish-preview.component.scss'],
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
})
export class PublishPreviewComponent implements AfterViewInit, OnDestroy {
  private readonly pdfGenerator = inject(PdfGeneratorService);
  private readonly htmlGenerator = inject(HtmlGeneratorService);
  private readonly markdownGenerator = inject(MarkdownGeneratorService);
  private readonly sanitizer = inject(DomSanitizer);

  @Input({ required: true }) plan!: PublishPlan;
  @Input() outdated = false;
  @Input() autoLoad = false;
  @Output() refreshRequested = new EventEmitter<void>();

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected hasPreview = signal(false);
  protected devicePreset = signal<DevicePreset>('desktop');

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
    label: string;
    width: number;
  }[] = [
    { value: 'phone', icon: 'phone_android', label: 'Phone', width: 375 },
    { value: 'tablet', icon: 'tablet', label: 'Tablet', width: 768 },
    {
      value: 'desktop',
      icon: 'desktop_windows',
      label: 'Desktop',
      width: 1024,
    },
  ];

  private currentBlobUrl: string | null = null;

  ngAfterViewInit(): void {
    if (this.autoLoad && !this.hasPreview() && !this.loading()) {
      void this.generatePreview();
    }
  }

  ngOnDestroy(): void {
    this.cleanupBlobUrl();
  }

  async generatePreview(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.refreshRequested.emit();
    this.cleanupBlobUrl();

    try {
      switch (this.plan.format) {
        case PublishFormat.PDF_SIMPLE:
          await this.generatePdfPreview();
          break;
        case PublishFormat.HTML:
        case PublishFormat.EPUB:
          await this.generateHtmlPreview();
          break;
        case PublishFormat.MARKDOWN:
          await this.generateMarkdownPreview();
          break;
      }
      this.hasPreview.set(true);
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : 'Preview generation failed'
      );
    } finally {
      this.loading.set(false);
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

  private async generatePdfPreview(): Promise<void> {
    const svg = await this.pdfGenerator.renderSvgPreview(this.plan);
    // SECURITY: SVG is generated internally by the Typst WASM compiler from
    // trusted plan data — it does not contain user-supplied HTML/script content.
    this.svgContent.set(this.sanitizer.bypassSecurityTrustHtml(svg));
    this.htmlBlobUrl.set(null);
    this.markdownText.set(null);
  }

  private async generateHtmlPreview(): Promise<void> {
    const result = await this.htmlGenerator.generateHtml(this.plan);
    if (!result.success || !result.file) {
      throw new Error(result.error || 'HTML generation failed');
    }
    const url = URL.createObjectURL(result.file);
    this.currentBlobUrl = url;
    // SECURITY: Blob URL points to locally generated HTML content from the
    // HtmlGeneratorService — it does not embed external or user-supplied scripts.
    this.htmlBlobUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    this.svgContent.set(null);
    this.markdownText.set(null);
  }

  private async generateMarkdownPreview(): Promise<void> {
    const result = await this.markdownGenerator.generateMarkdown(this.plan);
    if (!result.success || !result.file) {
      throw new Error(result.error || 'Markdown generation failed');
    }
    this.markdownText.set(await result.file.text());
    this.svgContent.set(null);
    this.htmlBlobUrl.set(null);
  }

  private cleanupBlobUrl(): void {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }
}
