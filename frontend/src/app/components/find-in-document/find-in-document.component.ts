/**
 * Find and Replace Component
 *
 * Provides an inline search bar for finding and replacing text within the editor.
 * Features:
 * - Real-time search as you type
 * - Match navigation (prev/next)
 * - Case sensitivity toggle
 * - Match counter display
 * - Replace current match
 * - Replace all matches
 */
import {
  Component,
  effect,
  type ElementRef,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FindInDocumentService } from '@services/core/find-in-document.service';

@Component({
  selector: 'app-find-in-document',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './find-in-document.component.html',
  styleUrls: ['./find-in-document.component.scss'],
})
export class FindInDocumentComponent implements OnInit, OnDestroy {
  protected readonly findService = inject(FindInDocumentService);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  /** Debounce timer for search */
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Track if we should focus on open */
  private readonly focusOnOpen = signal(false);

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

  /**
   * Handle keyboard shortcuts within the replace input.
   */
  onReplaceKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) {
          // Shift+Enter in replace field does replace all
          this.onReplaceAll();
        } else {
          // Enter in replace field does single replace
          this.onReplace();
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  /**
   * Replace the current match.
   */
  onReplace(): void {
    this.findService.replace();
  }

  /**
   * Replace all matches.
   */
  onReplaceAll(): void {
    this.findService.replaceAll();
  }
}
