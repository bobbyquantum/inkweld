import { CommonModule } from '@angular/common';
import {
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { debounceTime } from 'rxjs';

import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '../../../../api-client';
import { TemplateEditorDialogComponent } from '../../../dialogs/template-editor-dialog/template-editor-dialog.component';
import {
  ElementTypeSchema,
  FieldSchema,
  TabSchema,
} from '../../../models/schema-types';
import { ProjectStateService } from '../../../services/project-state.service';
import { WorldbuildingService } from '../../../services/worldbuilding.service';

/**
 * Dynamic worldbuilding editor that renders forms based on schema
 * Replaces all hard-coded element-specific editors
 */
@Component({
  selector: 'app-dynamic-worldbuilding-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatTabsModule,
  ],
  templateUrl: './dynamic-worldbuilding-editor.component.html',
  styleUrls: ['./dynamic-worldbuilding-editor.component.scss'],
})
export class DynamicWorldbuildingEditorComponent implements OnDestroy {
  private worldbuildingService = inject(WorldbuildingService);
  private projectState = inject(ProjectStateService);
  private dialog = inject(MatDialog);

  // Inputs
  elementId = input.required<string>();
  username = input<string>();
  slug = input<string>();

  // Schema loaded from the element
  schema = signal<ElementTypeSchema | null>(null);
  form = new FormGroup({});

  private unsubscribeObserver: (() => void) | null = null;
  private formSubscription: (() => void) | null = null;
  private isUpdatingFromRemote = false;

  constructor() {
    // Load element data and schema when elementId changes
    effect(() => {
      const id = this.elementId();
      if (id) {
        void this.loadElementData(id);
        void this.setupRealtimeSync(id);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }
    if (this.formSubscription) {
      this.formSubscription();
    }
  }

  /**
   * Load element data and schema
   */
  private async loadElementData(elementId: string): Promise<void> {
    try {
      // Get the element's Y.Doc to load the embedded schema
      await this.worldbuildingService.setupCollaboration(
        elementId,
        this.username(),
        this.slug()
      );
      const ydoc =
        this.worldbuildingService['connections'].get(elementId)?.ydoc;

      if (ydoc) {
        const loadedSchema =
          this.worldbuildingService.loadSchemaFromElement(ydoc);
        this.schema.set(loadedSchema);
        console.log('[DynamicEditor] Loaded schema:', loadedSchema);

        // If no embedded schema found, try to initialize the element
        if (!loadedSchema && this.username() && this.slug()) {
          console.log(
            '[DynamicEditor] No embedded schema found, initializing element...'
          );

          // Find the element from project state to get its type
          const elements = this.projectState.elements();
          const element = elements.find(
            (el: GetApiV1ProjectsUsernameSlugElements200ResponseInner) => el.id === elementId
          );

          if (element) {
            await this.worldbuildingService.initializeWorldbuildingElement(
              element,
              this.username(),
              this.slug()
            );

            // Try loading schema again after initialization
            const reinitializedSchema =
              this.worldbuildingService.loadSchemaFromElement(ydoc);
            this.schema.set(reinitializedSchema);
            console.log(
              '[DynamicEditor] Schema after initialization:',
              reinitializedSchema
            );

            if (reinitializedSchema) {
              this.buildFormFromSchema(reinitializedSchema);
            }
          }
        } else if (loadedSchema) {
          // Build form from schema
          this.buildFormFromSchema(loadedSchema);
        }

        // Load existing data
        const data =
          await this.worldbuildingService.getWorldbuildingData(elementId);
        console.log('[DynamicEditor] Loaded data from Y.Doc:', {
          data,
          dataStringified: JSON.stringify(data, null, 2),
        });
        if (data) {
          this.updateFormFromData(data);
        }
      }
    } catch (error) {
      console.error('[DynamicEditor] Error loading element data:', error);
    }
  }

  /**
   * Build reactive form from schema definition
   */
  private buildFormFromSchema(schema: ElementTypeSchema): void {
    if (!schema?.tabs) {
      console.warn('[DynamicEditor] No tabs in schema');
      return;
    }

    // Form group needs any type due to dynamic nature of form controls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formGroup: Record<string, any> = {};

    schema.tabs.forEach((tab: TabSchema) => {
      tab.fields?.forEach((field: FieldSchema) => {
        const fieldKey = field.key;

        // Handle nested fields (e.g., 'appearance.height')
        if (fieldKey.includes('.')) {
          const [parentKey, childKey] = fieldKey.split('.');

          // Create parent FormGroup if it doesn't exist
          if (!formGroup[parentKey]) {
            formGroup[parentKey] = new FormGroup({});
          }

          // Add control to parent group
          const parentGroup = formGroup[parentKey] as FormGroup;
          switch (field.type) {
            case 'text':
            case 'textarea':
            case 'number':
            case 'date':
            case 'select':
              parentGroup.addControl(childKey, new FormControl(''));
              break;
            case 'array':
              parentGroup.addControl(childKey, new FormArray([]));
              break;
            case 'checkbox':
              parentGroup.addControl(childKey, new FormControl(false));
              break;
          }
        } else {
          // Top-level fields
          switch (field.type) {
            case 'text':
            case 'textarea':
            case 'number':
            case 'date':
            case 'select':
              formGroup[fieldKey] = new FormControl('');
              break;
            case 'array':
              formGroup[fieldKey] = new FormArray([]);
              break;
            case 'checkbox':
              formGroup[fieldKey] = new FormControl(false);
              break;
          }
        }
      });
    });

    this.form = new FormGroup(formGroup);
    console.log(
      '[DynamicEditor] Built form with controls:',
      Object.keys(formGroup)
    );

    // Set up form change subscription after form is built
    this.setupFormSubscription();
  }

  /**
   * Set up form value changes subscription
   */
  private setupFormSubscription(): void {
    // Unsubscribe from previous subscription if exists
    if (this.formSubscription) {
      this.formSubscription();
    }

    // Subscribe to form changes with debounce
    const subscription = this.form.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => {
        console.log('[DynamicEditor] Form value changed, saving...');
        if (!this.isUpdatingFromRemote) {
          void this.saveData();
        } else {
          console.log(
            '[DynamicEditor] Skipping save - updating from remote changes'
          );
        }
      });

    // Store unsubscribe function
    this.formSubscription = () => subscription.unsubscribe();
  }

  /**
   * Update form with loaded data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateFormFromData(data: any): void {
    this.isUpdatingFromRemote = true;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.entries(data).forEach(([key, value]) => {
      const control = this.form.get(key);
      if (control) {
        if (control instanceof FormArray) {
          // Handle arrays
          control.clear();
          if (Array.isArray(value)) {
            value.forEach(item => {
              control.push(new FormControl(item));
            });
          }
        } else if (
          control instanceof FormGroup &&
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          // Handle nested FormGroups
          Object.entries(value).forEach(([nestedKey, nestedValue]) => {
            const nestedControl = control.get(nestedKey);
            if (nestedControl) {
              nestedControl.setValue(nestedValue, { emitEvent: false });
            }
          });
        } else {
          // Handle simple values
          control.setValue(value, { emitEvent: false });
        }
      }
    });

    this.isUpdatingFromRemote = false;
  }

  /**
   * Set up real-time sync observer
   */
  private async setupRealtimeSync(elementId: string): Promise<void> {
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }

    this.unsubscribeObserver = await this.worldbuildingService.observeChanges(
      elementId,
      data => {
        this.isUpdatingFromRemote = true;
        this.updateFormFromData(data);
        this.isUpdatingFromRemote = false;
      },
      this.username(),
      this.slug()
    );
  }

