/**
 * Element Reference Popup Component
 *
 * A floating popup that appears when the user types @ in the editor.
 * Allows searching and selecting elements to insert as references.
 */

import { CommonModule } from '@angular/common';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  HostListener,
  inject,
  input,
  type OnDestroy,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';

import { type ElementType } from '../../../../api-client';
import { type ElementSearchResult } from '../element-ref.model';
import { ElementRefService } from '../element-ref.service';

@Component({
  selector: 'app-element-ref-popup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
  ],
  templateUrl: './element-ref-popup.component.html',
  styleUrls: ['./element-ref-popup.component.scss'],
})
export class ElementRefPopupComponent implements AfterViewInit, OnDestroy {
  private readonly elementRefService = inject(ElementRefService);

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
    this.query.set('');
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
