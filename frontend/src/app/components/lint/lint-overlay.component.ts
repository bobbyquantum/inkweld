import {
  Component,
  ElementRef,
  inject,
  Input,
  type OnChanges,
  type OnInit,
  ViewEncapsulation,
} from '@angular/core';
import {
  MatTooltipModule,
  type TooltipPosition,
} from '@angular/material/tooltip';

import { type ExtendedCorrectionDto } from './correction-dto.extension';

@Component({
  selector: 'app-lint-overlay',
  imports: [MatTooltipModule],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './lint-overlay.component.html',
  styleUrls: ['./lint-overlay.component.scss'],
})
export class LintOverlayComponent implements OnInit, OnChanges {
  private readonly elementRef = inject(ElementRef);

  @Input() recommendations: ExtendedCorrectionDto[] = [];
  @Input() position: TooltipPosition = 'below';

  tipContent = '';

  constructor() {
    // Listen for custom events for accept/reject actions
    document.addEventListener('lint-accept', (event: Event) => {
      const customEvent = event as CustomEvent<ExtendedCorrectionDto>;
      this.handleAccept(customEvent);
    });
    document.addEventListener('lint-reject', (event: Event) => {
      const customEvent = event as CustomEvent<ExtendedCorrectionDto>;
      this.handleReject(customEvent);
    });
  }

  ngOnInit(): void {
    this.updateTipContent();
  }

  ngOnChanges(): void {
    this.updateTipContent();
  }

  private handleAccept(event: CustomEvent<ExtendedCorrectionDto>): void {
    const correction = event.detail;
    if (correction) {
      // Dispatch a custom event that will be handled by the plugin
      document.dispatchEvent(
        new CustomEvent('lint-correction-accept', {
          detail: correction,
        })
      );
    }
  }

  private handleReject(event: CustomEvent<ExtendedCorrectionDto>): void {
    const correction = event.detail;
    if (correction) {
      // Dispatch a custom event that will be handled by the plugin
      document.dispatchEvent(
        new CustomEvent('lint-correction-reject', {
          detail: correction,
        })
      );
    }
  }

  private updateTipContent(): void {
    if (!this.recommendations || this.recommendations.length === 0) {
      this.tipContent = '';
      return;
    }

    // Format the recommendations as a nicely formatted list
    const formattedTips = this.recommendations.map(rec => {
      const suggestion = rec.correctedText || '';
      const errorText = rec.originalText || '';

      return (
        `<div class="lint-tip-title">${suggestion}</div>` +
        `<div class="lint-tip-reason">${errorText}</div>` +
        `<div class="lint-action-buttons">
          <button class="lint-action-button lint-accept-button" onclick="document.dispatchEvent(new CustomEvent('lint-accept', {detail: ${JSON.stringify(rec)}}))">
            <span class="lint-action-button-icon">✓</span> Accept
          </button>
          <button class="lint-action-button lint-reject-button" onclick="document.dispatchEvent(new CustomEvent('lint-reject', {detail: ${JSON.stringify(rec)}}))">
            <span class="lint-action-button-icon">✕</span> Reject
          </button>
        </div>`
      );
    });

    this.tipContent = formattedTips.join(
      '<hr style="margin: 8px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.2);">'
    );
  }
}
