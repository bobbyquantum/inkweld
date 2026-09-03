import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SettingsTabStatusComponent } from '@components/settings-tab-status/settings-tab-status.component';
import {
  TagEditDialogComponent,
  type TagEditDialogResult,
} from '@dialogs/tag-edit-dialog/tag-edit-dialog.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { type TagIndexEntry } from '@models/tag.model';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectSearchService } from '@services/core/project-search.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { firstValueFrom } from 'rxjs';

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
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    SettingsTabStatusComponent,
    TranslocoModule,
  ],
})
export class TagsTabComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly tagService = inject(TagService);
  private readonly projectSearchService = inject(ProjectSearchService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
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

    this.error.set(null);
    const index = this.tagService.tagIndex();
    this.updateTagViews(index);
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
      this.snackBar.open(
        this.transloco.translate('tags.tab.created', { name: result.name }),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
    } catch (err) {
      console.error('Failed to create tag:', err);
      this.snackBar.open(
        this.transloco.translate('tags.tab.createFailed'),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
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
      this.snackBar.open(
        this.transloco.translate('tags.tab.updated', { name: result.name }),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
    } catch (err) {
      console.error('Failed to update tag:', err);
      this.snackBar.open(
        this.transloco.translate('tags.tab.updateFailed'),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
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
      this.snackBar.open(
        this.transloco.translate('tags.tab.deleted', { name: tag.name }),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
    } catch (err) {
      console.error('Failed to delete tag:', err);
      this.snackBar.open(
        this.transloco.translate('tags.tab.deleteFailed'),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
    }
  }

  /**
   * Browse every element carrying this tag in the project search dialog
   * (browse mode with the tag filter pre-selected).
   */
  viewTaggedElements(tag: TagView): void {
    if (tag.count === 0) {
      this.snackBar.open(
        this.transloco.translate('tags.tab.noElementsWithTag'),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
      return;
    }

    // Tag assignments can outlive their elements, so make sure at least one
    // tagged element still exists before opening an empty search result.
    const existingIds = new Set(this.projectState.elements().map(e => e.id));
    if (!tag.elementIds.some(id => existingIds.has(id))) {
      this.snackBar.open(
        this.transloco.translate('tags.tab.taggedElementsNotFound'),
        this.transloco.translate('snackbar.dismiss'),
        { duration: 3000 }
      );
      return;
    }

    this.projectSearchService.open({ tagIds: [tag.id] });
  }

  /**
   * Get the contrast text color for a given background color
   */
  getTextColor(bgColor: string): string {
    if (!bgColor || typeof bgColor !== 'string') {
      return '#000000';
    }
    // Normalise and expand hex colour
    let hex = bgColor.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(c => c + c)
        .join('');
    }
    if (hex.length !== 6 || !/^[\da-f]{6}$/i.test(hex)) {
      return '#000000';
    }
    const r = Number.parseInt(hex.substring(0, 2), 16);
    const g = Number.parseInt(hex.substring(2, 4), 16);
    const b = Number.parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }
}
