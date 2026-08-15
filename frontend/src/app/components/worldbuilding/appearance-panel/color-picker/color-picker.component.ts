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
import { NgxInputColorComponent } from 'ngx-input-color/color-picker';

import { normalizeHex } from '../../../../utils/color';

/**
 * A colour chooser for a solid background colour, embedded inline in the panel
 * (no popup/dialog). Wraps `ngx-input-color` behind a signal-friendly API and
 * emits a normalized hex string.
 */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgxInputColorComponent],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
  host: {
    '[class.disabled]': 'disabled()',
  },
})
export class ColorPickerComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private resizeObserver?: ResizeObserver;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current color as a `#rrggbb` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the normalized `#rrggbb` color whenever the user changes it. */
  readonly valueChange = output<string>();

  /**
   * The wrapped library computes its saturation-board thumb position from a
   * getBoundingClientRect() measurement taken during writeValue. If the picker
   * mounts before it has any real layout (e.g. inside a lazily-switched tab)
   * that measurement is zero and the thumb sticks to the top-left. We therefore
   * hold the library back until the wrapper reports a real width, then mount it
   * once, so writeValue always measures tangible dimensions.
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
    // picker doesn't hang. Production browsers report a real size quickly.
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

  protected onColorChange(colour: string): void {
    const normalized = normalizeHex(colour);
    if (normalized) {
      this.valueChange.emit(normalized);
    }
  }
}
