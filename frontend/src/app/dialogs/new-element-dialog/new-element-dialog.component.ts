import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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

import { ElementType } from '../../../api-client';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';

export interface NewElementDialogResult {
  name: string;
  type: ElementType;
  /** Schema ID for WORLDBUILDING elements */
  schemaId?: string;
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
  category: 'document' | 'worldbuilding';
}

interface NewElementForm {
  name: FormControl<string>;
  type: FormControl<ElementType>;
}

@Component({
  selector: 'app-new-element-dialog',
  templateUrl: './new-element-dialog.component.html',
  styleUrls: ['./new-element-dialog.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatCardModule,
  ],
})
export class NewElementDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<NewElementDialogComponent, NewElementDialogResult>
  );
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly projectState = inject(ProjectStateService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly data = inject<NewElementDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });

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

  // Track selected schema ID for worldbuilding types
  selectedSchemaId = signal<string | undefined>(undefined);

  readonly form = this.fb.group<NewElementForm>({
    name: this.fb.control('', { validators: [Validators.required] }),
    type: this.fb.control(ElementType.Item, {
      validators: [Validators.required],
    }),
  });

  constructor() {
    // Load worldbuilding types from project schema library
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        this.loadWorldbuildingTypes(project.username, project.slug);
      }
    });

    // If dialog data specifies skipping type selection, go directly to step 2
    if (this.data?.skipTypeSelection && this.data?.preselectedType) {
      this.selectedType.set(this.data.preselectedType);
      this.form.controls.type.setValue(this.data.preselectedType);
      this.currentStep.set(2);
    }
  }

  /**
   * Load worldbuilding element types from project's schema library
   */
  private loadWorldbuildingTypes(username: string, slug: string): void {
    try {
      console.log(
        '[NewElementDialog] Loading worldbuilding types for',
        username,
        slug
      );

      // Get all schemas as plain objects
      const schemas = this.worldbuildingService.getAllSchemas();

      if (schemas.length === 0) {
        console.warn('[NewElementDialog] No schemas found');
        return;
      }

      console.log('[NewElementDialog] Found schemas:', schemas.length);
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
      console.log('[NewElementDialog] Found schema:', schema);

      worldbuildingOptions.push({
        type: ElementType.Worldbuilding,
        schemaId: schema.id,
        label: schema.name,
        icon: schema.icon,
        description: schema.description,
        category: 'worldbuilding',
      });
    }

    console.log(
      '[NewElementDialog] Built worldbuilding options:',
      worldbuildingOptions
    );

    // Update options with both document types and loaded worldbuilding types
    // Use the constant documentTypes instead of reading the signal to avoid
    // creating a dependency in the calling effect
    this.elementTypeOptions.set([
      ...this.documentTypes,
      ...worldbuildingOptions,
    ]);

    console.log(
      `[NewElementDialog] Loaded ${worldbuildingOptions.length} worldbuilding types from schema library`
    );
  }

  onCancel = (): void => {
    this.dialogRef.close();
  };

  onCreate = (): void => {
    if (this.form.valid) {
      const result: NewElementDialogResult = {
        name: this.form.controls.name.value,
        type: this.form.controls.type.value,
        schemaId: this.selectedSchemaId(),
      };
      this.dialogRef.close(result);
    }
  };

  // Step 1: Select type and optionally schema ID for worldbuilding
  selectType(option: ElementTypeOption): void {
    this.selectedType.set(option.type);
    this.selectedSchemaId.set(option.schemaId);
    this.form.controls.type.setValue(option.type);
    this.nextStep();
  }

  // Navigation
  nextStep(): void {
    if (this.currentStep() === 1 && this.selectedType()) {
      this.currentStep.set(2);
      // Focus on name input after view updates
      setTimeout(() => {
        const nameInput = document.querySelector<HTMLInputElement>(
          'input[formControlName="name"]'
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
