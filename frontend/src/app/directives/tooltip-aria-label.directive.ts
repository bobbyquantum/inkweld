import {
  type AfterViewInit,
  Directive,
  type DoCheck,
  ElementRef,
  inject,
  Renderer2,
} from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * Icon-only Material buttons with a `matTooltip` have no accessible name:
 * MatTooltip only sets `aria-describedby`. Add `appTooltipAriaLabel` to mirror
 * the tooltip text into `aria-label`, unless the button already names itself.
 */
@Directive({
  selector: '[appTooltipAriaLabel][matTooltip]',
})
export class TooltipAriaLabelDirective implements AfterViewInit, DoCheck {
  private readonly tooltip = inject(MatTooltip, { self: true });
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  private active = false;
  private applied: string | null = null;

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    // Checked after the parent's bindings ran, so bound labels count too.
    const named =
      host.hasAttribute('aria-label') || host.hasAttribute('aria-labelledby');
    if (named) return;
    this.active = true;
    this.sync();
  }

  ngDoCheck(): void {
    if (this.active) this.sync();
  }

  private sync(): void {
    const message = this.tooltip.message?.trim() || null;
    if (message === this.applied) return;
    this.applied = message;
    if (message) {
      this.renderer.setAttribute(this.el.nativeElement, 'aria-label', message);
    } else {
      this.renderer.removeAttribute(this.el.nativeElement, 'aria-label');
    }
  }
}
