import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { MatTooltipModule, TooltipPosition } from '@angular/material/tooltip';

import { PostLint200ResponseCorrectionsInner } from '../../../api-client/model/post-lint200-response-corrections-inner';

@Component({
  selector: 'app-lint-overlay',
  standalone: true,
  imports: [MatTooltipModule, CommonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <span
      class="lint-tip-host"
      [matTooltip]="tipContent"
      [matTooltipPosition]="position"
      matTooltipClass="lint-tip">
      <ng-content></ng-content>
    </span>
  `,
  styles: [
    `
      .lint-tip-host {
        display: inline-block;
      }
      .lint-tip {
        max-width: 300px;
        white-space: pre-line;
        padding: 10px;
        font-size: 14px;
        line-height: 1.4;
        background-color: rgba(33, 33, 33, 0.95);
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      }
      .lint-tip-title {
        font-weight: bold;
        margin-bottom: 4px;
      }
      .lint-tip-reason {
        font-style: italic;
        color: #e0e0e0;
      }
    `,
  ],
})
export class LintOverlayComponent implements OnInit, OnChanges {
  private elementRef = inject(ElementRef);

  @Input() recommendations: PostLint200ResponseCorrectionsInner[] = [];
  @Input() position: TooltipPosition = 'below';

  tipContent = '';

  constructor() {
    // Listen for custom events for accept/reject actions
    document.addEventListener('lint-accept', (event: Event) => {
      const customEvent =
        event as CustomEvent<PostLint200ResponseCorrectionsInner>;
      this.handleAccept(customEvent);
    });
    document.addEventListener('lint-reject', (event: Event) => {
      const customEvent =
        event as CustomEvent<PostLint200ResponseCorrectionsInner>;
      this.handleReject(customEvent);
    });
  }

  ngOnInit(): void {
    this.updateTipContent();
  }

  ngOnChanges(): void {
    this.updateTipContent();
  }

  private handleAccept(
    event: CustomEvent<PostLint200ResponseCorrectionsInner>
  ): void {
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

  private handleReject(
    event: CustomEvent<PostLint200ResponseCorrectionsInner>
  ): void {
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
      const suggestion = rec.corrected_text || '';
      const errorText = rec.original_text || '';

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
