import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import {
  type MatChipInputEvent,
  MatChipsModule,
} from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TagService } from '../../services/tag/tag.service';
import { type ResolvedTag, type TagDefinition } from './tag.model';

/**
 * Autocomplete option value type
 */
type TagAutocompleteValue = TagDefinition | { name: string; isNew: true };

/**
 * Chip list for displaying and editing tags on an element.
 * Supports:
 * - Displaying current tags as colored chips
 * - Autocomplete search for adding tags
 * - Creating new custom tags inline
 * - Removing tags
 */
@Component({
  selector: 'app-tag-chip-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatAutocompleteModule,
    MatTooltipModule,
  ],
  templateUrl: './tag-chip-list.component.html',
  styleUrls: ['./tag-chip-list.component.scss'],
})
export class TagChipListComponent {
  private readonly tagService = inject(TagService);

  /** Element ID to manage tags for */
  elementId = input.required<string>();

  /** Label for the form field */
  label = input<string>('Tags');

  /** Hint text below the field */
  hint = input<string>('');

  /** Whether the field is read-only */
  readonly = input<boolean>(false);

  /** Whether to use compact styling */
  compact = input<boolean>(false);

  /** Whether to allow creating custom tags inline */
  allowCustomTags = input<boolean>(true);

  /** Emitted when tags change */
  @Output() tagsChanged = new EventEmitter<ResolvedTag[]>();

  /** Current input value for autocomplete */
  tagInputValue = '';

  /** Separator key codes for chip input */
  readonly separatorKeyCodes = [ENTER, COMMA] as const;

  /** Resolved tags for the current element */
  readonly resolvedTags = computed(() => {
    const elementId = this.elementId();
    if (!elementId) return [];
    return this.tagService.getResolvedTagsForElement(elementId);
  });

  /** Tags available for adding (not already on the element) */
  readonly availableTags = computed(() => {
    const elementId = this.elementId();
    if (!elementId) return [];
    return this.tagService.getAvailableTagsForElement(elementId);
  });

  /** Filtered tags based on input */
  readonly filteredTags = computed(() => {
    const available = this.availableTags();
    const query = this.tagInputValue.toLowerCase();
    if (!query) return available;
    return available.filter(t => t.name.toLowerCase().includes(query));
  });

  /**
   * Add a tag from autocomplete selection
   */
  selectTag(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as TagAutocompleteValue;

    if ('isNew' in value && value.isNew) {
      // Create a new custom tag
      this.createAndAddTag(value.name);
    } else {
      // Add existing tag
      const tag = value as TagDefinition;
      this.tagService.addTag(this.elementId(), tag.id);
    }

    this.tagInputValue = '';
    this.emitChange();
  }

  /**
   * Add a tag from manual input (Enter/comma)
   */
  addTagFromInput(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (!value) return;

    // Check if there's an exact match in available tags
    const exactMatch = this.availableTags().find(
      t => t.name.toLowerCase() === value.toLowerCase()
    );

    if (exactMatch) {
      this.tagService.addTag(this.elementId(), exactMatch.id);
    } else if (this.allowCustomTags()) {
      this.createAndAddTag(value);
    }

    // Clear input
    event.chipInput.clear();
    this.tagInputValue = '';
    this.emitChange();
  }

  /**
   * Remove a tag from the element
   */
  removeTag(tag: ResolvedTag): void {
    if (this.readonly()) return;
    this.tagService.removeTag(this.elementId(), tag.definition.id);
    this.emitChange();
  }

  /**
   * Create a new custom tag and add it to the element
   */
  private createAndAddTag(name: string): void {
    const newTag = this.tagService.createCustomTag({
      name,
      icon: 'label',
      color: '#607D8B', // Blue grey
      description: '',
    });
    this.tagService.addTag(this.elementId(), newTag.id);
  }

  /**
   * Emit tag change event
   */
  private emitChange(): void {
    this.tagsChanged.emit(this.resolvedTags());
  }
}
