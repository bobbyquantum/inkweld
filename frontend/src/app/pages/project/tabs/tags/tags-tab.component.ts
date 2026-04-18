import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Element } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { firstValueFrom } from 'rxjs';

import { type TagIndexEntry } from '../../../../components/tags/tag.model';
import {
  TagEditDialogComponent,
  type TagEditDialogResult,
} from '../../../../dialogs/tag-edit-dialog/tag-edit-dialog.component';

/**
 * View model for tags displayed in the list
 */
interface TagView {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  count: number;
  elementIds: string[];
}

/**
 * Component for managing tags in a project
 */
@Component({
  selector: 'app-tags-tab',
  templateUrl: './tags-tab.component.html',
  styleUrls: ['./tags-tab.component.scss'],
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class TagsTabComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly tagService = inject(TagService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly dialog = inject(MatDialog);

  readonly project = this.projectState.project;
  readonly tags = signal<TagView[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // Filter/search
  readonly searchQuery = signal('');

  readonly hasTags = computed(() => this.tags().length > 0);

  readonly filteredTags = computed(() => {
    const query = this.searchQuery().toLowerCase();
    let result = this.tags();

    if (query) {
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query)
      );
    }

    return result;
  });

  constructor() {
    // Load tags when project changes
    effect(() => {
      const project = this.project();
      if (project) {
        this.loadTags();
      }
    });

    // React to tag index changes
    effect(() => {
      const index = this.tagService.tagIndex();
      this.updateTagViews(index);
    });
  }

  /**
   * Load all tags with counts
   */
  loadTags(): void {
    const project = this.project();
    if (!project) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const index = this.tagService.tagIndex();
      this.updateTagViews(index);
    } catch (err) {
      console.error('Failed to load tags:', err);
      this.error.set('Failed to load tags');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Update tag views from index
   */
  private updateTagViews(index: TagIndexEntry[]): void {
    const views: TagView[] = index.map(entry => ({
      id: entry.definition.id,
      name: entry.definition.name,
      icon: entry.definition.icon,
      color: entry.definition.color,
      description: entry.definition.description,
      count: entry.count,
      elementIds: entry.elementIds,
    }));

    // Sort by name
    views.sort((a, b) => a.name.localeCompare(b.name));

    this.tags.set(views);
  }

  /**
   * Create a new custom tag
   */
  async createTag(): Promise<void> {
    const dialogRef = this.dialog.open<
      TagEditDialogComponent,
      unknown,
      TagEditDialogResult | undefined
    >(TagEditDialogComponent, {
      data: { isNew: true },
      width: '500px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());

    if (!result) {
      return;
    }

    try {
      this.tagService.createCustomTag({
        name: result.name,
        icon: result.icon,
        color: result.color,
        description: result.description,
      });
      this.snackBar.open(`Created tag "${result.name}"`, 'Dismiss', {
        duration: 3000,
      });
    } catch (err) {
      console.error('Failed to create tag:', err);
      this.snackBar.open('Failed to create tag', 'Dismiss', { duration: 3000 });
    }
  }

  /**
   * Edit a tag
   */
  async editTag(tag: TagView): Promise<void> {
    const dialogRef = this.dialog.open<
      TagEditDialogComponent,
      unknown,
      TagEditDialogResult | undefined
    >(TagEditDialogComponent, {
      data: {
        isNew: false,
        tag: {
          id: tag.id,
          name: tag.name,
          icon: tag.icon,
          color: tag.color,
          description: tag.description,
        },
      },
      width: '500px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());

    if (!result) {
      return;
    }

    try {
      this.tagService.updateCustomTag(tag.id, {
        name: result.name,
        icon: result.icon,
        color: result.color,
        description: result.description,
      });
      this.snackBar.open(`Updated tag "${result.name}"`, 'Dismiss', {
        duration: 3000,
      });
    } catch (err) {
      console.error('Failed to update tag:', err);
      this.snackBar.open('Failed to update tag', 'Dismiss', { duration: 3000 });
    }
  }

  /**
   * Delete a tag
   */
  async deleteTag(tag: TagView): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Tag',
      message: `Are you sure you want to delete "${tag.name}"? This will remove the tag from ${tag.count} element(s).`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    try {
      this.tagService.deleteCustomTag(tag.id);
      this.snackBar.open(`Deleted tag "${tag.name}"`, 'Dismiss', {
        duration: 3000,
      });
    } catch (err) {
      console.error('Failed to delete tag:', err);
      this.snackBar.open('Failed to delete tag', 'Dismiss', { duration: 3000 });
    }
  }

  /**
   * Navigate to an element with this tag
   */
  viewTaggedElements(tag: TagView): void {
    if (tag.count === 0) {
      this.snackBar.open('No elements have this tag', 'Dismiss', {
        duration: 3000,
      });
      return;
    }

    // Resolve element IDs to project elements and open the first one
    const allElements = this.projectState.elements();
    const taggedElements = tag.elementIds
      .map(id => allElements.find(e => e.id === id))
      .filter((e): e is Element => e !== undefined);

    if (taggedElements.length === 0) {
      this.snackBar.open('Tagged elements not found', 'Dismiss', {
        duration: 3000,
      });
      return;
    }

    // Open the first tagged element
    this.projectState.openDocument(taggedElements[0]);

    if (taggedElements.length > 1) {
      this.snackBar.open(
        `Opened "${taggedElements[0].name}". ${taggedElements.length - 1} more element(s) also have this tag.`,
        'Dismiss',
        { duration: 4000 }
      );
    }
  }

  /**
   * Get the contrast text color for a given background color
   */
  getTextColor(bgColor: string): string {
    // Simple luminance check
    const hex = bgColor.replaceAll('#', '');
    const r = Number.parseInt(hex.substring(0, 2), 16);
    const g = Number.parseInt(hex.substring(2, 4), 16);
    const b = Number.parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }
}
