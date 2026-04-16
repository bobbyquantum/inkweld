import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type TagDefinition } from '@components/tags/tag.model';
import { type Element, ElementType } from '@inkweld/index';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';

/**
 * A unified selectable item — either an element or a project tag.
 */
export interface TagPickerItem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Material icon */
  icon: string;
  /** Icon color (for project tags) */
  iconColor?: string;
  /** Subtitle / type label */
  typeLabel: string;
  /** Whether this is a project tag (vs element) */
  isProjectTag: boolean;
  /** Source element (if element) */
  element?: Element;
  /** Source tag definition (if project tag) */
  tag?: TagDefinition;
}

/**
 * Dialog data for the unified tag picker
 */
export interface TagPickerDialogData {
  /** Title for the dialog */
  title?: string;
  /** Subtitle/instructions */
  subtitle?: string;
  /** Element IDs to exclude (already tagged) */
  excludeElementIds?: string[];
  /** Tag IDs to exclude (already assigned) */
  excludeTagIds?: string[];
  /** Element types to exclude from the list */
  excludeElementTypes?: ElementType[];
}

/**
 * Result returned when dialog closes
 */
export interface TagPickerDialogResult {
  /** Selected elements */
  elements: Element[];
  /** Selected project tags */
  tags: TagDefinition[];
}

@Component({
  selector: 'app-tag-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
  ],
  templateUrl: './tag-picker-dialog.component.html',
  styleUrls: ['./tag-picker-dialog.component.scss'],
})
export class TagPickerDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<TagPickerDialogComponent, TagPickerDialogResult | null>
  );
  private readonly data = inject<TagPickerDialogData>(MAT_DIALOG_DATA);
  private readonly projectState = inject(ProjectStateService);
  private readonly tagService = inject(TagService);

  /** Search text */
  readonly searchText = signal('');

  /** Selected item IDs */
  readonly selectedIds = signal<Set<string>>(new Set());

  /** All available items (elements + project tags, with exclusions applied) */
  readonly availableItems = computed<TagPickerItem[]>(() => {
    const items: TagPickerItem[] = [];

    // Project tags
    const excludeTagIds = new Set(this.data.excludeTagIds ?? []);
    for (const tag of this.tagService.allTags()) {
      if (excludeTagIds.has(tag.id)) continue;
      items.push({
        id: `tag:${tag.id}`,
        name: tag.name,
        icon: tag.icon,
        iconColor: tag.color,
        typeLabel: 'project tag',
        isProjectTag: true,
        tag,
      });
    }

    // Elements
    const excludeElementIds = new Set(this.data.excludeElementIds ?? []);
    const excludeTypes = new Set(this.data.excludeElementTypes ?? []);
    for (const el of this.projectState.elements()) {
      if (excludeElementIds.has(el.id)) continue;
      if (el.type === ElementType.Folder) continue;
      if (excludeTypes.has(el.type)) continue;
      items.push({
        id: `el:${el.id}`,
        name: el.name,
        icon: this.getTypeIcon(el.schemaId),
        typeLabel: this.getTypeLabel(el),
        isProjectTag: false,
        element: el,
      });
    }

    return items;
  });

  /** Items filtered by search */
  readonly filteredItems = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const items = this.availableItems();
    if (!search) return items;
    return items.filter(
      item =>
        item.name.toLowerCase().includes(search) ||
        item.typeLabel.toLowerCase().includes(search)
    );
  });

  /** Title to display */
  get title(): string {
    return this.data.title ?? 'Add Tags';
  }

  /** Subtitle to display */
  get subtitle(): string | undefined {
    return this.data.subtitle;
  }

  /** Whether any items are selected */
  readonly hasSelection = computed(() => this.selectedIds().size > 0);

  /** Selection count text */
  readonly selectionCountText = computed(() => {
    const count = this.selectedIds().size;
    if (count === 0) return 'Nothing selected';
    if (count === 1) return '1 item selected';
    return `${count} items selected`;
  });

  isSelected(item: TagPickerItem): boolean {
    return this.selectedIds().has(item.id);
  }

  toggleSelection(item: TagPickerItem): void {
    const current = this.selectedIds();
    const newSet = new Set(current);
    if (newSet.has(item.id)) {
      newSet.delete(item.id);
    } else {
      newSet.add(item.id);
    }
    this.selectedIds.set(newSet);
  }

  confirm(): void {
    const selected = this.selectedIds();
    const all = this.availableItems();

    const elements: Element[] = [];
    const tags: TagDefinition[] = [];

    for (const item of all) {
      if (!selected.has(item.id)) continue;
      if (item.isProjectTag && item.tag) {
        tags.push(item.tag);
      } else if (!item.isProjectTag && item.element) {
        elements.push(item.element);
      }
    }

    this.dialogRef.close({ elements, tags });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  private getTypeIcon(schemaId: string | undefined): string {
    if (!schemaId) return 'category';
    const base = schemaId.replace(/-v\d+$/, '').toLowerCase();
    switch (base) {
      case 'character':
        return 'person';
      case 'location':
        return 'place';
      case 'item':
      case 'wb-item':
        return 'inventory_2';
      case 'faction':
        return 'groups';
      case 'event':
        return 'event';
      case 'concept':
        return 'lightbulb';
      default:
        return 'category';
    }
  }

  private getTypeLabel(el: Element): string {
    if (el.type === ElementType.Item) return 'document';
    const schemaId = el.schemaId;
    if (!schemaId) return 'element';
    return schemaId.replace(/-v\d+$/, '');
  }
}
