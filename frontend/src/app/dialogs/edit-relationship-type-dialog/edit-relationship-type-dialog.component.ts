import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { type ElementTypeSchema } from '@models/schema-types';

// ─── Icon / Color palette (same system as tag editor) ────────────────────────

/** Relationship-appropriate Material icons */
export const RELATIONSHIP_ICON_OPTIONS = [
  // People / Social
  'person',
  'people',
  'group',
  'face',
  'face_3',
  'person_outline',
  'supervisor_account',
  'diversity_3',
  // Family
  'family_restroom',
  'child_care',
  'elderly',
  'favorite',
  'home',
  // Social / Emotion
  'handshake',
  'thumb_up',
  'star',
  'mood',
  'sentiment_dissatisfied',
  'psychology',
  // Professional / Role
  'work',
  'school',
  'military_tech',
  'manage_accounts',
  'business_center',
  'badge',
  // Conflict / Rivalry
  'bolt',
  'whatshot',
  'gavel',
  'warning',
  'shield',
  'security',
  // Location / Spatial
  'place',
  'location_on',
  'map',
  'home_pin',
  'explore',
  'travel_explore',
  // Time / Causation
  'schedule',
  'history',
  'update',
  'event',
  'timeline',
  'hourglass_empty',
  // Ownership / Objects
  'inventory_2',
  'key',
  'lock',
  'diamond',
  'monetization_on',
  'local_offer',
  // Reference / Connection
  'link',
  'hub',
  'share',
  'connect_without_contact',
  'merge',
  'call_split',
  // Misc
  'auto_awesome',
  'category',
  'label',
  'tune',
  'info',
  'help',
];

