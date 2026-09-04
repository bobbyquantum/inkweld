import { DragDropModule } from '@angular/cdk/drag-drop';
import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  type OnDestroy,
  output,
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
import { compatForm } from '@angular/forms/signals/compat';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ElementRefTooltipComponent,
  type ElementRefTooltipData,
} from '@components/element-ref';
import { ElementRefService } from '@components/element-ref/element-ref.service';
import { MetaPanelComponent } from '@components/meta-panel/meta-panel.component';
import { RelationshipFieldComponent } from '@components/relationship-field/relationship-field.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DocumentSyncState } from '@models/document-sync-state';
import { type ElementAppearance } from '@models/element-appearance';
import { type ResolvedTag } from '@models/tag.model';
import { RelationshipFieldService } from '@services/relationship/relationship-field.service';
import { AppearanceService } from '@services/worldbuilding/appearance.service';
import {
  type SchemaEditEvent,
  SchemaEditService,
} from '@services/worldbuilding/schema-edit.service';
import { summariseLocalAdditions } from '@services/worldbuilding/schema-merge';
import { schemaContentHash } from '@utils/schema-hash';

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
import {
  type ElementSchemaState,
  WorldbuildingService,
} from '../../services/worldbuilding/worldbuilding.service';
import { AppearanceEditorComponent } from './appearance-panel/appearance-editor/appearance-editor.component';
import { AppearancePanelComponent } from './appearance-panel/appearance-panel.component';
import { IdentityPanelComponent } from './identity-panel/identity-panel.component';
import { MediaPanelComponent } from './media-panel/media-panel.component';

