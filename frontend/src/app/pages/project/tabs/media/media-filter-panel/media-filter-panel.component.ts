import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

export type MediaCategory =
  | 'all'
  | 'cover'
  | 'generated'
  | 'inline'
  | 'published'
  | 'other';

export interface MediaFilterState {
  category: MediaCategory;
  elementIds: string[];
  tagIds: string[];
  dateFrom: Date | null;
  dateTo: Date | null;
}

export interface FilterElement {
  id: string;
  name: string;
  icon: string;
}

export interface FilterTag {
  id: string;
  name: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-media-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatTooltipModule,
  ],
  templateUrl: './media-filter-panel.component.html',
  styleUrls: ['./media-filter-panel.component.scss'],
})
export class MediaFilterPanelComponent {
  /** Current filter state */
  filters = input.required<MediaFilterState>();

  /** Available elements for resolving selected IDs */
  availableElements = input<FilterElement[]>([]);

  /** Available project tags for resolving selected IDs */
  availableTags = input<FilterTag[]>([]);

  /** Emitted when a filter changes */
  filtersChange = output<MediaFilterState>();

  /** Emitted when user wants to add element filters via dialog */
  addElement = output<void>();

  /** Emitted when user wants to add tag filters via dialog */
  addTag = output<void>();

  /** Emitted when "Clear all" is clicked */
  clearAll = output<void>();

  /** Emitted when the panel should close (mobile dialog) */
  closePanel = output<void>();

  readonly categories: { value: MediaCategory; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'generated', label: 'Generated' },
    { value: 'cover', label: 'Cover' },
    { value: 'inline', label: 'Inline Images' },
    { value: 'published', label: 'Published' },
    { value: 'other', label: 'Other' },
  ];

  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.category !== 'all') count++;
    count += f.elementIds.length;
    count += f.tagIds.length;
    if (f.dateFrom) count++;
    if (f.dateTo) count++;
    return count;
  });

  /** Resolved selected element objects */
  readonly selectedElements = computed(() => {
    const ids = this.filters().elementIds;
    const all = this.availableElements();
    return ids
      .map(id => all.find(el => el.id === id))
      .filter((el): el is FilterElement => el !== undefined);
  });

  /** Resolved selected tag objects */
  readonly selectedTags = computed(() => {
    const ids = this.filters().tagIds;
    const all = this.availableTags();
    return ids
      .map(id => all.find(t => t.id === id))
      .filter((t): t is FilterTag => t !== undefined);
  });

  setCategory(category: MediaCategory): void {
    this.filtersChange.emit({ ...this.filters(), category });
  }

  removeElement(elementId: string): void {
    const current = this.filters();
    this.filtersChange.emit({
      ...current,
      elementIds: current.elementIds.filter(id => id !== elementId),
    });
  }

  removeTag(tagId: string): void {
    const current = this.filters();
    this.filtersChange.emit({
      ...current,
      tagIds: current.tagIds.filter(id => id !== tagId),
    });
  }

  onAddElement(): void {
    this.addElement.emit();
  }

  onAddTag(): void {
    this.addTag.emit();
  }

  setDateFrom(date: Date | null): void {
    this.filtersChange.emit({ ...this.filters(), dateFrom: date });
  }

  setDateTo(date: Date | null): void {
    this.filtersChange.emit({ ...this.filters(), dateTo: date });
  }

  onClearAll(): void {
    this.clearAll.emit();
  }

  onClose(): void {
    this.closePanel.emit();
  }
}
