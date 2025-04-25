import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { MatTooltipModule, TooltipPosition } from '@angular/material/tooltip';

import { StyleRecommendationDto } from '../../../api-client/model/style-recommendation-dto';

@Component({
  selector: 'app-lint-overlay',
  standalone: true,
  imports: [MatTooltipModule],
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
  @Input() recommendations: StyleRecommendationDto[] = [];
  @Input() position: TooltipPosition = 'below';

  tipContent = '';

  constructor(private elementRef: ElementRef) {}

  ngOnInit(): void {
    this.updateTipContent();
  }

  ngOnChanges(): void {
    this.updateTipContent();
  }

  private updateTipContent(): void {
    if (!this.recommendations || this.recommendations.length === 0) {
      this.tipContent = '';
      return;
    }

    // Format the recommendations as a nicely formatted list
    const formattedTips = this.recommendations.map(rec => {
      return (
        `<div class="lint-tip-title">${rec.suggestion}</div>` +
        `<div class="lint-tip-reason">${rec.reason}</div>`
      );
    });

    this.tipContent = formattedTips.join(
      '<hr style="margin: 8px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.2);">'
    );
  }
}
