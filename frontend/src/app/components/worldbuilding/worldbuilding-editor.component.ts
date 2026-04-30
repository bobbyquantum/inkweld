import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  type OnDestroy,
  signal,
  untracked,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type ResolvedTag } from '@models/tag.model';
import { debounceTime } from 'rxjs';

import {
  type Element as ApiElement,
  type ElementType,
} from '../../../api-client';
import { type SnapshotsDialogData } from '../../dialogs/snapshots-dialog/snapshots-dialog.component';
import { type TagEditorDialogData } from '../../dialogs/tag-editor-dialog/tag-editor-dialog.component';
import {
  type ElementTypeSchema,
  type FieldSchema,
  type TabSchema,
} from '../../models/schema-types';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { ElementSyncProviderFactory } from '../../services/sync/element-sync-provider.factory';
import { TagService } from '../../services/tag/tag.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { MetaPanelComponent } from '../meta-panel/meta-panel.component';
import { IdentityPanelComponent } from './identity-panel/identity-panel.component';
import { MediaPanelComponent } from './media-panel/media-panel.component';

/**
 * Main worldbuilding editor component that renders the dynamic
 * editor logic that used to be in a separate dynamic component.
 */
@Component({
  selector: 'app-worldbuilding-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatListModule,
    MatTooltipModule,
    MetaPanelComponent,
    IdentityPanelComponent,
    MediaPanelComponent,
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

  private readonly worldbuildingService = inject(WorldbuildingService);
  protected readonly projectState = inject(ProjectStateService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly tagService = inject(TagService);
  private readonly syncProviderFactory = inject(ElementSyncProviderFactory);

  // Schema and form
  schema = signal<ElementTypeSchema | null>(null);
  form: WritableSignal<FormGroup> = signal(new FormGroup({}));

  /** Computed element name from project state */
  elementName = computed(() => {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === this.elementId());
    return element?.name || 'Untitled';
  });

  /** Sync state from the project elements provider */
  readonly syncState = toSignal(
    this.syncProviderFactory.getProvider().syncState$,
    { initialValue: this.syncProviderFactory.getProvider().getSyncState() }
  );

  /** Resolved tags for this element (raw elementId used for worldbuilding) */
  readonly elementTags = computed((): ResolvedTag[] =>
    this.tagService.getResolvedTagsForElement(this.elementId())
  );

  /** Open the tag editor dialog */
  openTagsDialog(): void {
    const data: TagEditorDialogData = {
      elementId: this.elementId(),
      elementName: this.elementName(),
    };
    this.dialogGateway.openTagEditorDialog(data);
  }

  /** Reference to the identity panel for accessing its resolved image URL */
  identityPanel = viewChild(IdentityPanelComponent);

  /** Reference to the meta panel for controlling expanded state on mobile */
  metaPanel = viewChild(MetaPanelComponent);

  /** Currently selected section in the sidenav/accordion */
  selectedSection = signal<string>('identity');

  /** Whether to use sidenav layout (true) or accordion layout (false) */
  useSidenav = signal(true);

  /** Whether the initial schema/data load is still in progress */
  isInitialLoading = signal(true);

  private unsubscribeObserver: (() => void) | null = null;
  private readonly resizeCleanup: (() => void) | null = null;
  private formSubscription: (() => void) | null = null;
  private isUpdatingFromRemote = false;
  private loadSequence = 0;

  constructor() {
    // Layout detection: sidenav for large desktop + tablet landscape, accordion otherwise
    const browserWindow = globalThis.window;
    if (browserWindow) {
      const updateLayout = () => {
        const width = browserWindow.innerWidth;
        const shouldUseSidenav = width >= 760;
        this.useSidenav.set(shouldUseSidenav);
      };
      updateLayout();
      browserWindow.addEventListener('resize', updateLayout);
      this.resizeCleanup = () =>
        browserWindow.removeEventListener('resize', updateLayout);
    }

    // Keep meta panel expanded when visible in the new layout
    effect(() => {
      const panel = this.metaPanel();
      if (panel) {
        panel.isExpanded.set(true);
      }
    });

    effect(() => {
      const id = this.elementId();
      const username = this.username();
      const slug = this.slug();

      // Only load when all required values are available
      if (id && username && slug) {
        this.selectedSection.set('identity');

        // Load data first, then setup realtime sync
        // This ensures the form is built before the observer can fire
        void this.loadElementData(id).then(() => {
          void this.setupRealtimeSync(id);
        });
      }
    });

    // React to access changes and disable/enable form accordingly
    effect(() => {
      const canWrite = this.projectState.canWrite();
      const form = untracked(() => this.form());
      if (form) {
        if (canWrite) {
          form.enable({ emitEvent: false });
        } else {
          form.disable({ emitEvent: false });
        }
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
    if (this.resizeCleanup) {
      this.resizeCleanup();
    }
  }

  private async loadElementData(elementId: string): Promise<void> {
    const currentLoad = ++this.loadSequence;
    this.isInitialLoading.set(true);
    this.schema.set(null);
    this.form.set(new FormGroup({}));

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
      if (currentLoad !== this.loadSequence) return;
      let schemaToUse = loadedSchema;
      if (!schemaToUse && username && slug) {
        schemaToUse = await this.initializeIfNeeded(elementId, username, slug);
        if (currentLoad !== this.loadSequence) return;
      }

      this.schema.set(schemaToUse);
      if (schemaToUse) {
        this.buildFormFromSchema(schemaToUse);
      }

      const data = await this.worldbuildingService.getWorldbuildingData(
        elementId,
        username,
        slug
      );
      if (currentLoad !== this.loadSequence) return;
      if (data) {
        this.updateFormFromData(data);
      }

      // Apply read-only state AFTER loading data to ensure values display correctly
      if (!this.projectState.canWrite()) {
        this.form().disable({ emitEvent: false });
      }
    } catch (error) {
      console.error('[WorldbuildingEditor] Error loading element data:', error);
    } finally {
      if (currentLoad === this.loadSequence) {
        this.isInitialLoading.set(false);
      }
    }
  }

  /**
   * Initialize a worldbuilding element if possible (write access required).
   * Returns the schema after initialization, or null if not applicable.
   */
  private async initializeIfNeeded(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementTypeSchema | null> {
    if (!this.projectState.canWrite()) return null;

    const element: ApiElement | undefined = this.projectState
      .elements()
      .find((el: ApiElement) => el.id === elementId);
    if (!element) return null;

    await this.worldbuildingService.initializeWorldbuildingElement(
      element,
      username,
      slug
    );

    return this.worldbuildingService.getSchemaForElement(
      elementId,
      username,
      slug
    );
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
        const control = this.createControlForField(field);
        if (!control) {
          return;
        }

        const groupName = this.getFieldGroupName(field);
        if (groupName) {
          if (!formGroup[groupName]) {
            formGroup[groupName] = new FormGroup({});
          }
          const parentGroup = formGroup[groupName] as FormGroup;
          parentGroup.addControl(this.getFieldControlName(field), control);
        } else {
          formGroup[field.key] = control;
        }
      });
    });

    this.form.set(new FormGroup(formGroup));
    this.setupFormSubscription();
    // Note: Read-only state is applied AFTER data loading in loadElementData()
    // to avoid issues with disabled forms not displaying values correctly
  }

  private createControlForField(field: FieldSchema): AbstractControl | null {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'number':
      case 'date':
      case 'select':
        return new FormControl('');
      case 'multiselect':
        return new FormControl<string[]>([]);
      case 'array':
        return new FormArray([]);
      case 'checkbox':
        return new FormControl(false);
      default:
        console.warn(
          `[WorldbuildingEditor] Unsupported field type "${field.type}" for "${field.key}"`
        );
        return null;
    }
  }

  private setupFormSubscription(): void {
    if (this.formSubscription) {
      this.formSubscription();
    }
    const subscription = this.form()
      .valueChanges.pipe(debounceTime(500))
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

    const form = this.form();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.entries(data).forEach(([key, value]) => {
      const control = form.get(key);
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
  }

  private async setupRealtimeSync(elementId: string): Promise<void> {
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }
    this.unsubscribeObserver = await this.worldbuildingService.observeChanges(
      elementId,
      data => {
        void (async () => {
          this.isUpdatingFromRemote = true;

          // If we don't have a schema yet, try to get it from the synced data
          // This handles the case where WebSocket sync completes after initial load
          if (!this.schema() && data['schemaId']) {
            const username = this.username();
            const slug = this.slug();
            if (username && slug) {
              const syncedSchema =
                await this.worldbuildingService.getSchemaForElement(
                  elementId,
                  username,
                  slug
                );
              if (syncedSchema) {
                this.schema.set(syncedSchema);
                this.buildFormFromSchema(syncedSchema);
              }
            }
          }

          this.updateFormFromData(data);
          this.isUpdatingFromRemote = false;
        })();
      },
      this.username(),
      this.slug()
    );
  }

  private async saveData(): Promise<void> {
    const formValue = this.form().value as Record<string, unknown>;
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

  /** Select a section in the sidenav/accordion */
  selectSection(section: string): void {
    this.selectedSection.set(section);
  }

  /** Whether the currently selected section is a schema tab */
  isTabSection(): boolean {
    const section = this.selectedSection();
    return (
      !!section &&
      section !== 'identity' &&
      section !== 'relationships' &&
      section !== 'media'
    );
  }

  /** Get the display label for a section */
  getSectionLabel(section: string): string {
    if (section === 'identity') return 'Identity & Details';
    if (section === 'relationships') return 'Relationships';
    const tab = this.getTabs().find(t => t.key === section);
    return tab?.label || section;
  }

  /** Get icon for a tab schema */
  getTabIcon(tab: TabSchema): string {
    return tab.icon || 'article';
  }

  getFieldsForTab(tabKey: string): FieldSchema[] {
    const tab = this.getTabs().find(t => t.key === tabKey);
    return tab?.fields || [];
  }

  /** Count how many fields in a tab have been filled in by the user */
  getFilledFieldCountForTab(tabKey: string): number {
    const fields = this.getFieldsForTab(tabKey);
    let filled = 0;
    for (const field of fields) {
      if (this.isFieldFilled(field)) {
        filled++;
      }
    }
    return filled;
  }

  /** Check whether a single field has a non-empty value */
  private isFieldFilled(field: FieldSchema): boolean {
    const control = this.form().get(field.key);
    if (!control) return false;
    if (control instanceof FormArray) {
      return control.length > 0;
    }
    const value: unknown = control.value;
    if (value == null) return false;
    if (typeof value === 'boolean') {
      return value === true;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'number') {
      return true;
    }
    return !!value;
  }

  getFieldOptions(
    field: FieldSchema
  ): Array<string | { value: string; label: string }> {
    return field.options ?? [];
  }

  getFieldGroupName(field: FieldSchema): string | null {
    if (!field.key.includes('.')) {
      return null;
    }

    return field.key.split('.')[0] ?? null;
  }

  getFieldControlName(field: FieldSchema): string {
    return field.key.includes('.')
      ? (field.key.split('.')[1] ?? field.key)
      : field.key;
  }

  getOptionValue(option: string | { value: string; label: string }): string {
    return typeof option === 'string' ? option : option.value;
  }

  getOptionLabel(option: string | { value: string; label: string }): string {
    return typeof option === 'string' ? option : option.label;
  }

  getControl(fieldKey: string): FormControl {
    return this.form().get(fieldKey) as FormControl;
  }

  getFormArray(fieldKey: string): FormArray {
    return this.form().get(fieldKey) as FormArray;
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
      this.projectState.renameNode(element, newName);
    }
  }

  /**
   * Open the snapshots dialog for this worldbuilding element
   */
  openSnapshotsDialog(): void {
    const data: SnapshotsDialogData = {
      documentId: this.elementId(),
    };

    this.dialogGateway.openSnapshotsDialog(data);
  }
}
