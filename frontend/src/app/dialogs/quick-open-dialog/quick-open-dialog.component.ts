import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ElementType } from '@inkweld/index';

import {
  QuickOpenResult,
  QuickOpenService,
} from '../../services/core/quick-open.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';

/**
 * Quick open dialog for fast file navigation (Cmd/Ctrl + P).
 *
 * Features:
 * - Fuzzy search across all project elements
 * - Recent files shown when no query
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Character highlighting for matches
 */
@Component({
  selector: 'app-quick-open-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './quick-open-dialog.component.html',
  styleUrls: ['./quick-open-dialog.component.scss'],
})
export class QuickOpenDialogComponent implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<QuickOpenDialogComponent>);
  private readonly quickOpenService = inject(QuickOpenService);
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  /** Current search query */
  readonly searchQuery = signal('');

  /** Currently selected index in results */
  readonly selectedIndex = signal(0);

  /** Search results */
  readonly results = computed(() => {
    return this.quickOpenService.search(this.searchQuery());
  });

  /** Whether we're showing recent files (no query) */
  readonly showingRecent = computed(() => {
    return !this.searchQuery().trim();
  });

  /** Keyboard event listener reference */
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  ngAfterViewInit(): void {
    // Focus the search input
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    });

    // Set up keyboard navigation
    this.keydownListener = (event: KeyboardEvent) => {
      this.handleKeydown(event);
    };
    document.addEventListener('keydown', this.keydownListener, true);
  }

  ngOnDestroy(): void {
    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener, true);
    }
  }

  /**
   * Handle search input changes.
   */
  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.selectedIndex.set(0); // Reset selection when query changes
  }

  /**
   * Handle keyboard navigation.
   */
  private handleKeydown(event: KeyboardEvent): void {
    const results = this.results();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.selectedIndex.set(
          Math.min(this.selectedIndex() + 1, results.length - 1)
        );
        this.scrollSelectedIntoView();
        break;

      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.selectedIndex.set(Math.max(this.selectedIndex() - 1, 0));
        this.scrollSelectedIntoView();
        break;

      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.selectResult(results[this.selectedIndex()]);
        break;

      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.dialogRef.close();
        break;
    }
  }

  /**
   * Scroll the selected item into view.
   */
  private scrollSelectedIntoView(): void {
    setTimeout(() => {
      const selected = document.querySelector('.result-item.selected');
      selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  /**
   * Select a result and open the document.
   */
  selectResult(result: QuickOpenResult | undefined): void {
    if (!result) return;

    // Open the document in the project
    this.projectState.openDocument(result.element);

    // Close the dialog
    this.dialogRef.close(result.element);
  }

  /**
   * Handle click on a result item.
   */
  onResultClick(result: QuickOpenResult, index: number): void {
    this.selectedIndex.set(index);
    this.selectResult(result);
  }

  /**
   * Handle mouse enter on a result item.
   */
  onResultMouseEnter(index: number): void {
    this.selectedIndex.set(index);
  }

  /**
   * Get icon for an element.
   */
  getIcon(result: QuickOpenResult): string {
    const element = result.element;
    const elementType = element.type;

    // For Worldbuilding elements, look up the icon from the schema
    if (elementType === ElementType.Worldbuilding && element.schemaId) {
      const schema = this.worldbuildingService.getSchemaById(element.schemaId);
      if (schema?.icon) {
        return schema.icon;
      }
      return 'category';
    }

    // Items (documents) use description icon
    if (elementType === ElementType.Item) {
      return 'description';
    }

    // Folders (shouldn't normally appear but handle anyway)
    if (elementType === ElementType.Folder) {
      return 'folder';
    }

    return 'description';
  }

  /**
   * Get highlighted name HTML for a result.
   * Wraps matched characters in <mark> tags, grouping consecutive matches.
   */
  getHighlightedName(result: QuickOpenResult): string {
    const name = result.element.name;
    const positions = new Set(result.matchPositions);

    if (positions.size === 0) {
      return this.escapeHtml(name);
    }

    let html = '';
    let inMark = false;

    for (let i = 0; i < name.length; i++) {
      const char = this.escapeHtml(name[i]);
      const isMatch = positions.has(i);

      if (isMatch && !inMark) {
        // Start a new mark tag
        html += '<mark>';
        inMark = true;
      } else if (!isMatch && inMark) {
        // Close the mark tag
        html += '</mark>';
        inMark = false;
      }

      html += char;
    }

    // Close any remaining mark tag
    if (inMark) {
      html += '</mark>';
    }

    return html;
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Track by function for results.
   */
  trackByElementId(_index: number, result: QuickOpenResult): string {
    return result.element.id;
  }
}
