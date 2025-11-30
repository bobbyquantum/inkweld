import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

interface TabSchema {
  key: string;
  label: string;
  icon?: string;
  order?: number;
  fields: FieldSchema[];
}

interface FieldSchema {
  id?: string;
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  description?: string;
  rows?: number;
  options?: string[];
  layout?: { span?: number };
  validation?: { required?: boolean };
}

interface ElementTypeSchema {
  id: string;
  type: string;
  name: string;
  icon: string;
  description: string;
  version: number;
  tabs: TabSchema[];
  defaultValues?: Record<string, unknown>;
  isBuiltIn?: boolean;
}

export interface TemplateEditorDialogData {
  schema: ElementTypeSchema;
}

@Component({
  selector: 'app-template-editor-dialog',
  templateUrl: './template-editor-dialog.component.html',
  styleUrls: ['./template-editor-dialog.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatExpansionModule,
    MatChipsModule,
    DragDropModule,
  ],
})
export class TemplateEditorDialogComponent implements AfterViewInit {
  private dialogRef = inject(MatDialogRef<TemplateEditorDialogComponent>);
  private fb = inject(FormBuilder);
  readonly data = inject<TemplateEditorDialogData>(MAT_DIALOG_DATA);

  @ViewChildren(MatExpansionPanel)
  expansionPanels!: QueryList<MatExpansionPanel>;

  readonly isSaving = signal(false);
  readonly selectedTabIndex = signal(0);
  private lastFieldId: string | null = null;

  // Form for basic schema metadata
  basicForm: FormGroup;

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

  // Tabs as a reactive array
  tabs = signal<TabSchema[]>([]);

  constructor() {
    // Initialize basic form
    this.basicForm = this.fb.group({
      name: [this.data.schema.name, Validators.required],
      icon: [this.data.schema.icon, Validators.required],
      description: [this.data.schema.description || ''],
    });

    // Deep clone tabs to avoid mutating original
    const tabs = JSON.parse(
      JSON.stringify(this.data.schema.tabs)
    ) as TabSchema[];

    // Ensure all fields have IDs for tracking
    tabs.forEach(tab => {
      tab.fields.forEach(field => {
        if (!field.id) {
          field.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      });
    });

    this.tabs.set(tabs);
  }

  ngAfterViewInit(): void {
    // Watch for changes to expansion panels and auto-expand newly created fields
    this.expansionPanels.changes.subscribe(() => {
      if (this.lastFieldId) {
        // Find and expand the panel for the newly created field
        // Use a longer timeout to ensure Angular has finished rendering
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

  /**
   * Add a new tab
   */
  addTab(): void {
    // Generate unique tab label
    let label = 'New Tab';
    let counter = 1;
    const existingLabels = this.tabs().map(t => t.label.toLowerCase());
    while (existingLabels.includes(label.toLowerCase())) {
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

  /**
   * Remove a tab
   */
  removeTab(index: number): void {
    const updatedTabs = this.tabs().filter((_, i) => i !== index);
    this.tabs.set(updatedTabs);
    if (this.selectedTabIndex() >= updatedTabs.length) {
      this.selectedTabIndex.set(Math.max(0, updatedTabs.length - 1));
    }
  }

  /**
   * Update a tab's properties
   */
  updateTab(index: number, updates: Partial<TabSchema>): void {
    const updatedTabs = [...this.tabs()];
    updatedTabs[index] = { ...updatedTabs[index], ...updates };
    this.tabs.set(updatedTabs);
  }

  /**
   * Handle tab reordering via drag-drop
   */
  onTabsDrop(event: CdkDragDrop<TabSchema[]>): void {
    const updatedTabs = [...this.tabs()];
    moveItemInArray(updatedTabs, event.previousIndex, event.currentIndex);
    // Update order property
    updatedTabs.forEach((tab, idx) => {
      tab.order = idx;
    });
    this.tabs.set(updatedTabs);
  }

  /**
   * Add a field to a tab
   */
  addField(tabIndex: number): void {
    const fieldId = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    // Store the field ID for auto-expansion
    this.lastFieldId = fieldId;
  }

  /**
   * Remove a field from a tab
   */
  removeField(tabIndex: number, fieldIndex: number): void {
    const updatedTabs = [...this.tabs()];
    updatedTabs[tabIndex].fields.splice(fieldIndex, 1);
    this.tabs.set(updatedTabs);
  }

  /**
   * Update a field's properties
   */
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

  /**
   * Handle field reordering within a tab
   */
  onFieldsDrop(event: CdkDragDrop<FieldSchema[]>, tabIndex: number): void {
    const updatedTabs = [...this.tabs()];
    moveItemInArray(
      updatedTabs[tabIndex].fields,
      event.previousIndex,
      event.currentIndex
    );
    this.tabs.set(updatedTabs);
  }

  /**
   * Save the updated schema
   */
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
      ...this.data.schema,
      name: formValue.name,
      icon: formValue.icon,
      description: formValue.description,
      tabs: this.tabs(),
      version: this.data.schema.version + 1,
    };

    this.dialogRef.close(updatedSchema);
  }

  /**
   * Cancel editing
   */
  cancel(): void {
    this.dialogRef.close(null);
  }
}
