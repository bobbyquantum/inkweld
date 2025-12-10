/**
 * Element Reference Popup Component
 *
 * A floating popup that appears when the user types @ in the editor.
 * Allows searching and selecting elements to insert as references.
 */

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';

import { ElementType } from '../../../../api-client';
import { ElementSearchResult } from '../element-ref.model';
import { ElementRefService } from '../element-ref.service';

@Component({
  selector: 'app-element-ref-popup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
  ],
  template: `
    <div
      class="element-ref-popup"
      data-testid="element-ref-popup"
      [style.left.px]="position().x"
      [style.top.px]="position().y"
      tabindex="-1"
      role="dialog"
      aria-label="Element reference popup"
      (keydown)="onKeyDown($event)">
      <!-- Search Input -->
      <div class="popup-search">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          #searchInput
          type="text"
          class="search-input"
          data-testid="element-ref-search-input"
          [value]="query()"
          (input)="onSearchInput($event)"
          placeholder="Search elements..."
          autocomplete="off"
          role="combobox"
          aria-label="Search elements"
          aria-controls="element-ref-results"
          [attr.aria-expanded]="results().length > 0" />
      </div>

      <!-- Results List -->
      <div
        class="popup-results"
        id="element-ref-results"
        role="listbox"
        data-testid="element-ref-results">
        @if (results().length === 0) {
          <div class="no-results" data-testid="element-ref-no-results">
            @if (query()) {
              <span>No elements match "{{ query() }}"</span>
            } @else {
              <span>Type to search elements...</span>
            }
          </div>
        } @else {
          @for (result of results(); track result.element.id; let i = $index) {
            <div
              class="result-item"
              data-testid="element-ref-result-item"
              [class.selected]="i === selectedIndex()"
              tabindex="0"
              role="option"
              [attr.aria-selected]="i === selectedIndex()"
              (click)="selectResult(result)"
              (keydown.enter)="selectResult(result)"
              (mouseenter)="selectedIndex.set(i)">
              <mat-icon class="result-icon">{{ result.icon }}</mat-icon>
              <div class="result-content">
                <span class="result-name">{{ result.element.name }}</span>
                @if (result.path) {
                  <span class="result-path">{{ result.path }}</span>
                }
              </div>
              <span class="result-type">{{
                formatType(result.element.type)
              }}</span>
            </div>
          }
        }
      </div>

      <!-- Keyboard Hints -->
      <div class="popup-hints">
        <span><kbd>↑↓</kbd> Navigate</span>
        <span><kbd>Enter</kbd> Select</span>
        <span><kbd>Esc</kbd> Cancel</span>
      </div>
    </div>
  `,
  styles: [
    `
      .element-ref-popup {
        position: fixed;
        z-index: 1000;
        min-width: 300px;
        max-width: 400px;
        max-height: 350px;
        background: var(--sys-surface, #fff);
        border: 1px solid var(--sys-outline-variant, #ccc);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .popup-search {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--sys-outline-variant, #eee);
        gap: 8px;
      }

      .search-icon {
        color: var(--sys-on-surface-variant, #666);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 14px;
        background: transparent;
        color: var(--sys-on-surface, #000);
      }

      .search-input::placeholder {
        color: var(--sys-on-surface-variant, #888);
      }

      .popup-results {
        flex: 1;
        overflow-y: auto;
        max-height: 250px;
      }

      .no-results {
        padding: 16px;
        text-align: center;
        color: var(--sys-on-surface-variant, #666);
        font-size: 13px;
      }

      .result-item {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        cursor: pointer;
        gap: 8px;
        transition: background-color 0.1s ease;
      }

      .result-item:hover,
      .result-item.selected {
        background-color: var(--sys-surface-container-high, #f0f0f0);
      }

      .result-icon {
        color: var(--sys-primary, #6750a4);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .result-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .result-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--sys-on-surface, #000);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .result-path {
        font-size: 11px;
        color: var(--sys-on-surface-variant, #666);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .result-type {
        font-size: 11px;
        color: var(--sys-on-surface-variant, #888);
        text-transform: capitalize;
      }

      .popup-hints {
        display: flex;
        gap: 12px;
        padding: 6px 12px;
        border-top: 1px solid var(--sys-outline-variant, #eee);
        font-size: 11px;
        color: var(--sys-on-surface-variant, #888);
      }

      .popup-hints kbd {
        background: var(--sys-surface-container, #eee);
        padding: 2px 4px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
      }

      /* Dark theme */
      :host-context(.dark-theme) .element-ref-popup {
        background: var(--sys-surface, #1e1e1e);
        border-color: var(--sys-outline-variant, #444);
      }
    `,
  ],
})
export class ElementRefPopupComponent implements AfterViewInit, OnDestroy {
  private elementRefService = inject(ElementRefService);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  /** Position for the popup */
  position = input.required<{ x: number; y: number }>();

  /** Initial search query */
  initialQuery = input<string>('');

  /** Emitted when an element is selected */
  selected = output<ElementSearchResult>();

  /** Emitted when the popup should close */
  closed = output<void>();

  /** Current search query */
  query = signal('');

  /** Currently selected index */
  selectedIndex = signal(0);

  /** Search results */
  results = computed(() => {
    return this.elementRefService.searchElements(this.query(), { limit: 8 });
  });

  constructor() {
    // Set initial query when input changes
    effect(() => {
      const initial = this.initialQuery();
      if (initial) {
        this.query.set(initial);
      }
    });

    // Reset selection when results change
    effect(() => {
      const _ = this.results();
      this.selectedIndex.set(0);
    });
  }

  ngAfterViewInit(): void {
    // Focus the search input
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 0);
  }

  ngOnDestroy(): void {
    // Component cleanup handled by Angular
    // Placeholder for future cleanup logic if needed
    void 0; // Satisfy no-empty-lifecycle-method rule
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.query.set(input.value);
    this.elementRefService.setSearchQuery(input.value);
  }

  onKeyDown(event: KeyboardEvent): void {
    const results = this.results();
    const currentIndex = this.selectedIndex();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < results.length - 1) {
          this.selectedIndex.set(currentIndex + 1);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          this.selectedIndex.set(currentIndex - 1);
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (results.length > 0 && currentIndex < results.length) {
          this.selectResult(results[currentIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.closed.emit();
        break;

      case 'Tab':
        // Prevent tab from moving focus outside popup
        event.preventDefault();
        break;
    }
  }

  selectResult(result: ElementSearchResult): void {
    this.selected.emit(result);
  }

  formatType(type: ElementType): string {
    return this.elementRefService.formatElementType(type);
  }

  /** Close popup when clicking outside */
  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const popup = target.closest('.element-ref-popup');
    if (!popup) {
      this.closed.emit();
    }
  }
}
