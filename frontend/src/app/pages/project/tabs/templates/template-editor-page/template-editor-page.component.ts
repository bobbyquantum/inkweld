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
  type FormGroup,
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
  readonly validationError = signal<string | null>(null);
  /** @internal Exposed for unit testing only. */
  _lastFieldId: string | null = null;

  // Available field types
  readonly fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Text Area' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
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
          field.id = this.createUniqueKey('field');
        }
      });
    });

    this.tabs.set(tabs);
  }

  ngAfterViewInit(): void {
    this.expansionPanels.changes.subscribe(() => {
      if (this._lastFieldId) {
        setTimeout(() => {
          const panels = this.expansionPanels.toArray();
          const lastPanel = panels[panels.length - 1];
          if (lastPanel && !lastPanel.expanded) {
            lastPanel.open();
          }
          this._lastFieldId = null;
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
      key: this.createUniqueKey('tab'),
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
    this.mutateTabs(tabs => {
      tabs[index] = { ...tabs[index], ...updates };
    });
  }

  /** Handle tab reordering via drag-drop */
  onTabsDrop(event: CdkDragDrop<TabSchema[]>): void {
    this.mutateTabs(tabs => {
      moveItemInArray(tabs, event.previousIndex, event.currentIndex);
      tabs.forEach((tab, idx) => {
        tab.order = idx;
      });
    });
  }

  /** Add a field to a tab */
  addField(tabIndex: number): void {
    const fieldId = this.createUniqueKey('field');
    const newField: FieldSchema = {
      id: fieldId,
      key: fieldId,
      label: 'New Field',
      type: 'text',
      placeholder: '',
      layout: { span: 12 },
    };
    this.mutateTabs(tabs => {
      tabs[tabIndex].fields.push(newField);
    });
    this._lastFieldId = fieldId;
  }

  /** Remove a field from a tab */
  removeField(tabIndex: number, fieldIndex: number): void {
    this.mutateTabs(tabs => {
      tabs[tabIndex].fields.splice(fieldIndex, 1);
    });
  }

  /** Update a field's properties */
  updateField(
    tabIndex: number,
    fieldIndex: number,
    updates: Partial<FieldSchema>
  ): void {
    this.mutateTabs(tabs => {
      tabs[tabIndex].fields[fieldIndex] = {
        ...tabs[tabIndex].fields[fieldIndex],
        ...updates,
      };
    });
  }

  /** Handle field reordering within a tab */
  onFieldsDrop(event: CdkDragDrop<FieldSchema[]>, tabIndex: number): void {
    this.mutateTabs(tabs => {
      moveItemInArray(
        tabs[tabIndex].fields,
        event.previousIndex,
        event.currentIndex
      );
    });
  }

  /** Save the updated schema */
  save(): void {
    if (this.basicForm.invalid) {
      this.basicForm.markAllAsTouched();
      return;
    }

    const validationError = this.validateSchema();
    if (validationError) {
      this.validationError.set(validationError);
      return;
    }

    this.validationError.set(null);

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

    this.isSaving.set(true);
    try {
      this.done.emit(updatedSchema);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Cancel editing */
  cancel(): void {
    this.done.emit(null);
  }

  private mutateTabs(fn: (tabs: TabSchema[]) => void): void {
    const updatedTabs = [...this.tabs()];
    fn(updatedTabs);
    this.tabs.set(updatedTabs);
  }

  private createUniqueKey(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  private validateSchema(): string | null {
    const tabKeys = new Set<string>();
    const fieldKeys = new Set<string>();

    for (const tab of this.tabs()) {
      const tabLabel = tab.label.trim();
      if (!tabLabel) {
        return 'Each tab needs a label.';
      }

      const normalizedTabKey = tab.key.trim();
      if (!normalizedTabKey) {
        return 'Each tab needs a key.';
      }
      if (tabKeys.has(normalizedTabKey)) {
        return 'Tab keys must be unique.';
      }
      tabKeys.add(normalizedTabKey);

      for (const field of tab.fields) {
        const normalizedFieldKey = field.key.trim();
        if (!normalizedFieldKey) {
          return 'Each field needs a key.';
        }
        if (fieldKeys.has(normalizedFieldKey)) {
          return 'Field keys must be unique across the template.';
        }
        fieldKeys.add(normalizedFieldKey);
      }
    }

    return null;
  }
}
