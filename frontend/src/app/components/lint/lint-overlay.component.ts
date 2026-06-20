import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Input,
  type OnChanges,
  type OnDestroy,
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
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./lint-overlay.component.scss'],
})
export class LintOverlayComponent implements OnInit, OnChanges, OnDestroy {
  private readonly elementRef = inject(ElementRef);

  @Input() recommendations: ExtendedCorrectionDto[] = [];
  @Input() position: TooltipPosition = 'below';

  tipContent = '';

  private readonly handleAcceptBound = (event: Event): void => {
    this.handleAccept(event as CustomEvent<ExtendedCorrectionDto>);
  };

  private readonly handleRejectBound = (event: Event): void => {
    this.handleReject(event as CustomEvent<ExtendedCorrectionDto>);
  };

  constructor() {
    // Listen for custom events for accept/reject actions
    document.addEventListener('lint-accept', this.handleAcceptBound);
    document.addEventListener('lint-reject', this.handleRejectBound);
  }

  ngOnDestroy(): void {
    document.removeEventListener('lint-accept', this.handleAcceptBound);
    document.removeEventListener('lint-reject', this.handleRejectBound);
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
