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
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { ElementType } from '../../../api-client';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';

export interface NewElementDialogResult {
  name: string;
  type: ElementType;
  /** Schema ID for WORLDBUILDING elements */
  schemaId?: string;
  /** Preset applied after creation (e.g. 'map' pre-configures a canvas). */
  preset?: 'map';
}

interface NewElementDialogData {
  skipTypeSelection?: boolean;
  preselectedType?: ElementType;
  preselectedSchemaId?: string;
}

interface ElementTypeOption {
  type: ElementType;
  /** Schema ID for worldbuilding types */
  schemaId?: string;
  label: string;
  icon: string;
  description: string;
  category: 'document' | 'worldbuilding' | 'visualization';
  /** Preset applied after creation (e.g. 'map' pre-configures a canvas). */
  preset?: 'map';
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
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatCardModule,
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

  // Step control
  currentStep = signal<1 | 2>(1);
  selectedType = signal<ElementType | null>(null);
  searchQuery = signal('');

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
      label: 'Document',
      icon: 'description',
      description: 'Create a narrative document or chapter',
      category: 'document',
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
    },
    {
      type: ElementType.Timeline,
      label: 'Timeline',
      icon: 'timeline',
      description: 'Chronological visualization with tracks, events, and eras',
      category: 'visualization',
    },
  ];

  // Element type options (document types + dynamically loaded worldbuilding types)
  elementTypeOptions = signal<ElementTypeOption[]>([...this.documentTypes]);

  // Filtered options based on search
  filteredOptions = computed(() => {
    const query = this.searchQuery().toLowerCase();
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

  // Track selected schema ID for worldbuilding types
  selectedSchemaId = signal<string | undefined>(undefined);

  // Preset carried by the selected option (e.g. the 'Map' canvas preset)
  selectedPreset = signal<'map' | undefined>(undefined);

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

    // If dialog data specifies skipping type selection, go directly to step 2
    if (this.data?.skipTypeSelection && this.data?.preselectedType) {
      this.selectedType.set(this.data.preselectedType);
      this.selectedSchemaId.set(this.data.preselectedSchemaId);
      this.model.update(m => ({ ...m, type: this.data!.preselectedType! }));
      this.currentStep.set(2);
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
    this.elementTypeOptions.set([
      ...this.documentTypes,
      ...worldbuildingOptions,
    ]);
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
      name: value.name,
      type: value.type,
      schemaId: this.selectedSchemaId(),
      preset: this.selectedPreset(),
    };
    this.dialogRef.close(result);
  };

  // Step 1: Select type and optionally schema ID for worldbuilding
  selectType(option: ElementTypeOption): void {
    this.selectedType.set(option.type);
    this.selectedSchemaId.set(option.schemaId);
    this.selectedPreset.set(option.preset);
    this.model.update(m => ({ ...m, type: option.type }));
    this.nextStep();
  }

  onTypeCardKeydown(event: KeyboardEvent, option: ElementTypeOption): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectType(option);
    }
  }

  // Navigation
  nextStep(): void {
    if (this.currentStep() === 1 && this.selectedType()) {
      this.currentStep.set(2);
      // Focus on name input after view updates
      setTimeout(() => {
        const nameInput = document.querySelector<HTMLInputElement>(
          'input[data-testid="element-name-input"]'
        );
        nameInput?.focus();
      }, 100);
    }
  }

  previousStep(): void {
    if (this.currentStep() === 2) {
      this.currentStep.set(1);
    }
  }

  // Get the selected type option details
  getSelectedOption(): ElementTypeOption | undefined {
    const selected = this.selectedType();
    const schemaId = this.selectedSchemaId();
    if (!selected) return undefined;
    return this.elementTypeOptions().find(
      (o: ElementTypeOption) => o.type === selected && o.schemaId === schemaId
    );
  }
}
