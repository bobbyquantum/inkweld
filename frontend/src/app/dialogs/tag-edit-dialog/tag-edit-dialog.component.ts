import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

import { TagDefinition } from '../../components/tags/tag.model';

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
  template: `
    <h2 mat-dialog-title>{{ data.isNew ? 'Create Tag' : 'Edit Tag' }}</h2>

    <mat-dialog-content class="dialog-content">
      <!-- Tag Preview + Color Selection Row -->
      <div class="preview-row">
        <div class="tag-preview">
          <span
            class="preview-chip"
            [style.background-color]="color()"
            [style.color]="getTextColor(color())">
            <mat-icon class="chip-icon">{{ icon() }}</mat-icon>
            <span>{{ name() || 'Tag Name' }}</span>
          </span>
        </div>
        <div
          class="color-grid"
          role="radiogroup"
          aria-label="Tag color selection">
          @for (colorOption of colorOptions; track colorOption) {
            <button
              type="button"
              class="color-button"
              [class.selected]="colorOption === color()"
              [style.background-color]="colorOption"
              (click)="color.set(colorOption)"
              [attr.aria-checked]="colorOption === color()"
              [attr.aria-label]="'Color ' + colorOption"
              role="radio">
              @if (colorOption === color()) {
                <mat-icon [style.color]="getTextColor(colorOption)"
                  >check</mat-icon
                >
              }
            </button>
          }
        </div>
      </div>

      <!-- Name Input -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Name</mat-label>
        <input
          matInput
          [ngModel]="name()"
          (ngModelChange)="name.set($event)"
          placeholder="Enter tag name"
          required />
      </mat-form-field>

      <!-- Description Input -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Description</mat-label>
        <input
          matInput
          [ngModel]="description()"
          (ngModelChange)="description.set($event)"
          placeholder="Optional description" />
      </mat-form-field>

      <!-- Icon Selection -->
      <div class="section-label">Icon</div>
      <div class="icon-grid" role="radiogroup" aria-label="Tag icon selection">
        @for (iconOption of iconOptions; track iconOption) {
          <button
            type="button"
            class="icon-button"
            [class.selected]="iconOption === icon()"
            (click)="icon.set(iconOption)"
            [matTooltip]="iconOption"
            [attr.aria-checked]="iconOption === icon()"
            [attr.aria-label]="'Icon ' + iconOption"
            role="radio">
            <mat-icon>{{ iconOption }}</mat-icon>
          </button>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button data-testid="tag-dialog-cancel" (click)="onCancel()">
        Cancel
      </button>
      <button
        mat-flat-button
        color="primary"
        data-testid="tag-dialog-save"
        [disabled]="!isFormValid()"
        (click)="onSave()">
        {{ data.isNew ? 'Create' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 400px;
        max-width: 500px;
      }

      .full-width {
        width: 100%;
      }

      .preview-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        background: var(--mat-sys-surface-container);
        border-radius: 8px;
      }

      .tag-preview {
        display: flex;
        justify-content: center;
        flex-shrink: 0;
      }

      .preview-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 16px;
        font-weight: 500;
      }

      .chip-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .section-label {
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 8px;
      }

      .icon-grid {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 4px;
      }

      .icon-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: 2px solid transparent;
        border-radius: 8px;
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface);
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background: var(--mat-sys-surface-container-high);
        }

        &.selected {
          border-color: var(--mat-sys-primary);
          background: var(--mat-sys-primary-container);
          color: var(--mat-sys-on-primary-container);
        }

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: inherit;
        }
      }

      .color-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 4px;
        flex: 1;
      }

      .color-button {
        width: 24px;
        height: 24px;
        border: 2px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        padding: 0;

        &:hover {
          transform: scale(1.15);
        }

        &.selected {
          border-color: var(--mat-sys-on-surface);
          box-shadow: 0 0 0 2px var(--mat-sys-surface);
        }

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }
    `,
  ],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
})
export class TagEditDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TagEditDialogComponent>);
  readonly data = inject<TagEditDialogData>(MAT_DIALOG_DATA);

  readonly iconOptions = ICON_OPTIONS;
  readonly colorOptions = COLOR_OPTIONS;

  readonly name = signal(this.data.tag?.name ?? '');
  readonly icon = signal(this.data.tag?.icon ?? 'label');
  readonly color = signal(this.data.tag?.color ?? '#607D8B');
  readonly description = signal(this.data.tag?.description ?? '');

  readonly isFormValid = computed(() => !!this.name().trim());

  getTextColor(bgColor: string): string {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    const name = this.name();
    if (!name?.trim()) {
      return;
    }

    const result: TagEditDialogResult = {
      name: name.trim(),
      icon: this.icon(),
      color: this.color(),
      description: this.description()?.trim() || undefined,
    };

    this.dialogRef.close(result);
  }
}
