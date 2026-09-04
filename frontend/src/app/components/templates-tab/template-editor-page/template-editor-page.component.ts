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
import { WorldbuildingEditorComponent } from '@components/worldbuilding/worldbuilding-editor.component';
import { ElementType } from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { type ElementAppearance } from '@models/element-appearance';
import {
  type ElementTypeSchema,
  type FieldSchema,
  type TabSchema,
} from '@models/schema-types';
import { RelationshipFieldService } from '@services/relationship/relationship-field.service';
import {
  type SchemaEditEvent,
  SchemaEditService,
} from '@services/worldbuilding/schema-edit.service';

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
  private readonly relationshipFieldService = inject(RelationshipFieldService);
  private readonly schemaEditService = inject(SchemaEditService);

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

    // Legacy/imported relationship fields may lack a backing-type id. Stamp
    // a deterministic one (stable across sessions even before the save lands)
    // so ensureRelationshipTypes below can register the matching type.
    let stampedTypeIds = false;
    tabs.forEach(tab => {
      tab.fields.forEach(field => {
        if (
          this.relationshipFieldService.isRelationshipField(field) &&
          !field.relationshipTypeId
        ) {
          field.relationshipTypeId =
            this.relationshipFieldService.stableRelationshipTypeId(
              schema.id,
              field
            );
          stampedTypeIds = true;
        }
      });
    });

    this.tabs.set(tabs);

    // Self-heal: make sure every existing relationship field has a backing
    // relationship type registered (idempotent).
    this.ensureRelationshipTypes(tabs);

    if (stampedTypeIds) {
      // Persist the stamped ids immediately so field and type stay aligned.
      this.scheduleAutosave();
    }
  }

  /** Ensure backing relationship types exist for all relationship fields. */
  private ensureRelationshipTypes(tabs: TabSchema[]): void {
    const schemaId = this.schema().id;
    tabs.forEach(tab => {
      tab.fields.forEach(field => {
        if (this.relationshipFieldService.isRelationshipField(field)) {
          this.relationshipFieldService.ensureTypeForField(schemaId, field);
        }
      });
    });
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
    const newTab = this.schemaEditService.createTab(this.tabs());
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
    const newField = this.schemaEditService.createField();
    this.mutateTabs(tabs => {
      tabs[tabIndex].fields.push(newField);
    });
    this._lastFieldId = newField.id ?? null;
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
      // Once assembled for a save, the template is no longer "new".
      isNew: false,
    };
  }

  /** Cancel editing (flushes any pending autosave, then closes). */
  cancel(): void {
    this.flushAutosave();
    this.done.emit(null);
  }

  /**
   * Apply a schema-edit event from the interactive preview to the local schema
   * state via the shared {@link SchemaEditService} reducer, then live-save.
   */
  protected onSchemaEdit(event: SchemaEditEvent): void {
    const result = this.schemaEditService.applyEdit(
      this.previewSchema(),
      event
    );
    this.tabs.set(result.schema.tabs);

    if (event.type === 'add-tab') {
      this.selectedTabIndex.set(this.tabs().length - 1);
    } else if (
      event.type === 'remove-tab' &&
      this.selectedTabIndex() >= this.tabs().length
    ) {
      this.selectedTabIndex.set(Math.max(0, this.tabs().length - 1));
    }
    if (result.addedFieldId) {
      this._lastFieldId = result.addedFieldId;
    }

    // Schema structure edits are discrete commits — persist them immediately
    // rather than debouncing, so closing the tab can never lose the last edit
    // to the debounce timer. Only emit if the resulting schema is valid; an
    // invalid schema (e.g. duplicate field keys, flat/nested key collisions)
    // must not reach the live-save consumer, which would persist a broken
    // template. The error is surfaced in the editor so the user can correct it.
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (result.error) {
      this.validationError.set(result.error);
      return;
    }
    this.validationError.set(null);
    this.schemaChange.emit(this.buildUpdatedSchema());
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
    return this.schemaEditService.createUniqueKey(prefix);
  }

  private validateSchema(): string | null {
    return this.schemaEditService.validateTabs(this.tabs());
  }
}