  /**
   * Save form data
   */
  private async saveData(): Promise<void> {
    const formValue = this.form.value;
    console.log('[DynamicEditor] Saving data:', {
      elementId: this.elementId(),
      formValue,
      formValueStringified: JSON.stringify(formValue, null, 2),
    });
    await this.worldbuildingService.saveWorldbuildingData(
      this.elementId(),
      formValue,
      this.username(),
      this.slug()
    );
    console.log('[DynamicEditor] Data saved successfully');
  }

  /**
   * Get tabs from schema for template
   */
  getTabs(): TabSchema[] {
    return this.schema()?.tabs || [];
  }

  /**
   * Get fields for a specific tab
   */
  getFieldsForTab(tabKey: string): FieldSchema[] {
    const tab = this.getTabs().find(t => t.key === tabKey);
    return tab?.fields || [];
  }

  /**
   * Get form array for array-type fields
   */
  getFormArray(fieldKey: string): FormArray {
    return this.form.get(fieldKey) as FormArray;
  }

  /**
   * Add item to array field
   */
  addArrayItem(fieldKey: string): void {
    const formArray = this.getFormArray(fieldKey);
    formArray.push(new FormControl(''));
  }

  /**
   * Remove item from array field
   */
  removeArrayItem(fieldKey: string, index: number): void {
    const formArray = this.getFormArray(fieldKey);
    formArray.removeAt(index);
  }

  /**
   * Edit the embedded template schema
   */
  async editEmbeddedTemplate(): Promise<void> {
    const currentSchema = this.schema();
    if (!currentSchema) {
      console.warn('[DynamicEditor] No schema available to edit');
      return;
    }

    // Open the template editor dialog with the current embedded schema
    const dialogRef = this.dialog.open(TemplateEditorDialogComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: { schema: currentSchema },
    });

    try {
      const result = (await dialogRef.afterClosed().toPromise()) as
        | ElementTypeSchema
        | undefined;
      if (result) {
        // Update the embedded schema in the element's Y.Doc
        const elementId = this.elementId();
        const connection =
          this.worldbuildingService['connections'].get(elementId);

        if (connection?.ydoc) {
          this.worldbuildingService.embedSchemaInElement(
            connection.ydoc,
            result
          );

          // Update the local schema signal
          this.schema.set(result);

          // Rebuild the form with the updated schema
          this.buildFormFromSchema(result);

          console.log(
            '[DynamicEditor] Updated embedded template:',
            result.name
          );
        }
      }
    } catch (error) {
      console.error('[DynamicEditor] Error updating embedded template:', error);
    }
  }
}




