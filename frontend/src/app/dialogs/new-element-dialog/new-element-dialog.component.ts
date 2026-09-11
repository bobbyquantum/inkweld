import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DOCUMENT_ROLE_ICONS } from '@models/scene-metadata';

import { ElementType } from '../../../api-client';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';

/**
 * Presets refine an element type at creation time without introducing a new
 * `ElementType`:
 *  - `map`: a Canvas pre-configured as an interactive map
 *  - `scene`: an Item flagged as manuscript prose (role metadata)
 *  - `note`: an Item flagged as non-manuscript prose (role metadata)
 */
export type ElementPreset = 'map' | 'cover' | 'scene' | 'note';

export interface NewElementDialogResult {
  name: string;
  type: ElementType;
  /** Schema ID for WORLDBUILDING elements */
  schemaId?: string;
  /** Preset applied after creation (see {@link ElementPreset}). */
  preset?: ElementPreset;
}

export interface NewElementDialogData {
  skipTypeSelection?: boolean;
  preselectedType?: ElementType;
  preselectedSchemaId?: string;
  /**
   * Only offer worldbuilding templates. Used when the dialog is opened from a
   * context that can only accept a worldbuilding element, such as the
   * "Create new" shortcut in the element picker.
   */
  worldbuildingOnly?: boolean;
}

interface ElementTypeOption {
  type: ElementType;
  /** Schema ID for worldbuilding types */
  schemaId?: string;
  label: string;
  icon: string;
  description: string;
  category: 'document' | 'worldbuilding' | 'visualization';
  /** Preset applied after creation (see {@link ElementPreset}). */
  preset?: ElementPreset;
  /**
   * Explicit test id. Options sharing a type (Scene/Note, Canvas/Map) need
   * distinct ids; the default is `element-type-<type>`.
   */
  testId?: string;
}

interface ElementTypeSection {
  key: ElementTypeOption['category'];
  titleKey: string;
  icon: string;
  className: string;
  options: ElementTypeOption[];
}

interface NewElementFormValue {
  name: string;
  type: ElementType;
}