/** Color palette — identical to the tag editor's 16-color palette */
export const RELATIONSHIP_COLOR_OPTIONS = [
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

// ─── Category display helpers ─────────────────────────────────────────────────

export const CATEGORY_OPTIONS: {
  value: RelationshipCategory;
  label: string;
}[] = [
  { value: RelationshipCategory.Familial, label: 'Family' },
  { value: RelationshipCategory.Social, label: 'Social' },
  { value: RelationshipCategory.Professional, label: 'Professional' },
  { value: RelationshipCategory.Spatial, label: 'Location' },
  { value: RelationshipCategory.Temporal, label: 'Timeline' },
  { value: RelationshipCategory.Ownership, label: 'Ownership' },
  { value: RelationshipCategory.Reference, label: 'Reference' },
  { value: RelationshipCategory.Custom, label: 'Other' },
];

// ─── Dialog data / result interfaces ─────────────────────────────────────────

export interface EditRelationshipTypeDialogData {
  /** Pass the existing type to open in edit mode; omit for create mode. */
  type?: RelationshipTypeDefinition;
  /** Schemas available in the current project for the endpoint pickers. */
  availableSchemas: ElementTypeSchema[];
  /** True when creating (button label differs). */
  isNew?: boolean;
}

export type EditRelationshipTypeDialogResult = Omit<
  RelationshipTypeDefinition,
  'id' | 'isBuiltIn' | 'createdAt' | 'updatedAt'
> | null;

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-edit-relationship-type-dialog',
  templateUrl: './edit-relationship-type-dialog.component.html',
  styleUrls: ['./edit-relationship-type-dialog.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
})
export class EditRelationshipTypeDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<EditRelationshipTypeDialogComponent>
  );
  readonly data = inject<EditRelationshipTypeDialogData>(MAT_DIALOG_DATA);

  // ── Exposed constants for the template ──────────────────────────────────────
  readonly iconOptions = RELATIONSHIP_ICON_OPTIONS;
  readonly colorOptions = RELATIONSHIP_COLOR_OPTIONS;
  readonly categoryOptions = CATEGORY_OPTIONS;

  // ── Form state ───────────────────────────────────────────────────────────────
  readonly name = signal(this.data.type?.name ?? '');
  readonly inverseLabel = signal(this.data.type?.inverseLabel ?? '');
  readonly showInverse = signal(this.data.type?.showInverse ?? true);
  readonly category = signal<RelationshipCategory>(
    this.data.type?.category ?? RelationshipCategory.Custom
  );
  readonly icon = signal(this.data.type?.icon ?? 'hub');
  readonly color = signal(this.data.type?.color ?? '#607D8B');

  // Source endpoint
  readonly sourceAnyType = signal(
    (this.data.type?.sourceEndpoint.allowedSchemas.length ?? 0) === 0
  );
  readonly sourceSchemas = signal<string[]>(
    this.data.type?.sourceEndpoint.allowedSchemas ?? []
  );
  readonly sourceMaxCount = signal<number | null | undefined>(
    this.data.type?.sourceEndpoint.maxCount
  );

  // Target endpoint
  readonly targetAnyType = signal(
    (this.data.type?.targetEndpoint.allowedSchemas.length ?? 0) === 0
  );
  readonly targetSchemas = signal<string[]>(
    this.data.type?.targetEndpoint.allowedSchemas ?? []
  );
  readonly targetMaxCount = signal<number | null | undefined>(
    this.data.type?.targetEndpoint.maxCount
  );

  // ── Computed ─────────────────────────────────────────────────────────────────
  readonly isFormValid = computed(
    () => !!this.name().trim() && !!this.inverseLabel().trim()
  );

  /** Preview chip text color based on background luminance */
  getTextColor(bgColor: string): string {
    const hex = bgColor.replaceAll('#', '');
    const r = Number.parseInt(hex.substring(0, 2), 16);
    const g = Number.parseInt(hex.substring(2, 4), 16);
    const b = Number.parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  // ── Schema toggle helpers ─────────────────────────────────────────────────────

  isSourceSchemaSelected(schemaId: string): boolean {
    return this.sourceSchemas().includes(schemaId);
  }

  toggleSourceSchema(schemaId: string, checked: boolean): void {
    const current = this.sourceSchemas();
    if (checked) {
      this.sourceSchemas.set([...current, schemaId]);
    } else {
      this.sourceSchemas.set(current.filter(id => id !== schemaId));
    }
  }

  isTargetSchemaSelected(schemaId: string): boolean {
    return this.targetSchemas().includes(schemaId);
  }

  toggleTargetSchema(schemaId: string, checked: boolean): void {
    const current = this.targetSchemas();
    if (checked) {
      this.targetSchemas.set([...current, schemaId]);
    } else {
      this.targetSchemas.set(current.filter(id => id !== schemaId));
    }
  }

  // ── Max count helper ─────────────────────────────────────────────────────────

  parseMaxCount(value: string): number | null | undefined {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '0') return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  onSourceMaxCountChange(value: string): void {
    this.sourceMaxCount.set(this.parseMaxCount(value));
  }

  onTargetMaxCountChange(value: string): void {
    this.targetMaxCount.set(this.parseMaxCount(value));
  }

  maxCountDisplay(val: number | null | undefined): string {
    return val == null ? '' : String(val);
  }

  // ── Dialog actions ────────────────────────────────────────────────────────────

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSave(): void {
    const name = this.name().trim();
    const inverseLabel = this.inverseLabel().trim();
    if (!name || !inverseLabel) return;

    const result: EditRelationshipTypeDialogResult = {
      name,
      inverseLabel,
      showInverse: this.showInverse(),
      category: this.category(),
      icon: this.icon(),
      color: this.color(),
      sourceEndpoint: {
        allowedSchemas: this.sourceAnyType() ? [] : [...this.sourceSchemas()],
        maxCount: this.sourceMaxCount(),
      },
      targetEndpoint: {
        allowedSchemas: this.targetAnyType() ? [] : [...this.targetSchemas()],
        maxCount: this.targetMaxCount(),
      },
    };

    this.dialogRef.close(result);
  }
}
