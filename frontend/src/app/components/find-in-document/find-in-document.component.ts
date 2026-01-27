/**
 * Find in Document Component
 *
 * Provides an inline search bar for finding text within the editor.
 * Features:
 * - Real-time search as you type
 * - Match navigation (prev/next)
 * - Case sensitivity toggle
 * - Match counter display
 *
 * Designed for future extension to support replace functionality.
 */
import {
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FindInDocumentService } from '../../services/core/find-in-document.service';

@Component({
  selector: 'app-find-in-document',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  template: `
    <div class="find-bar" data-testid="find-bar">
      <div class="find-input-container">
        <input
          #searchInput
          type="text"
          class="find-input"
          placeholder="Find in document..."
          [ngModel]="findService.query()"
          (ngModelChange)="onQueryChange($event)"
          (keydown)="onKeydown($event)"
          data-testid="find-input"
          autocomplete="off"
          spellcheck="false" />
        <span class="match-counter" data-testid="find-match-counter">
          @if (findService.matchCount() > 0) {
            {{ findService.currentMatchNumber() }} of
            {{ findService.matchCount() }}
          } @else if (findService.query().length > 0) {
            No results
          }
        </span>
      </div>

      <div class="find-actions">
        <button
          mat-icon-button
          (click)="findService.toggleCaseSensitive()"
          [class.active]="findService.caseSensitive()"
          matTooltip="Match Case"
          data-testid="find-case-sensitive"
          type="button">
          <mat-icon>text_format</mat-icon>
        </button>

        <button
          mat-icon-button
          (click)="findService.previousMatch()"
          [disabled]="findService.matchCount() === 0"
          matTooltip="Previous Match (Shift+Enter)"
          data-testid="find-previous"
          type="button">
          <mat-icon>keyboard_arrow_up</mat-icon>
        </button>

        <button
          mat-icon-button
          (click)="findService.nextMatch()"
          [disabled]="findService.matchCount() === 0"
          matTooltip="Next Match (Enter)"
          data-testid="find-next"
          type="button">
          <mat-icon>keyboard_arrow_down</mat-icon>
        </button>

        <button
          mat-icon-button
          (click)="close()"
          matTooltip="Close (Escape)"
          data-testid="find-close"
          type="button">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .find-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: var(--sys-surface-container, #f5f5f5);
        border-bottom: 1px solid var(--sys-outline-variant, #e0e0e0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      :host-context(.dark-theme) .find-bar {
        background: var(--sys-surface-container, #2d2d2d);
        border-bottom-color: var(--sys-outline-variant, #444);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      .find-input-container {
        display: flex;
        align-items: center;
        flex: 1;
        gap: 8px;
        background: var(--sys-surface-container-high, #e8e8e8);
        border: 1px solid var(--sys-outline-variant, #ccc);
        border-radius: 4px;
        padding: 4px 8px;
        min-width: 200px;
        max-width: 400px;
      }

      :host-context(.dark-theme) .find-input-container {
        background: var(--sys-surface-container-high, #3d3d3d);
        border-color: var(--sys-outline-variant, #555);
      }

      .find-input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 14px;
        outline: none;
        min-width: 100px;
        color: var(--sys-on-surface, #000);
      }

      :host-context(.dark-theme) .find-input {
        color: var(--sys-on-surface, #e0e0e0);
      }

      .find-input::placeholder {
        color: var(--sys-on-surface-variant, #666);
      }

      :host-context(.dark-theme) .find-input::placeholder {
        color: var(--sys-on-surface-variant, #999);
      }

      .match-counter {
        font-size: 12px;
        color: var(--sys-on-surface-variant, #666);
        white-space: nowrap;
        min-width: 70px;
        text-align: right;
      }

      :host-context(.dark-theme) .match-counter {
        color: var(--sys-on-surface-variant, #aaa);
      }

      .find-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .find-actions button {
        color: var(--sys-on-surface-variant, #666);
      }

      :host-context(.dark-theme) .find-actions button {
        color: var(--sys-on-surface-variant, #bbb);
      }

      .find-actions button.active {
        color: var(--sys-primary, #006874);
        background: var(--sys-primary-container, #97f0ff);
      }

      :host-context(.dark-theme) .find-actions button.active {
        color: var(--sys-primary, #4fd8eb);
        background: var(--sys-primary-container, #004f58);
      }

      button[mat-icon-button] {
        width: 32px;
        height: 32px;
        line-height: 32px;
      }

      button[mat-icon-button] mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    `,
  ],
})
export class FindInDocumentComponent implements OnInit, OnDestroy {
  protected readonly findService = inject(FindInDocumentService);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  /** Debounce timer for search */
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Track if we should focus on open */
  private focusOnOpen = signal(false);

  constructor() {
    // Auto-focus when bar opens
    effect(() => {
      if (this.findService.isOpen() && this.focusOnOpen()) {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          this.searchInput?.nativeElement?.focus();
          this.searchInput?.nativeElement?.select();
        }, 0);
        this.focusOnOpen.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.focusOnOpen.set(true);
  }

  ngOnDestroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  /**
   * Handle query changes with debouncing for performance.
   */
  onQueryChange(query: string): void {
    // Clear existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search for better performance while typing
    this.searchTimeout = setTimeout(() => {
      this.findService.search(query);
    }, 150);
  }

  /**
   * Handle keyboard shortcuts within the search input.
   */
  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) {
          this.findService.previousMatch();
        } else {
          this.findService.nextMatch();
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.close();
        break;

      case 'F':
      case 'f':
        // Prevent Ctrl+F from triggering browser find
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          // Select all text in input for easy replacement
          this.searchInput?.nativeElement?.select();
        }
        break;
    }
  }

  /**
   * Close the find bar.
   */
  close(): void {
    this.findService.close();
  }
}