/** Re-exported so existing importers of the editor keep working. */
export type { SchemaEditEvent };

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
    TextFieldModule,
    DragDropModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatListModule,
    MatMenuModule,
    MatTooltipModule,
    MetaPanelComponent,
    IdentityPanelComponent,
    MediaPanelComponent,
    AppearancePanelComponent,
    AppearanceEditorComponent,
    RelationshipFieldComponent,
    ElementRefTooltipComponent,
    TranslocoModule,
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

  /**
   * When set, the editor renders in preview mode using this schema directly
   * (e.g. from the template designer's Preview tab) instead of loading a real
   * element. No data is loaded, synced, or saved; the form is read-only.
   */
  previewSchema = input<ElementTypeSchema | null>(null);

  /**
   * When true, the preview renders interactive schema-editing affordances
   * (add/remove/reorder fields and tabs) and emits {@link SchemaEditEvent}s via
   * `schemaEdit` for the owning template editor to apply. Ignored outside
   * preview mode; the live element editor is unaffected.
   */
  editMode = input(false);

  /** Emits schema-editing intents when `editMode` is active. */
  readonly schemaEdit = output<SchemaEditEvent>();

  /** Emits updated schema metadata (name/icon/description) from the Schema Details section. */
  readonly schemaInfoChange = output<{
    name?: string;
    icon?: string;
    description?: string;
  }>();

  /** Emits the schema's default appearance when edited from the Styling section. */
  readonly defaultAppearanceChange = output<ElementAppearance>();

  /** True when rendering a transient schema preview (no element persistence). */
  readonly previewMode = computed(() => this.previewSchema() !== null);

  private readonly worldbuildingService = inject(WorldbuildingService);
  protected readonly projectState = inject(ProjectStateService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly tagService = inject(TagService);
  private readonly syncProviderFactory = inject(ElementSyncProviderFactory);
  private readonly transloco = inject(TranslocoService);
  private readonly appearanceService = inject(AppearanceService);
  private readonly elementRefService = inject(ElementRefService);
  private readonly relationshipFieldService = inject(RelationshipFieldService);
  private readonly schemaEditService = inject(SchemaEditService);

  /**
   * True while the user is editing this element's own schema copy in place.
   * Distinct from `editMode`, which only applies to template previews.
   */
  readonly elementSchemaEditing = signal(false);

  /** Validation error from the last rejected element-schema edit, if any. */
  readonly schemaEditError = signal<string | null>(null);

  /** How this element's schema copy relates to the shared project schema. */
  readonly schemaState = signal<ElementSchemaState | null>(null);

  /** Whether the element's schema copy differs from the shared schema. */
  readonly isCustomSchema = computed(
    () => this.schemaState()?.isCustom ?? false
  );

  /** Whether the shared schema has changed since this element last synced. */
  readonly sharedSchemaUpdated = computed(
    () => this.schemaState()?.sharedUpdated ?? false
  );

  /** Whether the shared schema this element came from still exists. */
  readonly sharedSchemaMissing = computed(() => {
    const state = this.schemaState();
    return !!state && state.sharedSchema === null;
  });

  private unsubscribeSchemaObserver: (() => void) | null = null;

  /** Tooltip data mirrored from the element-ref service (hover previews). */
  readonly tooltipData = signal<ElementRefTooltipData | null>(null);

  // Schema and form
  schema = signal<ElementTypeSchema | null>(null);

  /**
   * Signal holding the underlying reactive `FormGroup`. The structure is
   * built dynamically at runtime from the resolved `ElementTypeSchema` —
   * field keys and types are not known at compile time, so we keep the
   * reactive-forms `FormGroup` as the source of truth and expose it to
   * signal-forms via {@link formTree} (a `compatForm` tree).
   *
   * Exposed as a public readonly field so legacy callers (and tests) that
   * treat `form()` as a `FormGroup` accessor keep working: invoking the
   * signal returns the current `FormGroup` instance.
   */
  readonly form: WritableSignal<FormGroup> = signal(new FormGroup({}));

  /**
   * Signal-forms compatibility view over {@link form}.
   *
   * This exposes signal-based state (validity, errors, touched/dirty) for
   * the dynamically-built reactive form, integrating it with the Angular 22
   * signal-forms APIs while preserving the runtime-driven `FormGroup`
   * structure. The template still binds `[formControl]` to the underlying
   * `FormControl` instances returned by {@link getControl}; `compatForm`
   * wires their state into the signal-forms reactivity graph.
   */
  readonly formTree = compatForm(this.form);

  /** Computed element name from project state */
  elementName = computed(() => {
    if (this.previewMode()) {
      return this.previewSchema()?.name || 'Untitled';
    }
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === this.elementId());
    return element?.name || 'Untitled';
  });

  /** Material icon for the element, derived from its schema. */
  elementIcon = computed(() => {
    const schema = this.schema();
    return schema?.icon || 'category';
  });

  /** Sync state from the project elements provider */
  readonly syncState = toSignal(
    this.syncProviderFactory.getProvider().syncState$,
    { initialValue: this.syncProviderFactory.getProvider().getSyncState() }
  );

  /** Sync status tooltip text derived from the current sync state */
  readonly syncTooltip = computed(() => {
    // Track active language so the tooltip recomputes on language change.
    void this.transloco.activeLang();
    switch (this.syncState()) {
      case DocumentSyncState.Synced:
        return this.transloco.translate('worldbuilding.editor.syncSynced');
      case DocumentSyncState.Syncing:
        return this.transloco.translate('worldbuilding.editor.syncSyncing');
      case DocumentSyncState.Local:
        return this.transloco.translate('worldbuilding.editor.syncLocal');
      default:
        return this.transloco.translate('worldbuilding.editor.syncUnavailable');
    }
  });

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

  /** Reference to the appearance panel (Styling tab) for live preview sync. */
  appearancePanel = viewChild(AppearancePanelComponent);

  /**
   * In preview mode, seed the identity panel's appearance and image from the
   * schema's defaults so the preview shows the configured styling.
   */
  protected readonly seedPreviewAppearance = effect(() => {
    if (!this.previewMode()) return;
    const panel = this.identityPanel();
    const schema = this.previewSchema();
    if (panel && schema) {
      panel.appearance.set(schema.defaultAppearance);
      panel.identity.set({ image: schema.defaultImage });
    }
  });

  /**
   * Keep the identity panel's appearance in sync with the appearance panel so
   * the editor's backgrounds update live (e.g. while dragging the slider).
   */
  protected onAppearanceChange(appearance: ElementAppearance): void {
    this.identityPanel()?.appearance.set(appearance);
  }

  /**
   * Resolved menu background derived from the element's appearance config
   * and the active theme. `null` means no custom background.
   */
  readonly menuBackground = computed(() => {
    const appearance = this.identityPanel()?.appearance();
    return this.appearanceService.resolveRegion(appearance?.menu, 'menu');
  });

  /** Resolved content background (see {@link menuBackground}). */
  readonly contentBackground = computed(() => {
    const appearance = this.identityPanel()?.appearance();
    return this.appearanceService.resolveRegion(appearance?.content, 'content');
  });

  /**
   * Cache of resolved blob URLs for `media://` background image references,
   * keyed by the raw reference. Populated asynchronously by {@link resolveBgImage}.
   */
  private readonly resolvedImageUrls = signal<Record<string, string>>({});

  /**
   * Resolve any `media://` image references used by the current backgrounds so
   * they render as loadable blob URLs. Runs whenever the backgrounds change.
   */
  protected readonly resolveBackgroundImages = effect(() => {
    for (const bg of [this.menuBackground(), this.contentBackground()]) {
      const ref = this.extractImageRef(bg?.background);
      if (ref?.startsWith('media://') && !this.resolvedImageUrls()[ref]) {
        void this.resolveBgImage(ref);
      }
    }
  });

  private async resolveBgImage(ref: string): Promise<void> {
    const url = await this.appearanceService.resolveImageReference(
      ref,
      this.username(),
      this.slug()
    );
    if (url) {
      this.resolvedImageUrls.update(m => ({ ...m, [ref]: url }));
    }
  }

  private extractImageRef(background: string | undefined): string | null {
    if (!background) return null;
    const match = /url\('(.*)'\)/.exec(background);
    return match?.[1] ?? null;
  }

  /**
   * Build the CSS value to bind to `--wb-bg` for a resolved background,
   * substituting any cached blob URL for `media://` image references so the
   * browser can actually load the image.
   */
  protected backgroundCss(
    bg: ReturnType<AppearanceService['resolveRegion']>
  ): string | null {
    if (!bg) return null;
    if (bg.type !== 'image') return bg.background;
    const ref = this.extractImageRef(bg.background);
    const resolved = ref ? this.resolvedImageUrls()[ref] : undefined;
    return resolved ? `url('${resolved}')` : bg.background;
  }

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
  private isUpdatingFromRemote = false;
  private loadSequence = 0;
  private schemaEditorSectionInitialized = false;

  constructor() {
    // In the schema editor, land on Schema Details (the top tab) first.
    // Guarded by a flag so it only runs once and never overrides a later
    // selection the user makes.
    effect(() => {
      if (
        this.previewMode() &&
        this.editMode() &&
        !this.schemaEditorSectionInitialized
      ) {
        this.schemaEditorSectionInitialized = true;
        this.selectedSection.set('schema-details');
      }
    });

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

      // In preview mode, build the form from the transient schema and stop.
      if (this.previewMode()) {
        const schema = this.previewSchema();
        this.schema.set(schema);
        this.form.set(new FormGroup({}));
        if (schema) {
          this.buildFormFromSchema(schema);
          this.form().disable({ emitEvent: false });
        }
        this.isInitialLoading.set(false);
        return;
      }

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

    // Auto-save on form changes (debounced). The compatForm exposes the
    // reactive form's value as a signal, so we can react to edits without
    // a `valueChanges` subscription. A trailing debounce avoids saving on
    // every keystroke, matching the previous reactive-forms behaviour.
    effect(onCleanup => {
      // Track the form value signal via the compatForm tree.
      this.formTree().value();
      if (this.isUpdatingFromRemote || this.previewMode()) return;
      const timer = setTimeout(() => {
        untracked(() => void this.saveData());
      }, 500);
      onCleanup(() => clearTimeout(timer));
    });

    // Mirror hover-tooltip data from the element-ref service so relationship
    // field cards (and meta-panel rows) render their preview popover here.
    effect(() => {
      this.tooltipData.set(this.elementRefService.tooltipData());
    });

    // Re-evaluate schema drift whenever the shared schema library changes so
    // the "update available" flag appears live when a template is edited.
    effect(() => {
      this.worldbuildingService.schemas();
      if (this.previewMode()) return;
      // Only the library is tracked; the element's own schema signal changes
      // as part of refreshSchemaState and must not re-trigger this effect.
      untracked(() => {
        if (this.schema()) void this.refreshSchemaState();
      });
    });
  }

  ngOnDestroy(): void {
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }
    if (this.unsubscribeSchemaObserver) {
      this.unsubscribeSchemaObserver();
    }
    if (this.resizeCleanup) {
      this.resizeCleanup();
    }
    for (const url of Object.values(this.resolvedImageUrls())) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
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

      // Load the element's own schema copy (copied from the shared project
      // schema on first open if the element predates per-element schemas).
      this.elementSchemaEditing.set(false);
      this.schemaEditError.set(null);
      this.schemaState.set(null);
      const schemaToUse = await this.resolveElementSchema(
        elementId,
        username,
        slug
      );
      if (currentLoad !== this.loadSequence) return;

      this.schema.set(schemaToUse);
      if (schemaToUse) {
        this.buildFormFromSchema(schemaToUse);
        this.ensureRelationshipFieldTypes(schemaToUse);
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
   * Resolve the schema an element should render, populating `schemaState`.
   * Falls back to initialising the element (write access required) when it
   * has no schema yet.
   */
  private async resolveElementSchema(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementTypeSchema | null> {
    if (!username || !slug) return null;
    const state = await this.worldbuildingService.getElementSchemaState(
      elementId,
      username,
      slug
    );
    if (state) {
      this.schemaState.set(state);
      return state.schema;
    }
    const initialised = await this.initializeIfNeeded(
      elementId,
      username,
      slug
    );
    if (initialised) {
      this.schemaState.set(
        await this.worldbuildingService.getElementSchemaState(
          elementId,
          username,
          slug
        )
      );
    }
    return initialised;
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

    const formGroup: Record<string, AbstractControl> = {};

    schema.tabs.forEach((tab: TabSchema) => {
      tab.fields?.forEach((field: FieldSchema) => {
        const control = this.createControlForField(field);
        if (!control) {
          return;
        }

        const groupName = this.getFieldGroupName(field);
        if (groupName) {
          const existing = formGroup[groupName];
          if (existing instanceof FormGroup) {
            existing.addControl(this.getFieldControlName(field), control);
          } else if (!existing) {
            formGroup[groupName] = new FormGroup({
              [this.getFieldControlName(field)]: control,
            });
          } else {
            // A top-level field shares the group's key; the form can't hold
            // both. Keep the top-level control and skip the nested field.
            console.warn(
              `[WorldbuildingEditor] Skipping nested field "${field.key}": ` +
                `"${groupName}" is already a non-group field`
            );
          }
        } else if (formGroup[field.key] instanceof FormGroup) {
          // A nested group with this key already exists; skip the flat field.
          console.warn(
            `[WorldbuildingEditor] Skipping field "${field.key}": ` +
              `it conflicts with a nested field group`
          );
        } else {
          formGroup[field.key] = control;
        }
      });
    });

    this.form.set(new FormGroup(formGroup));
    // Note: Read-only state is applied AFTER data loading in loadElementData()
    // to avoid issues with disabled forms not displaying values correctly.
    // Auto-save is wired via the constructor effect that watches
    // `this.formTree().value()` (the compatForm's value signal).
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
      case 'relationship':
        // The canonical value lives in the relationships store; the control
        // only mirrors linked element ids for form completeness and is
        // excluded from persistence (see saveData).
        return new FormControl<string[]>([]);
      default:
        console.warn(
          `[WorldbuildingEditor] Unsupported field type "${field.type}" for "${field.key}"`
        );
        return null;
    }
  }

  /**
   * Self-heal: make sure every relationship field on the loaded schema has a
   * backing relationship type registered (idempotent).
   */
  private ensureRelationshipFieldTypes(schema: ElementTypeSchema): void {
    for (const tab of schema.tabs ?? []) {
      for (const field of tab.fields ?? []) {
        if (this.relationshipFieldService.isRelationshipField(field)) {
          this.relationshipFieldService.ensureTypeForField(schema.id, field);
        }
      }
    }
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
    if (this.unsubscribeSchemaObserver) {
      this.unsubscribeSchemaObserver();
    }
    this.unsubscribeSchemaObserver =
      await this.worldbuildingService.observeElementSchema(
        elementId,
        () => void this.refreshSchemaState(),
        this.username(),
        this.slug()
      );
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
                this.ensureRelationshipFieldTypes(syncedSchema);
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
    const relationshipKeys = this.getRelationshipFieldKeys();
    const persistable = this.stripRelationshipValues(
      formValue,
      '',
      relationshipKeys
    ) as Record<string, unknown>;
    await this.worldbuildingService.saveWorldbuildingData(
      this.elementId(),
      persistable,
      this.username(),
      this.slug()
    );
  }

  /** Keys of all relationship fields in the current schema (not persisted). */
  private getRelationshipFieldKeys(): Set<string> {
    const keys = new Set<string>();
    for (const tab of this.schema()?.tabs ?? []) {
      for (const field of tab.fields ?? []) {
        if (this.relationshipFieldService.isRelationshipField(field)) {
          keys.add(field.key);
        }
      }
    }
    return keys;
  }

  /**
   * Deep copy of the form value with every path matching a relationship
   * field's key removed — including dotted keys nested inside group objects,
   * which a top-level filter would miss. Non-relationship fields and the
   * surrounding object structure are preserved.
   */
  private stripRelationshipValues(
    value: unknown,
    path: string,
    keys: Set<string>
  ): unknown {
    if (keys.has(path)) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      const cleaned = this.stripRelationshipValues(child, childPath, keys);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    }
    return out;
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
      section !== 'media' &&
      section !== 'styling' &&
      section !== 'schema-details'
    );
  }

  /** Get the display label for a section */
  getSectionLabel(section: string): string {
    if (section === 'identity') return 'Identity & Details';
    if (section === 'relationships') return 'Relationships';
    if (section === 'styling') return 'Styling';
    if (section === 'schema-details') {
      return this.transloco.translate('templates.editor.schemaDetails');
    }
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

  // ---------------------------------------------------------------------------
  // Schema edit mode (preview only)
  // ---------------------------------------------------------------------------

  /**
   * Route a schema edit intent: in a template preview it goes to the owning
   * template editor; on a real element it is applied to the element's own
   * schema copy right here.
   */
  protected emitSchemaEdit(event: SchemaEditEvent): void {
    if (this.previewMode()) {
      if (!this.editMode()) return;
      this.schemaEdit.emit(event);
      return;
    }
    if (!this.elementSchemaEditing()) return;
    void this.applyElementSchemaEdit(event);
  }

  /** True when interactive schema editing affordances should render. */
  protected schemaEditingEnabled(): boolean {
    return (
      (this.editMode() && this.previewMode()) || this.elementSchemaEditing()
    );
  }

  /** True when editing the shared template (Schema Details, defaults, etc.). */
  protected templateEditingEnabled(): boolean {
    return this.editMode() && this.previewMode();
  }

  // ---------------------------------------------------------------------------
  // Per-element schema: edit / sync / revert
  // ---------------------------------------------------------------------------

  /** Whether the current user may change this element's schema copy. */
  protected canEditElementSchema(): boolean {
    return !this.previewMode() && this.projectState.canWrite();
  }

  /** Toggle in-place editing of this element's schema copy. */
  toggleElementSchemaEditing(): void {
    if (!this.canEditElementSchema()) return;
    const next = !this.elementSchemaEditing();
    this.elementSchemaEditing.set(next);
    if (!next) {
      this.schemaEditError.set(null);
    }
  }

  /** Apply one edit to the element's schema copy and persist it. */
  private async applyElementSchemaEdit(event: SchemaEditEvent): Promise<void> {
    const current = this.schema();
    if (!current) return;
    const result = this.schemaEditService.applyEdit(current, event, {
      removeRelationshipTypes: false,
    });
    if (result.error) {
      this.schemaEditError.set(result.error);
      return;
    }
    this.schemaEditError.set(null);
    await this.rebuildFormForSchema(result.schema);
    if (event.type === 'add-tab') {
      const added = result.schema.tabs.at(-1);
      if (added) this.selectSection(added.key);
    } else if (
      event.type === 'remove-tab' &&
      this.selectedSection() === event.tabKey
    ) {
      this.selectSection('identity');
    }
    const state = await this.worldbuildingService.saveElementSchema(
      this.elementId(),
      result.schema,
      this.username(),
      this.slug()
    );
    if (state) this.schemaState.set(state);
  }

  /**
   * Pull the current shared schema into this element's copy, keeping any
   * local-only tabs and fields. Asks for confirmation first.
   */
  async syncSchemaFromShared(): Promise<void> {
    const state = this.schemaState();
    if (!state?.sharedSchema || !this.canEditElementSchema()) return;

    const summary = summariseLocalAdditions(state.schema, state.sharedSchema);
    const kept = [...summary.localOnlyTabs, ...summary.localOnlyFields];
    const message = kept.length
      ? this.transloco.translate(
          'worldbuilding.schemaSource.syncConfirmWithLocal',
          { items: kept.join(', ') }
        )
      : this.transloco.translate('worldbuilding.schemaSource.syncConfirm');
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: this.transloco.translate('worldbuilding.schemaSource.syncTitle'),
      message,
      confirmText: this.transloco.translate(
        'worldbuilding.schemaSource.syncAction'
      ),
      cancelText: this.transloco.translate('cancel'),
    });
    if (!confirmed) return;

    const next = await this.worldbuildingService.syncElementSchema(
      this.elementId(),
      this.username(),
      this.slug()
    );
    if (next) {
      this.schemaState.set(next);
      await this.rebuildFormForSchema(next.schema);
    }
  }

  /** Drop this element's customised schema copy and follow the shared schema. */
  async revertSchemaToShared(): Promise<void> {
    const state = this.schemaState();
    if (!state?.isCustom || !this.canEditElementSchema()) return;
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: this.transloco.translate('worldbuilding.schemaSource.revertTitle'),
      message: this.transloco.translate(
        'worldbuilding.schemaSource.revertConfirm'
      ),
      confirmText: this.transloco.translate(
        'worldbuilding.schemaSource.revertAction'
      ),
      cancelText: this.transloco.translate('cancel'),
    });
    if (!confirmed) return;

    const next = await this.worldbuildingService.revertElementSchema(
      this.elementId(),
      this.username(),
      this.slug()
    );
    if (next) {
      this.schemaState.set(next);
      this.elementSchemaEditing.set(false);
      await this.rebuildFormForSchema(next.schema);
    }
  }

  /**
   * Re-read the element's schema state (after a remote schema edit or a
   * shared library change) and rebuild the form if the copy itself changed.
   */
  private async refreshSchemaState(): Promise<void> {
    if (this.previewMode()) return;
    const id = this.elementId();
    const username = this.username();
    const slug = this.slug();
    if (!id || !username || !slug) return;
    const state = await this.worldbuildingService.getElementSchemaState(
      id,
      username,
      slug
    );
    if (!state) return;
    this.schemaState.set(state);
    const current = this.schema();
    if (
      !current ||
      schemaContentHash(current) !== schemaContentHash(state.schema)
    ) {
      await this.rebuildFormForSchema(state.schema);
    }
  }

  /** Swap in a new schema and rebuild the form, re-applying stored values. */
  private async rebuildFormForSchema(schema: ElementTypeSchema): Promise<void> {
    this.isUpdatingFromRemote = true;
    this.schema.set(schema);
    this.form.set(new FormGroup({}));
    this.buildFormFromSchema(schema);
    this.ensureRelationshipFieldTypes(schema);
    const data = await this.worldbuildingService.getWorldbuildingData(
      this.elementId(),
      this.username(),
      this.slug()
    );
    if (data) {
      this.updateFormFromData(data);
    }
    if (!this.projectState.canWrite()) {
      this.form().disable({ emitEvent: false });
    }
    this.isUpdatingFromRemote = false;
  }

  /**
   * Icons offered in the Schema Details and tab icon pickers. Covers every
   * built-in element-type icon plus the icons used by the default schemas'
   * tabs, so an existing schema's icon is always available. Callers should
   * use {@link getIconChoices} so the currently-selected icon is always
   * shown even if it isn't in this curated list.
   */
  protected getAvailableIcons(): string[] {
    return [
      // Element-type icons (must cover built-in types).
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
      'folder',
      'hub',
      'dashboard',
      'timeline',
      // Icons used by the default schemas' tabs (schema + tab icons).
      'info',
      'visibility',
      'psychology',
      'history_edu',
      'stars',
      'ac_unit',
      'account_balance',
      'account_tree',
      'auto_awesome',
      'blur_on',
      'bolt',
      'build',
      'celebration',
      'church',
      'content_copy',
      'coronavirus',
      'directions_car',
      'event',
      'explore',
      'face',
      'flag',
      'flash_on',
      'forum',
      'gavel',
      'history',
      'home_work',
      'lightbulb',
      'location_city',
      'location_on',
      'menu_book',
      'military_tech',
      'nights_stay',
      'public',
      'record_voice_over',
      'router',
      'rule',
      'school',
      'science',
      'sick',
      'terrain',
      'today',
      'translate',
      'tune',
      'work',
      // Additional common icons.
      'article',
      'watch_later',
      'people',
      'group',
      'campaign',
      'cloud',
      'computer',
      'currency_exchange',
      'desktop_windows',
      'family_restroom',
      'format_paint',
      'inventory_2',
      'key',
      'label',
      'link',
      'list',
      'local_offer',
      'lock',
      'phone_android',
      'publish',
      'push_pin',
      'schedule',
      'star',
      'bookmark',
      'edit_note',
      'palette',
      'sync',
      'tablet',
      'update',
    ];
  }

  /**
   * The icon choices shown in a picker: the curated list plus the currently
   * selected icon (if it isn't already present) so the current value is
   * always visible and selectable.
   */
  protected getIconChoices(current?: string): string[] {
    if (!current) return this.getAvailableIcons();
    const all = this.getAvailableIcons();
    return all.includes(current) ? all : [...all, current];
  }

  /** Open the icon picker dialog and apply the chosen icon to a tab. */
  protected async pickTabIcon(tab: TabSchema): Promise<void> {
    const icon = await this.dialogGateway.openIconPickerDialog({
      current: this.getTabIcon(tab),
      icons: this.getIconChoices(this.getTabIcon(tab)),
      titleKey: 'worldbuilding.schemaEdit.tabIcon',
    });
    if (icon) {
      this.onUpdateTab(tab.key, { icon });
    }
  }

  /** Open the icon picker dialog and apply the chosen icon to the schema. */
  protected async pickSchemaIcon(): Promise<void> {
    const current = this.previewSchema()?.icon ?? 'category';
    const icon = await this.dialogGateway.openIconPickerDialog({
      current,
      icons: this.getIconChoices(current),
      titleKey: 'templates.editor.iconLabel',
    });
    if (icon) {
      this.onSchemaInfoChange({ icon });
    }
  }

  protected onAddTab(): void {
    this.emitSchemaEdit({ type: 'add-tab' });
  }

  protected async onRemoveTab(tabKey: string): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: this.transloco.translate(
        'worldbuilding.schemaEdit.removeTabTitle'
      ),
      message: this.transloco.translate(
        'worldbuilding.schemaEdit.removeTabConfirm',
        { tab: this.getTabLabel(tabKey) }
      ),
      confirmText: this.transloco.translate('delete'),
      cancelText: this.transloco.translate('cancel'),
    });
    if (confirmed) {
      this.emitSchemaEdit({ type: 'remove-tab', tabKey });
    }
  }

  /** Emit an update to a tab's properties (label/icon). */
  protected onUpdateTab(tabKey: string, patch: Partial<TabSchema>): void {
    this.emitSchemaEdit({ type: 'update-tab', tabKey, patch });
  }

  /** Resolve a tab's display label by key (or the key itself). */
  private getTabLabel(tabKey: string): string {
    return this.getTabs().find(t => t.key === tabKey)?.label || tabKey;
  }

  protected onAddField(tabKey: string): void {
    this.emitSchemaEdit({ type: 'add-field', tabKey });
  }

  protected onRemoveField(tabKey: string, fieldKey: string): void {
    this.emitSchemaEdit({ type: 'remove-field', tabKey, fieldKey });
  }

  protected onMoveField(tabKey: string, fieldKey: string, delta: -1 | 1): void {
    this.emitSchemaEdit({ type: 'move-field', tabKey, fieldKey, delta });
  }

  /** Emit a field config change (label/type/placeholder/description/options). */
  protected onUpdateField(
    tabKey: string,
    fieldKey: string,
    patch: Partial<FieldSchema>
  ): void {
    this.emitSchemaEdit({ type: 'update-field', tabKey, fieldKey, patch });
  }

  /** Open the field settings dialog and apply the returned patch. */
  async openFieldConfig(tabKey: string, field: FieldSchema): Promise<void> {
    const patch = await this.dialogGateway.openFieldConfigDialog({
      field,
      fieldTypes: this.getFieldTypes(),
    });
    if (patch) {
      this.onUpdateField(tabKey, field.key, patch);
    }
  }

  /** Field types offered in the field settings dialog. */
  protected getFieldTypes(): { value: string; label: string }[] {
    return [
      { value: 'text', label: 'Text' },
      { value: 'textarea', label: 'Text Area' },
      { value: 'number', label: 'Number' },
      { value: 'date', label: 'Date' },
      { value: 'select', label: 'Select' },
      { value: 'multiselect', label: 'Multi Select' },
      { value: 'checkbox', label: 'Checkbox' },
      { value: 'array', label: 'Array (Tags)' },
      {
        value: 'relationship',
        label: this.transloco.translate(
          'templates.editor.fieldTypeRelationship'
        ),
      },
    ];
  }

  /** Emit a schema metadata change from the Schema Details section. */
  protected onSchemaInfoChange(patch: {
    name?: string;
    icon?: string;
    description?: string;
  }): void {
    if (!this.schemaEditingEnabled()) return;
    this.schemaInfoChange.emit(patch);
  }

  /** Emit an edited default appearance from the Styling section. */
  protected onDefaultAppearanceChange(appearance: ElementAppearance): void {
    if (!this.schemaEditingEnabled()) return;
    this.defaultAppearanceChange.emit(appearance);
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
   * Open the snapshots dialog: for a real element, the element's snapshots; in
   * schema-edit mode, the template's snapshots.
   */
  openSnapshotsDialog(): void {
    if (this.templateEditingEnabled()) {
      const schemaId = this.previewSchema()?.id;
      if (schemaId) {
        this.dialogGateway.openTemplateSnapshotsDialog(schemaId);
        return;
      }
    }
    const data: SnapshotsDialogData = {
      documentId: this.elementId(),
    };
    this.dialogGateway.openSnapshotsDialog(data);
  }
}
