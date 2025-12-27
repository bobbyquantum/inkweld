import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
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
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs';

import { Element as ApiElement, ElementType } from '../../../api-client';
import {
  ElementTypeSchema,
  FieldSchema,
  TabSchema,
} from '../../models/schema-types';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import {
  AriaTabConfig,
  AriaTabPanelComponent,
  AriaTabsComponent,
} from '../aria-tabs';
import { MetaPanelComponent } from '../meta-panel/meta-panel.component';
import { IdentityPanelComponent } from './identity-panel/identity-panel.component';

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
    MatTooltipModule,
    MetaPanelComponent,
    AriaTabsComponent,
    AriaTabPanelComponent,
    IdentityPanelComponent,
  ],
  templateUrl: './worldbuilding-editor.component.html',
  styleUrls: ['./worldbuilding-editor.component.scss'],
})
export class WorldbuildingEditorComponent implements OnDestroy {
  // Input properties
  elementId = input.required<string>();
  elementType = input.required<ElementType>();
  username = input.required<string>();
  slug = input.required<string>();

  private worldbuildingService = inject(WorldbuildingService);
  private projectState = inject(ProjectStateService);
  private dialogGateway = inject(DialogGatewayService);
  private cdr = inject(ChangeDetectorRef);

  // Schema and form
  schema = signal<ElementTypeSchema | null>(null);
  form = new FormGroup({});

  /** Computed element name from project state */
  elementName = computed(() => {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === this.elementId());
    return element?.name || 'Untitled';
  });

  /** Whether to show the meta panel (relationships + snapshots) */
  showMetaPanel = signal(false);

  /** Currently selected tab index for the aria tabs */
  selectedTabIndex = signal(0);

  private unsubscribeObserver: (() => void) | null = null;
  private formSubscription: (() => void) | null = null;
  private isUpdatingFromRemote = false;

  constructor() {
    effect(() => {
      const id = this.elementId();
      const username = this.username();
      const slug = this.slug();

      // Only load when all required values are available
      if (id && username && slug) {
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

  private async loadElementData(elementId: string): Promise<void> {
    try {
      const username = this.username();
      const slug = this.slug();

      // Load the schema from the project library using the element's schema type
      let loadedSchema: ElementTypeSchema | null = null;
      if (username && slug) {
        loadedSchema = await this.worldbuildingService.getSchemaForElement(
          elementId,
          username,
          slug
        );
      }
      this.schema.set(loadedSchema);

      if (!loadedSchema && username && slug) {
        const elements = this.projectState.elements();
        const element: ApiElement | undefined = elements.find(
          (el: ApiElement) => el.id === elementId
        );
        if (element) {
          await this.worldbuildingService.initializeWorldbuildingElement(
            element,
            username,
            slug
          );

          // Re-fetch the schema after initialization
          const reinitializedSchema =
            await this.worldbuildingService.getSchemaForElement(
              elementId,
              username,
              slug
            );
          this.schema.set(reinitializedSchema);
          if (reinitializedSchema) {
            this.buildFormFromSchema(reinitializedSchema);
          }
        }
      } else if (loadedSchema) {
        this.buildFormFromSchema(loadedSchema);
      }

      const data = await this.worldbuildingService.getWorldbuildingData(
        elementId,
        username,
        slug
      );
      if (data) {
        this.updateFormFromData(data);
      }
    } catch (error) {
      console.error('[WorldbuildingEditor] Error loading element data:', error);
    }
  }

  private buildFormFromSchema(schema: ElementTypeSchema): void {
    if (!schema?.tabs) {
      console.warn('[WorldbuildingEditor] No tabs in schema');
      return;
    }

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
    this.setupFormSubscription();
  }

  private setupFormSubscription(): void {
    if (this.formSubscription) {
      this.formSubscription();
    }
    const subscription = this.form.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (!this.isUpdatingFromRemote) {
          void this.saveData();
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
        try {
          if (control instanceof FormArray) {
            control.clear({ emitEvent: false });
            if (Array.isArray(value)) {
              value.forEach(item =>
                control.push(new FormControl(item), { emitEvent: false })
              );
            }
          } else if (
            control instanceof FormGroup &&
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
          ) {
            // Nested FormGroup - update child controls
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
              const nestedControl = control.get(nestedKey);
              if (nestedControl) {
                if (nestedControl instanceof FormArray) {
                  nestedControl.clear({ emitEvent: false });
                  if (Array.isArray(nestedValue)) {
                    (nestedValue as unknown[]).forEach(item =>
                      nestedControl.push(new FormControl(item), {
                        emitEvent: false,
                      })
                    );
                  }
                } else {
                  nestedControl.setValue(nestedValue, { emitEvent: false });
                }
              }
            });
          } else if (control instanceof FormGroup) {
            // FormGroup but value is not an object - skip, can't map incompatible types
            console.warn(
              `[WorldbuildingEditor] Skipping field "${key}": FormGroup expected object but got ${typeof value}`
            );
          } else {
            control.setValue(value, { emitEvent: false });
          }
        } catch (err) {
          console.warn(
            `[WorldbuildingEditor] Error updating field "${key}":`,
            err
          );
        }
      }
    });
    this.isUpdatingFromRemote = false;
    // Trigger change detection so Angular Material form fields update their floating labels
    this.cdr.markForCheck();
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
    await this.worldbuildingService.saveWorldbuildingData(
      this.elementId(),
      formValue,
      this.username(),
      this.slug()
    );
  }

  getTabs(): TabSchema[] {
    return this.schema()?.tabs || [];
  }

  /** Get tab configs for aria-tabs component */
  getTabConfigs(): AriaTabConfig[] {
    return this.getTabs().map(tab => ({
      key: tab.key,
      label: tab.label,
    }));
  }

  /** Get the currently selected tab key */
  getSelectedTabKey(): string {
    const tabs = this.getTabs();
    return tabs[this.selectedTabIndex()]?.key || '';
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

  /** Handle rename request from identity panel */
  async onRenameRequested(): Promise<void> {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === this.elementId());
    if (!element) return;

    const newName = await this.dialogGateway.openRenameDialog({
      currentName: element.name,
      title: 'Rename Element',
    });

    if (newName) {
      void this.projectState.renameNode(element, newName);
    }
  }
}
