import {
  type CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  output,
  type QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import {
  FormBuilder,
  type FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import {
  MatExpansionModule,
  MatExpansionPanel,
} from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  type ElementTypeSchema,
  type FieldSchema,
  type TabSchema,
} from '../../../../../models/schema-types';

interface BasicForm {
  name: FormControl<string>;
  icon: FormControl<string>;
  description: FormControl<string>;
}

/**
 * Inline editor for an {@link ElementTypeSchema} (template).
 *
 * Rendered inside the templates settings section — NOT a routed page.
 * The parent passes a `schema` input and listens to the `done` output
 * to switch back to the list view.
 */
@Component({
  selector: 'app-template-editor-page',
  templateUrl: './template-editor-page.component.html',
  styleUrls: ['./template-editor-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatExpansionModule,
    MatChipsModule,
    MatTooltipModule,
    DragDropModule,
  ],
})
export class TemplateEditorPageComponent implements OnInit, AfterViewInit {
  private readonly fb = inject(FormBuilder).nonNullable;

  /** The schema to edit. Required — pass a blank schema to create a new one. */
  readonly schema = input.required<ElementTypeSchema>();

  /** Emitted when the editor is done (saved with the updated schema, or cancelled with null). */
  readonly done = output<ElementTypeSchema | null>();

  @ViewChildren(MatExpansionPanel)
  expansionPanels!: QueryList<MatExpansionPanel>;

  readonly isSaving = signal(false);
  readonly selectedTabIndex = signal(0);
  private lastFieldId: string | null = null;

  // Available field types
  readonly fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Text Area' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Select' },
    { value: 'array', label: 'Array (Tags)' },
    { value: 'checkbox', label: 'Checkbox' },
  ];

  // Available icons
  readonly availableIcons = [
    'person',
    'place',
    'category',
    'map',
    'diversity_1',
    'auto_stories',
    'groups',
    'pets',
    'settings',
    'description',
    'article',
    'star',
  ];

  // Form for basic schema metadata — initialised in ngOnInit from the schema input
  readonly basicForm: FormGroup<BasicForm>;

  // Tabs as a reactive array
  readonly tabs = signal<TabSchema[]>([]);

  constructor() {
    // Initialise with empty defaults; ngOnInit will populate from the schema input.
    this.basicForm = this.fb.group<BasicForm>({
      name: this.fb.control('', { validators: [Validators.required] }),
      icon: this.fb.control('', { validators: [Validators.required] }),
      description: this.fb.control(''),
    });
  }

  ngOnInit(): void {
    const schema = this.schema();

    this.basicForm.setValue({
      name: schema.name,
      icon: schema.icon,
      description: schema.description || '',
    });

    // Deep clone tabs to avoid mutating the original schema
    const tabs: TabSchema[] = structuredClone(schema.tabs);

    // Ensure all fields have IDs for tracking
    tabs.forEach(tab => {
      tab.fields.forEach(field => {
        if (!field.id) {
          field.id = `field_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        }
      });
    });

    this.tabs.set(tabs);
  }

  ngAfterViewInit(): void {
    this.expansionPanels.changes.subscribe(() => {
      if (this.lastFieldId) {
        setTimeout(() => {
          const panels = this.expansionPanels.toArray();
          const lastPanel = panels[panels.length - 1];
          if (lastPanel && !lastPanel.expanded) {
            lastPanel.open();
          }
          this.lastFieldId = null;
        }, 100);
      }
    });
  }

  /** Add a new tab */
  addTab(): void {
    let label = 'New Tab';
    let counter = 1;
    const existingLabels = new Set(this.tabs().map(t => t.label.toLowerCase()));
    while (existingLabels.has(label.toLowerCase())) {
      label = `New Tab ${counter}`;
      counter++;
    }

    const newTab: TabSchema = {
      key: `tab_${Date.now()}`,
      label,
      icon: 'article',
      order: this.tabs().length,
      fields: [],
    };
    this.tabs.set([...this.tabs(), newTab]);
    this.selectedTabIndex.set(this.tabs().length - 1);
  }

  /** Remove a tab */
  removeTab(index: number): void {
    const updatedTabs = this.tabs().filter((_, i) => i !== index);
    this.tabs.set(updatedTabs);
    if (this.selectedTabIndex() >= updatedTabs.length) {
      this.selectedTabIndex.set(Math.max(0, updatedTabs.length - 1));
    }
  }

  /** Update a tab's properties */
  updateTab(index: number, updates: Partial<TabSchema>): void {
    const updatedTabs = [...this.tabs()];
    updatedTabs[index] = { ...updatedTabs[index], ...updates };
    this.tabs.set(updatedTabs);
  }

  /** Handle tab reordering via drag-drop */
  onTabsDrop(event: CdkDragDrop<TabSchema[]>): void {
    const updatedTabs = [...this.tabs()];
    moveItemInArray(updatedTabs, event.previousIndex, event.currentIndex);
    updatedTabs.forEach((tab, idx) => {
      tab.order = idx;
    });
    this.tabs.set(updatedTabs);
  }

  /** Add a field to a tab */
  addField(tabIndex: number): void {
    const fieldId = `field_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newField: FieldSchema = {
      id: fieldId,
      key: `field_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      placeholder: '',
      layout: { span: 12 },
    };
    const updatedTabs = [...this.tabs()];
    updatedTabs[tabIndex].fields.push(newField);
    this.tabs.set(updatedTabs);
    this.lastFieldId = fieldId;
  }

  /** Remove a field from a tab */
  removeField(tabIndex: number, fieldIndex: number): void {
    const updatedTabs = [...this.tabs()];
    updatedTabs[tabIndex].fields.splice(fieldIndex, 1);
    this.tabs.set(updatedTabs);
  }

  /** Update a field's properties */
  updateField(
    tabIndex: number,
    fieldIndex: number,
    updates: Partial<FieldSchema>
  ): void {
    const updatedTabs = [...this.tabs()];
    updatedTabs[tabIndex].fields[fieldIndex] = {
      ...updatedTabs[tabIndex].fields[fieldIndex],
      ...updates,
    };
    this.tabs.set(updatedTabs);
  }

  /** Handle field reordering within a tab */
  onFieldsDrop(event: CdkDragDrop<FieldSchema[]>, tabIndex: number): void {
    const updatedTabs = [...this.tabs()];
    moveItemInArray(
      updatedTabs[tabIndex].fields,
      event.previousIndex,
      event.currentIndex
    );
    this.tabs.set(updatedTabs);
  }

  /** Save the updated schema */
  save(): void {
    if (this.basicForm.invalid) {
      this.basicForm.markAllAsTouched();
      return;
    }

    const formValue = this.basicForm.value as {
      name: string;
      icon: string;
      description: string;
    };

    const updatedSchema: ElementTypeSchema = {
      ...this.schema(),
      name: formValue.name,
      icon: formValue.icon,
      description: formValue.description,
      tabs: this.tabs(),
      version: this.schema().version + 1,
    };

    this.done.emit(updatedSchema);
  }

  /** Cancel editing */
  cancel(): void {
    this.done.emit(null);
  }
}
