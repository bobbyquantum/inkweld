import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type TagDefinition } from '@models/tag.model';

export interface TagEditDialogData {
  tag?: TagDefinition;
  isNew?: boolean;
}

export interface TagEditDialogResult {
  name: string;
  icon: string;
  color: string;
  description?: string;
}

/** Common Material Icons suitable for tags */
const ICON_OPTIONS = [
  // Role icons
  'star',
  'whatshot',
  'group',
  'person_outline',
  'school',
  'face',
  'face_3',
  'person',
  'people',
  // Status icons
  'check_circle',
  'pending',
  'construction',
  'edit_note',
  'hourglass_empty',
  'schedule',
  'update',
  // Priority icons
  'priority_high',
  'place',
  'bolt',
  'auto_awesome',
  'archive',
  'flag',
  'bookmark',
  'push_pin',
  // General icons
  'label',
  'local_offer',
  'category',
  'folder',
  'description',
  'article',
  'note',
  'lightbulb',
  'psychology',
  'memory',
  'visibility',
  'favorite',
  'mood',
  'sentiment_satisfied',
  'sentiment_dissatisfied',
  'emoji_objects',
];

/** Color palette for tags - 16 distinct, readable colors */
const COLOR_OPTIONS = [
  '#DC143C', // Crimson
  '#B22222', // Firebrick
  '#FF4500', // Orange red
  '#FF8C00', // Dark orange
  '#228B22', // Forest green
  '#2E8B57', // Sea green
  '#20B2AA', // Light sea green
  '#4682B4', // Steel blue
  '#1E90FF', // Dodger blue
  '#4169E1', // Royal blue
  '#8A2BE2', // Blue violet
  '#9400D3', // Dark violet
  '#9370DB', // Medium purple
  '#708090', // Slate gray
  '#607D8B', // Blue gray
  '#A0522D', // Sienna
];

@Component({
  selector: 'app-tag-edit-dialog',
  templateUrl: './tag-edit-dialog.component.html',
  styleUrls: ['./tag-edit-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
})
export class TagEditDialogComponent implements AfterViewInit {
  private readonly dialogRef = inject(MatDialogRef<TagEditDialogComponent>);
  readonly data = inject<TagEditDialogData>(MAT_DIALOG_DATA);

  readonly iconOptions = ICON_OPTIONS;
  readonly colorOptions = COLOR_OPTIONS;

  // Refs to seed the inputs once on init. We deliberately do NOT bind
  // [value] on the <input> elements: in zoneless mode a [value] binding
  // re-runs during CD cycles triggered by sibling control interactions
  // (e.g. clicking on the chip grid), which deselects/replaces text and
  // causes Playwright's fill() to concatenate instead of replace.
  // See AGENTS notes on the announcement-editor for the same pattern.
  private readonly nameInput =
    viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly descriptionInput =
    viewChild<ElementRef<HTMLInputElement>>('descriptionInput');

  // All fields as plain signals — updates are synchronous, no RxJS bridging needed.
  // This avoids toSignal timing races in zoneless Angular where toSignal effects
  // are scheduled asynchronously and can lag behind CD cycles triggered by other signals.
  readonly name = signal(this.data.tag?.name ?? '');
  readonly description = signal(this.data.tag?.description ?? '');
  readonly icon = signal(this.data.tag?.icon ?? 'label');
  readonly color = signal(this.data.tag?.color ?? '#607D8B');

  readonly isFormValid = computed(() => !!this.name().trim());

  ngAfterViewInit(): void {
    // Seed the DOM once. Use queueMicrotask to avoid
    // ExpressionChangedAfterItHasBeenCheckedError in unit tests.
    queueMicrotask(() => {
      const nameEl = this.nameInput()?.nativeElement;
      const descEl = this.descriptionInput()?.nativeElement;
      if (nameEl && this.name()) {
        nameEl.value = this.name();
      }
      if (descEl && this.description()) {
        descEl.value = this.description();
      }
    });
  }

  getTextColor(bgColor: string): string {
    const hex = bgColor.replaceAll('#', '');
    const r = Number.parseInt(hex.substring(0, 2), 16);
    const g = Number.parseInt(hex.substring(2, 4), 16);
    const b = Number.parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    const name = this.name().trim();
    if (!name) {
      return;
    }

    const result: TagEditDialogResult = {
      name,
      icon: this.icon(),
      color: this.color(),
      description: this.description().trim() || undefined,
    };

    this.dialogRef.close(result);
  }
}