@Component({
  selector: 'app-new-element-dialog',
  templateUrl: './new-element-dialog.component.html',
  styleUrls: ['./new-element-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoModule,
  ],
})
export class NewElementDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<NewElementDialogComponent, NewElementDialogResult>
  );
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly projectState = inject(ProjectStateService);
  private readonly data = inject<NewElementDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });
  private readonly transloco = inject(TranslocoService);

  readonly searchQuery = signal('');

  readonly selectedType = signal<ElementType | null>(null);
  readonly selectedSchemaId = signal<string | undefined>(undefined);
  readonly selectedPreset = signal<ElementPreset | undefined>(undefined);

  /**
   * When the caller already knows the type (folder rename, "create new" from a
   * filtered element picker), the picker is hidden and only the name is asked.
   */
  readonly showTypePicker = computed(() => !this.data?.skipTypeSelection);

  // Document types (constant, always available)
  private readonly documentTypes: ElementTypeOption[] = [
    {
      type: ElementType.Folder,
      label: 'Folder',
      icon: 'folder',
      description: 'Organize your documents and worldbuilding elements',
      category: 'document',
    },
    {
      type: ElementType.Item,
      label: 'Scene',
      icon: DOCUMENT_ROLE_ICONS.scene,
      description:
        'Manuscript prose: a scene or chapter with synopsis, status, word target and story date',
      category: 'document',
      preset: 'scene',
      // Keeps the historical id so existing e2e flows that create a
      // document keep working.
      testId: 'element-type-item',
    },
    {
      type: ElementType.Item,
      label: 'Note',
      icon: DOCUMENT_ROLE_ICONS.note,
      description:
        'Research, brainstorming, front matter or anything else in prose that is not part of the manuscript',
      category: 'document',
      preset: 'note',
      testId: 'element-type-item-note',
    },
    {
      type: ElementType.RelationshipChart,
      label: 'Relationship Chart',
      icon: 'hub',
      description:
        'Visualize connections between your elements as an interactive graph',
      category: 'visualization',
    },
    {
      type: ElementType.Canvas,
      label: 'Canvas',
      icon: 'dashboard',
      description:
        'Infinite canvas for maps, mood boards, storyboards, and visual layouts with layers',
      category: 'visualization',
    },
    {
      type: ElementType.Canvas,
      label: 'Map',
      icon: 'map',
      description:
        'Interactive map: background images with clickable pins linked to your worldbuilding elements',
      category: 'visualization',
      preset: 'map',
      testId: 'element-type-map',
    },
    {
      type: ElementType.Canvas,
      label: 'Cover',
      icon: 'book',
      description:
        'Design your project cover on a canvas — it stays in sync with the cover shown on the dashboard and in exports',
      category: 'visualization',
      preset: 'cover',
      testId: 'element-type-cover',
    },
    {
      type: ElementType.Timeline,
      label: 'Timeline',
      icon: 'timeline',
      description: 'Chronological visualization with tracks, events, and eras',
      category: 'visualization',
    },
  ];

  /** Non-worldbuilding options, or none when restricted to worldbuilding. */
  private get baseTypes(): ElementTypeOption[] {
    return this.data?.worldbuildingOnly ? [] : this.documentTypes;
  }

  // Element type options (document types + dynamically loaded worldbuilding types)
  elementTypeOptions = signal<ElementTypeOption[]>([...this.baseTypes]);

  // Filtered options based on search
  filteredOptions = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.elementTypeOptions();
    }
    return this.elementTypeOptions().filter(
      (option: ElementTypeOption) =>
        option.label.toLowerCase().includes(query) ||
        option.description.toLowerCase().includes(query)
    );
  });

  // Group options by category
  documentOptions = computed(() =>
    this.filteredOptions().filter(
      (o: ElementTypeOption) => o.category === 'document'
    )
  );

  worldbuildingOptions = computed(() =>
    this.filteredOptions().filter(
      (o: ElementTypeOption) => o.category === 'worldbuilding'
    )
  );

  visualizationOptions = computed(() =>
    this.filteredOptions().filter(
      (o: ElementTypeOption) => o.category === 'visualization'
    )
  );

  /** The non-empty category sections to render, in display order. */
  readonly sections = computed<ElementTypeSection[]>(() => {
    const sections: ElementTypeSection[] = [
      {
        key: 'document',
        titleKey: 'dialogs.newElement.documentsCategory',
        icon: 'folder_open',
        className: 'category-document',
        options: this.documentOptions(),
      },
      {
        key: 'worldbuilding',
        titleKey: 'dialogs.newElement.worldbuildingCategory',
        icon: 'language',
        className: 'category-worldbuilding',
        options: this.worldbuildingOptions(),
      },
      {
        key: 'visualization',
        titleKey: 'dialogs.newElement.visualizationCategory',
        icon: 'insights',
        className: 'category-visualization',
        options: this.visualizationOptions(),
      },
    ];
    return sections.filter(section => section.options.length > 0);
  });

  readonly model = signal<NewElementFormValue>({
    name: '',
    type: ElementType.Item,
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.name, {
      message: this.transloco.translate('dialogs.newElement.nameRequired'),
    });
    required(schemaPath.type, {
      message: this.transloco.translate('dialogs.newElement.typeRequired'),
    });
  });

  constructor() {
    // Load worldbuilding types from project schema library
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        this.loadWorldbuildingTypes();
      }
    });

    // If dialog data specifies skipping type selection, preselect it and
    // focus the name input.
    if (this.data?.skipTypeSelection && this.data?.preselectedType) {
      this.selectedType.set(this.data.preselectedType);
      this.selectedSchemaId.set(this.data.preselectedSchemaId);
      this.model.update(m => ({ ...m, type: this.data!.preselectedType! }));
      this.focusNameInput();
    }
  }

  /**
   * Load worldbuilding element types from project's schema library
   */
  private loadWorldbuildingTypes(): void {
    try {
      // Get all schemas as plain objects
      const schemas = this.worldbuildingService.getAllSchemas();

      if (schemas.length === 0) {
        console.warn('[NewElementDialog] No schemas found');
        return;
      }

      this.buildWorldbuildingOptions(schemas);
    } catch (error) {
      console.error('[NewElementDialog] Error loading schemas:', error);
    }
  }

  /**
   * Build worldbuilding type options from schemas array
   */
  private buildWorldbuildingOptions(
    schemas: { id: string; name: string; icon: string; description: string }[]
  ): void {
    const worldbuildingOptions: ElementTypeOption[] = [];

    for (const schema of schemas) {
      worldbuildingOptions.push({
        type: ElementType.Worldbuilding,
        schemaId: schema.id,
        label: schema.name,
        icon: schema.icon,
        description: schema.description,
        category: 'worldbuilding',
      });
    }

    // Update options with both document types and loaded worldbuilding types
    // Use the constant documentTypes instead of reading the signal to avoid
    // creating a dependency in the calling effect
    this.elementTypeOptions.set([...this.baseTypes, ...worldbuildingOptions]);
  }

  onCancel = (): void => {
    this.dialogRef.close();
  };

  onCreate = (): void => {
    if (this.form().invalid()) {
      return;
    }
    const value = this.model();
    const result: NewElementDialogResult = {
      name: value.name.trim(),
      type: value.type,
      schemaId: this.selectedSchemaId(),
      preset: this.selectedPreset(),
    };
    this.dialogRef.close(result);
  };

  // Select a type (and, for worldbuilding options, its schema), then focus the
  // name field so the user can type immediately.
  selectType(option: ElementTypeOption): void {
    this.selectedType.set(option.type);
    this.selectedSchemaId.set(option.schemaId);
    this.selectedPreset.set(option.preset);
    this.model.update(m => ({ ...m, type: option.type }));
    this.focusNameInput();
  }

  private focusNameInput(): void {
    setTimeout(() => {
      const nameInput = document.querySelector<HTMLInputElement>(
        'input[data-testid="element-name-input"]'
      );
      nameInput?.focus();
    }, 0);
  }

  /** Stable key for `@for` tracking — type alone collides for preset options. */
  optionKey(option: ElementTypeOption): string {
    return `${option.type}:${option.schemaId ?? ''}:${option.preset ?? ''}`;
  }

  /** Test id for an option card. */
  optionTestId(option: ElementTypeOption): string {
    return (
      option.testId ??
      `element-type-${option.schemaId ?? option.type.toLowerCase()}`
    );
  }

  /** Whether an option card is the currently selected one. */
  isOptionSelected(option: ElementTypeOption): boolean {
    return (
      this.selectedType() === option.type &&
      this.selectedSchemaId() === option.schemaId &&
      this.selectedPreset() === option.preset
    );
  }

  onTypeCardKeydown(event: KeyboardEvent, option: ElementTypeOption): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectType(option);
    }
  }

  /** Get the selected type option details */
  getSelectedOption(): ElementTypeOption | undefined {
    const selected = this.selectedType();
    const schemaId = this.selectedSchemaId();
    const preset = this.selectedPreset();
    if (!selected) return undefined;
    return this.elementTypeOptions().find(
      (o: ElementTypeOption) =>
        o.type === selected && o.schemaId === schemaId && o.preset === preset
    );
  }

  /** Category class for the selected-type summary in name-only mode. */
  selectedCategoryClass(): string {
    const category = this.getSelectedOption()?.category;
    return category ? `category-${category}` : '';
  }

  /**
   * Contextual placeholder for the name field, chosen from the schema id where
   * one is available.
   */
  namePlaceholder(): string {
    const option = this.getSelectedOption();
    const schemaId = option?.schemaId ?? '';

    const schemaPlaceholders: [string, string][] = [
      ['character', 'character'],
      ['location', 'location'],
      ['item', 'item'],
      ['map', 'map'],
      ['relationship', 'relationship'],
      ['philosophy', 'concept'],
      ['culture', 'culture'],
      ['species', 'species'],
      ['system', 'system'],
    ];
    for (const [match, key] of schemaPlaceholders) {
      if (schemaId.includes(match)) {
        return this.transloco.translate(
          `dialogs.newElement.placeholders.${key}`
        );
      }
    }

    if (option?.type === ElementType.Folder) {
      return this.transloco.translate('dialogs.newElement.placeholders.folder');
    }
    return this.transloco.translate('dialogs.newElement.placeholders.document');
  }
}
