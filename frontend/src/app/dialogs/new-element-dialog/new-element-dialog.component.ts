import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ElementType } from '../../../api-client';
import { ProjectStateService } from '../../services/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding.service';

interface NewElementForm {
  name: FormControl<string>;
  type: FormControl<ElementType>;
}
export interface NewElementDialogResult {
  name: string;
  type: ElementType;
}
interface ElementTypeOption {
  type: ElementType;
  label: string;
  icon: string;
  description: string;
  category: 'document' | 'worldbuilding';
}

@Component({
  selector: 'app-new-element-dialog',
  templateUrl: './new-element-dialog.component.html',
  styleUrls: ['./new-element-dialog.component.scss'],
  standalone: true,
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

  // Step control
  currentStep = signal<1 | 2>(1);
  selectedType = signal<ElementType | null>(null);
  searchQuery = signal('');

  // Element type options (starts with document types, worldbuilding loaded dynamically)
  elementTypeOptions = signal<ElementTypeOption[]>([
    // Document types (always available)
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
  ]);

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

  readonly form: FormGroup<NewElementForm>;

  constructor() {
    // Initialize form
    this.form = new FormGroup<NewElementForm>({
      name: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      type: new FormControl<ElementType>(ElementType.Item, {
        nonNullable: true,
        validators: [Validators.required],
      }),
    });

    // Load worldbuilding types from project schema library
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        void this.loadWorldbuildingTypes(project.username, project.slug);
      }
    });
  }

  /**
   * Load worldbuilding element types from project's schema library
   */
  private async loadWorldbuildingTypes(
    username: string,
    slug: string
  ): Promise<void> {
    try {
      console.log(
        '[NewElementDialog] Loading worldbuilding types for',
        username,
        slug
      );
      const projectKey = `${username}:${slug}`;
      const library = await this.worldbuildingService.loadSchemaLibrary(
        projectKey,
        username,
        slug
      );

      console.log('[NewElementDialog] Loaded library:', library);

      const schemasMap = library.get('schemas');

      // Auto-load default templates if library is empty
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      if (!schemasMap || (schemasMap as any).size === 0) {
        console.log(
          '[NewElementDialog] Schema library empty, auto-loading default templates'
        );
        await this.worldbuildingService.autoLoadDefaultTemplates(
          projectKey,
          username,
          slug
        );

        // Reload library after auto-loading
        const reloadedLibrary =
          await this.worldbuildingService.loadSchemaLibrary(
            projectKey,
            username,
            slug
          );
        const reloadedSchemas = reloadedLibrary.get('schemas');

        if (!reloadedSchemas) {
          console.warn('[NewElementDialog] No schemas after auto-load');
          return;
        }

        // Continue with the reloaded schemas
        this.buildWorldbuildingOptions(reloadedSchemas);
        return;
      }

      console.log('[NewElementDialog] Found schemas map');
      this.buildWorldbuildingOptions(schemasMap);
    } catch (error) {
      console.error('[NewElementDialog] Error loading schemas:', error);
    }
  }

  /**
   * Build worldbuilding type options from schemas map
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildWorldbuildingOptions(schemasMap: any): void {
    const worldbuildingOptions: ElementTypeOption[] = [];

    // Iterate through available schemas
    // Y.Map iteration requires any types for dynamic schema structure
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    schemasMap.forEach((schemaData: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const type = schemaData.get('type');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const name = schemaData.get('name');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const icon = schemaData.get('icon');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const description = schemaData.get('description');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const schemaInfo = { type, name, icon, description };
      console.log('[NewElementDialog] Found schema:', schemaInfo);

      worldbuildingOptions.push({
        type: type as ElementType,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        label: name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        icon: icon,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        description: description,
        category: 'worldbuilding',
      });
    });

    console.log(
      '[NewElementDialog] Built worldbuilding options:',
      worldbuildingOptions
    );

    // Update options with both document types and loaded worldbuilding types
    this.elementTypeOptions.set([
      ...this.elementTypeOptions().filter(
        (opt: ElementTypeOption) => opt.category === 'document'
      ),
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
      };
      this.dialogRef.close(result);
    }
  };

  // Step 1: Select type
  selectType(type: ElementType): void {
    this.selectedType.set(type);
    this.form.controls.type.setValue(type);
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
    if (!selected) return undefined;
    return this.elementTypeOptions().find(
      (o: ElementTypeOption) => o.type === selected
    );
  }
}
