import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  type OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxInputGradientComponent } from 'ngx-input-color/gradient-picker';

/**
 * A gradient designer wrapping `ngx-input-gradient` behind a signal-friendly
 * API. Provides click-to-add stops, draggable stops, per-stop colour picking,
 * rotation, and linear/radial types. Emits a CSS `linear-gradient(...)` string.
 */
@Component({
  selector: 'app-gradient-designer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgxInputGradientComponent],
  templateUrl: './gradient-designer.component.html',
  styleUrl: './gradient-designer.component.scss',
  host: {
    '[class.disabled]': 'disabled()',
  },
})
export class GradientDesignerComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private resizeObserver?: ResizeObserver;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current gradient as a CSS `linear-gradient(...)` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the serialized `linear-gradient(...)` string on change. */
  readonly valueChange = output<string>();

  /**
   * Same mount-timing workaround as ColorPickerComponent: the library measures
   * thumb geometry during writeValue, so we hold it back until the wrapper has
   * a real width (in case it appears only after a lazily-switched tab) and then
   * mount it once to measure tangible dimensions instead of zero.
   */
  protected readonly renderReady = signal(false);

  ngAfterViewInit(): void {
    if (this.host.nativeElement.offsetWidth > 0) {
      this.renderReady.set(true);
      return;
    }
    if (typeof ResizeObserver === 'undefined') {
      // Non-browser environments (e.g. unit tests) have no layout; mount anyway.
      this.renderReady.set(true);
      return;
    }
    this.resizeObserver = new ResizeObserver(() => {
      if (this.host.nativeElement.offsetWidth > 0) {
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.renderReady.set(true);
      }
    });
    this.resizeObserver.observe(this.host.nativeElement);

    // Fallback: if no real layout is ever reported (e.g. a global ResizeObserver
    // that never fires in a test environment), mount after a short delay so the
    // designer doesn't hang. Production browsers report a real size quickly.
    this.fallbackTimer = setTimeout(() => this.renderReady.set(true), 100);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  protected onGradientChange(gradient: string): void {
    if (this.disabled()) return;
    if (gradient) {
      this.valueChange.emit(gradient);
    }
  }
}
