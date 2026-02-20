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
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs';

import { Element as ApiElement, ElementType } from '../../../api-client';
import {
  SnapshotsDialogComponent,
  SnapshotsDialogData,
} from '../../dialogs/snapshots-dialog/snapshots-dialog.component';
import {
  TagEditorDialogComponent,
  TagEditorDialogData,
} from '../../dialogs/tag-editor-dialog/tag-editor-dialog.component';
import { ElementSyncProviderFactory } from '../../services/sync/element-sync-provider.factory';
import { TagService } from '../../services/tag/tag.service';
import { ResolvedTag } from '../tags/tag.model';
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
  protected readonly projectState = inject(ProjectStateService);
  private dialogGateway = inject(DialogGatewayService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private tagService = inject(TagService);
  private syncProviderFactory = inject(ElementSyncProviderFactory);

  // Schema and form
  schema = signal<ElementTypeSchema | null>(null);
  form = new FormGroup({});

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
    this.dialog.open(TagEditorDialogComponent, {
      data,
      width: '450px',
      autoFocus: false,
    });
  }

  /** Reference to the identity panel for accessing its resolved image URL */
  identityPanel = viewChild(IdentityPanelComponent);

  /** Reference to the meta panel for controlling expanded state on mobile */
  metaPanel = viewChild(MetaPanelComponent);

  /** Currently selected tab index for the aria tabs */
  selectedTabIndex = signal(0);

  /** Whether the viewport is mobile-sized (< 760px) */
  isMobile = signal(false);

  /** Current drill-in section on mobile (null = overview) */
  mobileDrillInSection = signal<string | null>(null);

  private unsubscribeObserver: (() => void) | null = null;
  private resizeCleanup: (() => void) | null = null;
  private formSubscription: (() => void) | null = null;
  private isUpdatingFromRemote = false;
  private popstateHandler: ((event: PopStateEvent) => void) | null = null;

  constructor() {
    // Mobile detection via resize listener
    if (typeof window !== 'undefined') {
      const updateMobile = () => {
        const nowMobile = window.innerWidth < 760;
        if (this.isMobile() !== nowMobile) {
          this.isMobile.set(nowMobile);
          if (!nowMobile) {
            this.mobileDrillInSection.set(null);
          }
        }
      };
      updateMobile();
      window.addEventListener('resize', updateMobile);
      this.resizeCleanup = () =>
        window.removeEventListener('resize', updateMobile);
    }

    // Reset drill-in when navigating to a different element
    effect(() => {
      this.elementId();
      this.mobileDrillInSection.set(null);
    });

    effect(() => {
      const id = this.elementId();
      const username = this.username();
      const slug = this.slug();

      // Only load when all required values are available
      if (id && username && slug) {
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
      if (this.form) {
        if (canWrite) {
          this.form.enable({ emitEvent: false });
        } else {
          this.form.disable({ emitEvent: false });
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
    this.removePopstateListener();
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
        // Only allow initialization for users with write access
        // Viewers should never initialize elements - just display what exists
        if (this.projectState.canWrite()) {
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

      // Apply read-only state AFTER loading data to ensure values display correctly
      if (!this.projectState.canWrite()) {
        this.form.disable({ emitEvent: false });
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
    // Note: Read-only state is applied AFTER data loading in loadElementData()
    // to avoid issues with disabled forms not displaying values correctly
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

  /** Navigate into a section on mobile */
  drillInto(section: string): void {
    this.mobileDrillInSection.set(section);
    const tabs = this.getTabs();
    const tabIndex = tabs.findIndex(t => t.key === section);
    if (tabIndex >= 0) {
      this.selectedTabIndex.set(tabIndex);
    }
    // Auto-expand meta panel when drilling into relationships on mobile
    if (section === 'relationships') {
      this.metaPanel()?.isExpanded.set(true);
    }
    // Push history state so device back button drills back instead of navigating away
    this.pushDrillInHistoryState(section);
  }

  /** Navigate back to overview on mobile (called by in-app back button) */
  drillBack(): void {
    if (!this.mobileDrillInSection()) return;
    // Collapse meta panel when leaving relationships on mobile
    if (this.mobileDrillInSection() === 'relationships') {
      this.metaPanel()?.isExpanded.set(false);
    }
    this.mobileDrillInSection.set(null);
    // Pop the history entry we pushed (if it wasn't already popped by popstate)
    if (this.popstateHandler) {
      this.removePopstateListener();
      if (typeof history !== 'undefined') {
        history.back();
      }
    }
  }

  /**
   * Push a history entry when drilling into a section so the device
   * back button returns to the overview instead of leaving the page.
   */
  private pushDrillInHistoryState(section: string): void {
    if (typeof history === 'undefined' || typeof window === 'undefined') return;
    this.removePopstateListener();
    history.pushState({ wbDrillIn: section }, '');
    this.popstateHandler = (_event: PopStateEvent) => {
      // Popstate fired = browser already popped the entry.
      // Remove listener first so drillBack doesn't call history.back() again.
      this.removePopstateListener();
      // Collapse meta panel when leaving relationships on mobile
      if (this.mobileDrillInSection() === 'relationships') {
        this.metaPanel()?.isExpanded.set(false);
      }
      this.mobileDrillInSection.set(null);
    };
    window.addEventListener('popstate', this.popstateHandler);
  }

  /** Remove the popstate listener if active */
  private removePopstateListener(): void {
    if (this.popstateHandler && typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.popstateHandler);
      this.popstateHandler = null;
    }
  }

  /** Get the display label for the currently drilled-in section */
  getActiveSectionLabel(): string {
    const section = this.mobileDrillInSection();
    if (!section) return '';
    if (section === 'identity') return 'Identity & Details';
    if (section === 'relationships') return 'Relationships';
    const tab = this.getTabs().find(t => t.key === section);
    return tab?.label || section;
  }

  /** Whether the current drill-in section is a schema tab */
  isDrilledIntoTab(): boolean {
    const section = this.mobileDrillInSection();
    return !!section && section !== 'identity' && section !== 'relationships';
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
    const control = this.form.get(field.key);
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
    if (typeof value === 'number') {
      return true;
    }
    return !!value;
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

  /**
   * Open the snapshots dialog for this worldbuilding element
   */
  openSnapshotsDialog(): void {
    const data: SnapshotsDialogData = {
      documentId: this.elementId(),
    };

    this.dialog.open(SnapshotsDialogComponent, {
      data,
      width: '550px',
      autoFocus: false,
    });
  }
}
