import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
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

import { Element, ElementType } from '../../../../api-client';
import { TemplateEditorDialogComponent } from '../../../dialogs/template-editor-dialog/template-editor-dialog.component';
import {
  ElementTypeSchema,
  FieldSchema,
  TabSchema,
} from '../../../models/schema-types';
import { ProjectStateService } from '../../../services/project-state.service';
import { WorldbuildingService } from '../../../services/worldbuilding.service';

/**
 * Main worldbuilding editor component that renders the dynamic
 * editor logic that used to be in a separate dynamic component.
 */
@Component({
  selector: 'app-worldbuilding-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    // (MatIconModule already included above)
  ],
  templateUrl: './worldbuilding-editor.component.html',
  styleUrls: ['./worldbuilding-editor.component.scss'],
})
export class WorldbuildingEditorComponent implements OnDestroy {
  // Input properties
  elementId = input.required<string>();
  elementType = input.required<ElementType>();
  username = input<string>();
  slug = input<string>();

  private worldbuildingService = inject(WorldbuildingService);
  private projectState = inject(ProjectStateService);
  private dialog = inject(MatDialog);

  // Schema and form
  schema = signal<ElementTypeSchema | null>(null);
  form = new FormGroup({});

  private unsubscribeObserver: (() => void) | null = null;
  private formSubscription: (() => void) | null = null;
  private isUpdatingFromRemote = false;

  constructor() {
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
        console.log('[WorldbuildingEditor] Loaded schema:', loadedSchema);

        if (!loadedSchema && this.username() && this.slug()) {
          console.log(
            '[WorldbuildingEditor] No embedded schema found, initializing element...'
          );

          const elements = this.projectState.elements();
          const element = elements.find((el: Element) => el.id === elementId);

          if (element) {
            await this.worldbuildingService.initializeWorldbuildingElement(
              element,
              this.username(),
              this.slug()
            );

            const reinitializedSchema =
              this.worldbuildingService.loadSchemaFromElement(ydoc);
            this.schema.set(reinitializedSchema);
            console.log(
              '[WorldbuildingEditor] Schema after initialization:',
              reinitializedSchema
            );

            if (reinitializedSchema) {
              this.buildFormFromSchema(reinitializedSchema);
            }
          }
        } else if (loadedSchema) {
          this.buildFormFromSchema(loadedSchema);
        }

        const data =
          await this.worldbuildingService.getWorldbuildingData(elementId);
        console.log('[WorldbuildingEditor] Loaded data from Y.Doc:', {
          data,
          dataStringified: JSON.stringify(data, null, 2),
        });
        if (data) {
          this.updateFormFromData(data);
        }
      }
    } catch (error) {
      console.error('[WorldbuildingEditor] Error loading element data:', error);
    }
  }

  /**
   * Build reactive form from schema definition
   */
  private buildFormFromSchema(schema: ElementTypeSchema): void {
    if (!schema?.tabs) {
      console.warn('[WorldbuildingEditor] No tabs in schema');
      return;
    }

    // Form group needs any type due to dynamic nature of form controls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formGroup: Record<string, any> = {};

    schema.tabs.forEach((tab: TabSchema) => {
      tab.fields?.forEach((field: FieldSchema) => {
        const fieldKey = field.key;

        if (fieldKey.includes('.')) {
          const [parentKey, childKey] = fieldKey.split('.');

          if (!formGroup[parentKey]) {
            formGroup[parentKey] = new FormGroup({});
          }

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
      '[WorldbuildingEditor] Built form with controls:',
      Object.keys(formGroup)
    );
    this.setupFormSubscription();
  }

  private setupFormSubscription(): void {
    if (this.formSubscription) {
      this.formSubscription();
    }

    const subscription = this.form.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => {
        console.log('[WorldbuildingEditor] Form value changed, saving...');
        if (!this.isUpdatingFromRemote) {
          void this.saveData();
        } else {
          console.log(
            '[WorldbuildingEditor] Skipping save - updating from remote changes'
          );
        }
      });

    this.formSubscription = () => subscription.unsubscribe();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateFormFromData(data: any): void {
    this.isUpdatingFromRemote = true;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.entries(data).forEach(([key, value]) => {
      const control = this.form.get(key);
      if (control) {
        if (control instanceof FormArray) {
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
          Object.entries(value).forEach(([nestedKey, nestedValue]) => {
            const nestedControl = control.get(nestedKey);
            if (nestedControl) {
              nestedControl.setValue(nestedValue, { emitEvent: false });
            }
          });
        } else {
          control.setValue(value, { emitEvent: false });
        }
      }
    });

    this.isUpdatingFromRemote = false;
  }

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

  private async saveData(): Promise<void> {
    const formValue = this.form.value;
    console.log('[WorldbuildingEditor] Saving data:', {
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
    console.log('[WorldbuildingEditor] Data saved successfully');
  }

  // Getters and helpers that were previously on dynamic component
  getTabs(): TabSchema[] {
    return this.schema()?.tabs || [];
  }

  getFieldsForTab(tabKey: string): FieldSchema[] {
    const tab = this.getTabs().find(t => t.key === tabKey);
    return tab?.fields || [];
  }

  getFormArray(fieldKey: string): FormArray {
    return this.form.get(fieldKey) as FormArray;
  }

  addArrayItem(fieldKey: string): void {
    const formArray = this.getFormArray(fieldKey);
    formArray.push(new FormControl(''));
  }

  removeArrayItem(fieldKey: string, index: number): void {
    const formArray = this.getFormArray(fieldKey);
    formArray.removeAt(index);
  }

  async editEmbeddedTemplate(): Promise<void> {
    const currentSchema = this.schema();
    if (!currentSchema) {
      console.warn('[WorldbuildingEditor] No schema available to edit');
      return;
    }

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
        const elementId = this.elementId();
        const connection =
          this.worldbuildingService['connections'].get(elementId);

        if (connection?.ydoc) {
          this.worldbuildingService.embedSchemaInElement(
            connection.ydoc,
            result
          );
          this.schema.set(result);
          this.buildFormFromSchema(result);
          console.log(
            '[WorldbuildingEditor] Updated embedded template:',
            result.name
          );
        }
      }
    } catch (error) {
      console.error(
        '[WorldbuildingEditor] Error updating embedded template:',
        error
      );
    }
  }
}
