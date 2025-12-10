/**
 * Element Reference Tooltip Component
 *
 * A rich tooltip shown when hovering over an element reference.
 * Designed for future expansion to include:
 * - Async content previews (first paragraph of document, character bio, etc.)
 * - Element metadata (type, location in tree, last modified)
 * - Quick actions
 * - Custom styling per element type
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  Input,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ElementType } from '../../../../api-client';
import { ElementRefService } from '../element-ref.service';

/**
 * Data for the tooltip
 */
export interface ElementRefTooltipData {
  /** Element ID */
  elementId: string;
  /** Element type */
  elementType: ElementType;
  /** Display name */
  displayText: string;
  /** Original element name */
  originalName: string;
  /** Screen position for tooltip */
  position: { x: number; y: number };
}

/**
 * Preview content loaded asynchronously
 */
export interface ElementPreviewContent {
  /** Short description or first paragraph */
  excerpt?: string;
  /** Path in the project tree */
  path?: string;
  /** Last modified date */
  lastModified?: Date;
  /** Word count (for documents) */
  wordCount?: number;
  /** Custom metadata fields */
  metadata?: Record<string, string>;
}

@Component({
  selector: 'app-element-ref-tooltip',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (isVisible()) {
      <div
        class="element-ref-tooltip tooltip-container"
        [class.tooltip-above]="showAbove()"
        [style.left.px]="tooltipPosition().x"
        [style.top.px]="tooltipPosition().y"
        role="tooltip"
        data-testid="element-ref-tooltip">
        <!-- Header with icon and name -->
        <div class="tooltip-header">
          <mat-icon class="type-icon" [class]="'type-' + data()?.elementType">
            {{ getTypeIcon() }}
          </mat-icon>
          <div class="tooltip-title">
            <span class="element-name">{{ data()?.originalName }}</span>
            @if (data()?.displayText !== data()?.originalName) {
              <span class="display-alias"
                >(shown as "{{ data()?.displayText }}")</span
              >
            }
          </div>
        </div>

        <!-- Type badge -->
        <div
          class="tooltip-type-badge"
          [class]="'badge-' + data()?.elementType">
          {{ formatElementType() }}
        </div>

        <!-- Preview content (async loaded) -->
        @if (isLoadingPreview()) {
          <div class="tooltip-preview loading">
            <mat-spinner diameter="16"></mat-spinner>
            <span>Loading preview...</span>
          </div>
        } @else if (previewContent()) {
          <div class="tooltip-preview">
            @if (previewContent()?.path) {
              <div class="preview-path">
                <mat-icon>folder</mat-icon>
                <span>{{ previewContent()?.path }}</span>
              </div>
            }
            @if (previewContent()?.excerpt) {
              <div class="preview-excerpt">{{ previewContent()?.excerpt }}</div>
            }
            @if (previewContent()?.wordCount) {
              <div class="preview-meta">
                {{ previewContent()?.wordCount }} words
              </div>
            }
          </div>
        }

        <!-- Hint -->
        <div class="tooltip-hint">
          <span>Click to edit • Right-click for options</span>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .tooltip-container {
        position: fixed;
        z-index: 10000;
        min-width: 200px;
        max-width: 320px;
        background: var(--sys-surface-container, #fff);
        border-radius: 8px;
        box-shadow:
          0 4px 16px rgba(0, 0, 0, 0.15),
          0 1px 4px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--sys-outline-variant, rgba(0, 0, 0, 0.12));
        padding: 12px;
        pointer-events: none;
        animation: tooltip-fade-in 0.15s ease-out;

        :host-context(.dark-theme) & {
          background: var(--sys-surface-container, #2d2d2d);
          border-color: var(--sys-outline-variant, rgba(255, 255, 255, 0.12));
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.4),
            0 1px 4px rgba(0, 0, 0, 0.2);
        }
      }

      @keyframes tooltip-fade-in {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .tooltip-container.tooltip-above {
        animation: tooltip-fade-in-above 0.15s ease-out;
      }

      @keyframes tooltip-fade-in-above {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .tooltip-header {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
      }

      .type-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        margin-top: 2px;

        &.type-ITEM {
          color: #1976d2;
        }
        &.type-CHARACTER {
          color: #7b1fa2;
        }
        &.type-LOCATION {
          color: #388e3c;
        }
        &.type-Folder {
          color: #f57c00;
        }

        :host-context(.dark-theme) & {
          &.type-ITEM {
            color: #64b5f6;
          }
          &.type-CHARACTER {
            color: #ce93d8;
          }
          &.type-LOCATION {
            color: #81c784;
          }
          &.type-Folder {
            color: #ffb74d;
          }
        }
      }

      .tooltip-title {
        flex: 1;
        min-width: 0;
      }

      .element-name {
        display: block;
        font-weight: 600;
        font-size: 14px;
        color: var(--sys-on-surface, #1c1b1f);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface, #e6e1e5);
        }
      }

      .display-alias {
        display: block;
        font-size: 11px;
        color: var(--sys-on-surface-variant, #49454f);
        margin-top: 2px;

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface-variant, #cac4d0);
        }
      }

      .tooltip-type-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;

        &.badge-ITEM {
          background: rgba(25, 118, 210, 0.1);
          color: #1565c0;

          :host-context(.dark-theme) & {
            background: rgba(100, 181, 246, 0.15);
            color: #90caf9;
          }
        }

        &.badge-CHARACTER {
          background: rgba(123, 31, 162, 0.1);
          color: #6a1b9a;

          :host-context(.dark-theme) & {
            background: rgba(206, 147, 216, 0.15);
            color: #e1bee7;
          }
        }

        &.badge-LOCATION {
          background: rgba(56, 142, 60, 0.1);
          color: #2e7d32;

          :host-context(.dark-theme) & {
            background: rgba(129, 199, 132, 0.15);
            color: #a5d6a7;
          }
        }

        &.badge-Folder {
          background: rgba(245, 124, 0, 0.1);
          color: #e65100;

          :host-context(.dark-theme) & {
            background: rgba(255, 183, 77, 0.15);
            color: #ffcc80;
          }
        }
      }

      .tooltip-preview {
        padding: 8px 0;
        border-top: 1px solid var(--sys-outline-variant, rgba(0, 0, 0, 0.08));

        :host-context(.dark-theme) & {
          border-color: var(--sys-outline-variant, rgba(255, 255, 255, 0.08));
        }

        &.loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--sys-on-surface-variant, #49454f);
          font-size: 12px;

          :host-context(.dark-theme) & {
            color: var(--sys-on-surface-variant, #cac4d0);
          }
        }
      }

      .preview-path {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--sys-on-surface-variant, #49454f);
        margin-bottom: 6px;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface-variant, #cac4d0);
        }
      }

      .preview-excerpt {
        font-size: 12px;
        color: var(--sys-on-surface, #1c1b1f);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface, #e6e1e5);
        }
      }

      .preview-meta {
        font-size: 11px;
        color: var(--sys-on-surface-variant, #49454f);
        margin-top: 6px;

        :host-context(.dark-theme) & {
          color: var(--sys-on-surface-variant, #cac4d0);
        }
      }

      .tooltip-hint {
        padding-top: 8px;
        border-top: 1px solid var(--sys-outline-variant, rgba(0, 0, 0, 0.08));
        font-size: 10px;
        color: var(--sys-on-surface-variant, #49454f);
        text-align: center;

        :host-context(.dark-theme) & {
          border-color: var(--sys-outline-variant, rgba(255, 255, 255, 0.08));
          color: var(--sys-on-surface-variant, #cac4d0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElementRefTooltipComponent {
  private elementRefService = inject(ElementRefService);

  /** The tooltip data */
  @Input() set tooltipData(value: ElementRefTooltipData | null) {
    this._data.set(value);
    if (value) {
      void this.loadPreviewContent(value.elementId);
    } else {
      this.previewContent.set(null);
      this.isLoadingPreview.set(false);
    }
  }

  // Internal state
  private _data = signal<ElementRefTooltipData | null>(null);
  readonly data = this._data.asReadonly();

  /** Whether tooltip is visible */
  readonly isVisible = computed(() => this._data() !== null);

  /** Preview content (loaded async) */
  readonly previewContent = signal<ElementPreviewContent | null>(null);
  readonly isLoadingPreview = signal(false);

  /** Whether to show tooltip above the element (if near bottom of screen) */
  readonly showAbove = computed(() => {
    const data = this._data();
    if (!data) return false;
    const tooltipHeight = 200; // Approximate max height
    return data.position.y + tooltipHeight > window.innerHeight - 20;
  });

  /** Calculated tooltip position */
  readonly tooltipPosition = computed(() => {
    const data = this._data();
    if (!data) return { x: 0, y: 0 };

    const tooltipWidth = 280;
    const tooltipHeight = 200;
    const padding = 12;

    let x = data.position.x;
    let y = this.showAbove()
      ? data.position.y - tooltipHeight - padding
      : data.position.y + padding;

    // Keep within viewport horizontally
    if (x + tooltipWidth > window.innerWidth - padding) {
      x = window.innerWidth - tooltipWidth - padding;
    }
    if (x < padding) x = padding;

    // Ensure y is within bounds
    if (y < padding) y = padding;
    if (y + tooltipHeight > window.innerHeight - padding) {
      y = window.innerHeight - tooltipHeight - padding;
    }

    return { x, y };
  });

  /** Get icon for element type (delegates to service for consistency with tree/tabs) */
  getTypeIcon(): string {
    const data = this._data();
    if (!data) return 'article';

    // Try to get the actual element for full icon resolution (including custom metadata icons)
    const element = this.elementRefService.getElementById(data.elementId);
    if (element) {
      return this.elementRefService.getElementIcon(element);
    }

    // Fallback to type-based icon if element not found
    return this.elementRefService.getDefaultIconForType(data.elementType);
  }

  /** Format element type for display (delegates to service) */
  formatElementType(): string {
    const type = this._data()?.elementType;
    if (!type) return 'Unknown';
    return this.elementRefService.formatElementType(type);
  }

  /** Load preview content for an element */
  private loadPreviewContent(elementId: string): void {
    this.isLoadingPreview.set(true);

    try {
      // Get element from service
      const element = this.elementRefService.getElementById(elementId);

      if (element) {
        // For now, just show basic info - async content loading can be added later
        // TODO: Load actual content preview asynchronously
        this.previewContent.set({
          path: undefined, // Will be populated when path building is available
          excerpt: undefined, // Will load document excerpt asynchronously
          wordCount: undefined, // Will be calculated from document content
        });
      }
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  /** Close tooltip on Escape */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this._data.set(null);
  }
}
