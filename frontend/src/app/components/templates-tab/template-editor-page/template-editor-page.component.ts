import { type CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnDestroy,
  type OnInit,
  output,
  type QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  type SchemaEditEvent,
  WorldbuildingEditorComponent,
} from '@components/worldbuilding/worldbuilding-editor.component';
import { ElementType } from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { type ElementAppearance } from '@models/element-appearance';
import {
  type ElementTypeSchema,
  type FieldSchema,
  type TabSchema,
} from '@models/schema-types';

interface BasicFormValue {
  name: string;
  icon: string;
  description: string;
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
    FormField,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoModule,
    WorldbuildingEditorComponent,
  ],
})
export class TemplateEditorPageComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  /** Exposed for the preview template. */
  readonly ElementType = ElementType;

  /** The schema to edit. Required — pass a blank schema to create a new one. */
  readonly schema = input.required<ElementTypeSchema>();

  /** Emitted when the editor is done (saved with the updated schema, or cancelled with null). */
  readonly done = output<ElementTypeSchema | null>();

  /** Emitted (debounced) with the latest schema after preview edits, for live saving. */
  readonly schemaChange = output<ElementTypeSchema>();

  @ViewChildren(MatExpansionPanel)
  expansionPanels!: QueryList<MatExpansionPanel>;

  readonly isSaving = signal(false);
  readonly selectedTabIndex = signal(0);
  readonly validationError = signal<string | null>(
    null
  ); /** @internal Exposed for unit testing only. */
  _lastFieldId: string | null = null;

  /** Pending timer id for the debounced live-save emit. */
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

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

  readonly model = signal<BasicFormValue>({
    name: '',
    icon: '',
    description: '',
  });

  // Form for basic schema metadata — initialised in ngOnInit from the schema input
  readonly basicForm = form(this.model, schemaPath => {
    required(schemaPath.name, { message: 'Name is required' });
    required(schemaPath.icon, { message: 'Icon is required' });
  });

  // Tabs as a reactive array
  readonly tabs = signal<TabSchema[]>([]);

  // Default appearance for new elements of this type
  readonly defaultAppearance = signal<ElementAppearance | undefined>(undefined);

  // Default identity image for new elements of this type
  readonly defaultImage = signal<string | undefined>(undefined);

  /** A transient schema built from the current editor state, for the preview. */
  readonly previewSchema = computed<ElementTypeSchema>(() => ({
    id: this.schema().id,
    name: this.model().name,
    icon: this.model().icon || 'category',
    description: this.model().description || '',
    version: this.schema().version,
    tabs: this.tabs(),
    defaultAppearance: this.defaultAppearance(),
    defaultImage: this.defaultImage(),
  }));

  constructor() {}

  /**
   * Debounce emitting the assembled current schema so parents can live-save
   * without a modal save step. Fires on a trailing edge after edits stop.
   */
  protected scheduleAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.schemaChange.emit(this.buildUpdatedSchema());
    }, 600);
  }

  /** Flush any pending autosave immediately (e.g. on exit). */
  protected flushAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      this.schemaChange.emit(this.buildUpdatedSchema());
    }
  }

  ngOnInit(): void {
    const schema = this.schema();

    this.model.set({
      name: schema.name,
      icon: schema.icon,
      description: schema.description || '',
    });

    this.defaultAppearance.set(schema.defaultAppearance);
    this.defaultImage.set(schema.defaultImage);

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
    this.expansionPanels.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
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

  /** Flush any pending autosave when the editor is torn down (tab closed). */
  ngOnDestroy(): void {
    this.flushAutosave();
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
    if (this.basicForm().invalid()) {
      this.basicForm().markAsTouched();
      return;
    }

    const validationError = this.validateSchema();
    if (validationError) {
      this.validationError.set(validationError);
      return;
    }

    this.validationError.set(null);

    const updatedSchema = this.buildUpdatedSchema();

    this.isSaving.set(true);
    try {
      this.done.emit(updatedSchema);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Assemble the current editor state into a full schema for saving. */
  private buildUpdatedSchema(): ElementTypeSchema {
    const formValue = this.model();
    return {
      ...this.schema(),
      name: formValue.name,
      icon: formValue.icon,
      description: formValue.description,
      tabs: this.tabs(),
      defaultAppearance: this.defaultAppearance(),
      defaultImage: this.defaultImage(),
      version: this.schema().version + 1,
    };
  }

  /** Cancel editing (flushes any pending autosave, then closes). */
  cancel(): void {
    this.flushAutosave();
    this.done.emit(null);
  }

  /**
   * Apply a schema-edit event from the interactive preview to the local schema
   * state. The worldbuilding editor emits key-based intents; we resolve them to
   * the tab/field indices and reuse the existing CRUD helpers.
   */
  protected onSchemaEdit(event: SchemaEditEvent): void {
    const tabs = this.tabs();
    switch (event.type) {
      case 'add-tab':
        this.addTab();
        break;
      case 'remove-tab':
        this.removeTabByKey(tabs, event.tabKey);
        break;
      case 'update-tab':
        this.updateTabByKey(tabs, event.tabKey, event.patch);
        break;
      case 'add-field':
        this.addFieldToTab(tabs, event.tabKey);
        break;
      case 'remove-field':
        this.operateField(tabs, event.tabKey, event.fieldKey, (t, f) =>
          this.removeField(t, f)
        );
        break;
      case 'update-field':
        this.operateField(tabs, event.tabKey, event.fieldKey, (t, f) =>
          this.updateField(
            t,
            f,
            (event as { patch: Partial<FieldSchema> }).patch
          )
        );
        break;
      case 'move-field':
        this.moveField(tabs, event.tabKey, event.fieldKey, event.delta);
        break;
    }

    this.scheduleAutosave();
  }

  /** Remove a tab by key, if present. */
  private removeTabByKey(tabs: TabSchema[], tabKey: string): void {
    const idx = tabs.findIndex(t => t.key === tabKey);
    if (idx >= 0) this.removeTab(idx);
  }

  /** Update a tab's properties by key, if present. */
  private updateTabByKey(
    tabs: TabSchema[],
    tabKey: string,
    patch: Partial<TabSchema>
  ): void {
    const idx = tabs.findIndex(t => t.key === tabKey);
    if (idx >= 0) this.updateTab(idx, patch);
  }

  /** Add a field to a tab by key, if present. */
  private addFieldToTab(tabs: TabSchema[], tabKey: string): void {
    const idx = tabs.findIndex(t => t.key === tabKey);
    if (idx >= 0) this.addField(idx);
  }

  /** Resolve a tab+field pair by key and run an operation, if both exist. */
  private operateField(
    tabs: TabSchema[],
    tabKey: string,
    fieldKey: string,
    op: (tabIndex: number, fieldIndex: number) => void
  ): void {
    const tabIdx = tabs.findIndex(t => t.key === tabKey);
    if (tabIdx < 0) return;
    const fieldIdx = tabs[tabIdx].fields.findIndex(f => f.key === fieldKey);
    if (fieldIdx >= 0) op(tabIdx, fieldIdx);
  }

  /** Move a field up/down within its tab by one place, if in range. */
  private moveField(
    tabs: TabSchema[],
    tabKey: string,
    fieldKey: string,
    delta: -1 | 1
  ): void {
    const tabIdx = tabs.findIndex(t => t.key === tabKey);
    if (tabIdx < 0) return;
    const fields = tabs[tabIdx].fields;
    const fieldIdx = fields.findIndex(f => f.key === fieldKey);
    if (fieldIdx < 0) return;
    const target = fieldIdx + delta;
    if (target < 0 || target >= fields.length) return;
    this.mutateTabs(next => {
      const arr = next[tabIdx].fields;
      const [moved] = arr.splice(fieldIdx, 1);
      arr.splice(target, 0, moved);
    });
  }

  /**
   * Apply a schema metadata change (name/icon/description) from the editor's
   * Schema Details section, then live-save.
   */
  protected onSchemaInfoChange(patch: {
    name?: string;
    icon?: string;
    description?: string;
  }): void {
    this.model.update(m => ({
      name: patch.name ?? m.name,
      icon: patch.icon ?? m.icon,
      description: patch.description ?? m.description,
    }));
    this.scheduleAutosave();
  }

  /** Apply a default-appearance change from the editor's Styling section. */
  protected onDefaultAppearanceChange(appearance: ElementAppearance): void {
    this.defaultAppearance.set(appearance);
    this.scheduleAutosave();
  }

  private mutateTabs(fn: (tabs: TabSchema[]) => void): void {
    const updatedTabs = [...this.tabs()];
    fn(updatedTabs);
    this.tabs.set(updatedTabs);
    this.scheduleAutosave();
  }

  private createUniqueKey(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  private validateSchema(): string | null {
    const tabKeys = new Set<string>();
    const fieldKeys = new Set<string>();
    const flatKeys = new Set<string>();
    const groupKeys = new Set<string>();

    for (const tab of this.tabs()) {
      const tabError = this.validateTab(tab, tabKeys);
      if (tabError) return tabError;

      for (const field of tab.fields) {
        const fieldError = this.validateField(
          field,
          fieldKeys,
          flatKeys,
          groupKeys
        );
        if (fieldError) return fieldError;
      }
    }

    return this.findGroupCollision(flatKeys, groupKeys);
  }

  /** Validate a tab's label/key and uniqueness. */
  private validateTab(tab: TabSchema, tabKeys: Set<string>): string | null {
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

    return null;
  }

  /** Validate a field's key uniqueness and track flat/group keys. */
  private validateField(
    field: FieldSchema,
    fieldKeys: Set<string>,
    flatKeys: Set<string>,
    groupKeys: Set<string>
  ): string | null {
    const normalizedFieldKey = field.key.trim();
    if (!normalizedFieldKey) {
      return 'Each field needs a key.';
    }
    if (fieldKeys.has(normalizedFieldKey)) {
      return 'Field keys must be unique across the template.';
    }
    fieldKeys.add(normalizedFieldKey);

    if (normalizedFieldKey.includes('.')) {
      groupKeys.add(normalizedFieldKey.split('.')[0]);
    } else {
      flatKeys.add(normalizedFieldKey);
    }

    return null;
  }

  /** A flat field and a nested group must not share a key — the form can't
   * hold both (a FormControl and a FormGroup under the same name). */
  private findGroupCollision(
    flatKeys: Set<string>,
    groupKeys: Set<string>
  ): string | null {
    for (const flatKey of flatKeys) {
      if (groupKeys.has(flatKey)) {
        return `Field key "${flatKey}" conflicts with a nested field group of the same name.`;
      }
    }
    return null;
  }
}
