import {
  Component,
  computed,
  effect,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

import {
  type ElementTypeSchema,
  type TabSchema,
} from '../../../../models/schema-types';
import { SettingsTabStatusComponent } from '../settings-tab-status.component';
import { TemplateEditorPageComponent } from './template-editor-page/template-editor-page.component';

/**
 * Injection token for reload delay after mutations.
 * In tests, this can be overridden to speed up tests.
 */
export const TEMPLATE_RELOAD_DELAY = new InjectionToken<number>(
  'TEMPLATE_RELOAD_DELAY',
  {
    providedIn: 'root',
    factory: () => 500, // Default 500ms in production
  }
);

/**
 * Editing state: either showing the list, or the inline editor.
 * `schema` is the schema being created/edited.
 * `templateId` is null when creating a new template.
 */
type EditingState =
  | { mode: 'list' }
  | { mode: 'edit'; schema: ElementTypeSchema; templateId: string | null };

interface TemplateSchema {
  /** Schema ID (nanoid) - used for all lookups */
  id: string;
  label: string;
  icon: string;
  description?: string;
  tabCount: number;
  fieldCount: number;
}

/**
 * Component for displaying all worldbuilding templates (schemas) in a project
 */
@Component({
  selector: 'app-templates-tab',
  templateUrl: './templates-tab.component.html',
  styleUrls: ['./templates-tab.component.scss'],
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    SettingsTabStatusComponent,
    TemplateEditorPageComponent,
  ],
})
export class TemplatesTabComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly reloadDelay = inject(TEMPLATE_RELOAD_DELAY);

  readonly project = this.projectState.project;
  readonly templates = signal<TemplateSchema[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasTemplates = computed(() => this.templates().length > 0);

  readonly searchQuery = signal('');

  readonly filteredTemplates = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const templates = this.templates();
    if (!query) return templates;
    return templates.filter(
      t =>
        t.label.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
    );
  });

  /** Controls whether to show the list or the inline editor. */
  readonly editingState = signal<EditingState>({ mode: 'list' });

  /** Convenience computed for the schema currently being edited. */
  readonly editingSchema = computed(() => {
    const state = this.editingState();
    return state.mode === 'edit' ? state.schema : null;
  });

  constructor() {
    // Load templates when project or schemas change
    // The schemas dependency is critical to handle the race condition where
    // the project signal is set before the sync provider has finished loading
    // schemas from IndexedDB/Yjs. Reading schemas() ensures the effect re-fires
    // once schemas actually arrive.
    effect(() => {
      const project = this.project();
      const _schemas = this.worldbuildingService.schemas();
      if (project) {
        this.loadTemplates();
      }
    });
  }

  /**
   * Load all templates from the project's schema library
   */
  loadTemplates(): void {
    const project = this.project();
    if (!project) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      // Schemas are already synced via the sync provider - no delay needed
      const schemas = this.worldbuildingService.getAllSchemas();

      if (schemas.length === 0) {
        console.warn('[TemplatesTab] No schemas found in library');
        this.templates.set([]);
        return;
      }

      const templates: TemplateSchema[] = schemas.map(schema => ({
        id: schema.id,
        label: schema.name || schema.id,
        icon: schema.icon || 'article',
        description: schema.description,
        tabCount: schema.tabs?.length || 0,
        fieldCount: this.countFields(schema.tabs || []),
      }));

      // Sort by label
      templates.sort((a, b) => a.label.localeCompare(b.label));

      this.templates.set(templates);
    } catch (err) {
      console.error('[TemplatesTab] Error loading templates:', err);
      this.error.set('Failed to load templates');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Count total fields across all tabs in a schema
   */
  private countFields(tabs: TabSchema[]): number {
    return tabs.reduce((total, tab) => total + (tab.fields?.length || 0), 0);
  }

  /**
   * Refresh the templates list
   */
  refresh(): void {
    this.loadTemplates();
  }

  /**
   * Create a new template from scratch
   */
  createTemplate(): void {
    const project = this.project();
    if (!project) {
      return;
    }

    const timestamp = Date.now();
    const newSchema: ElementTypeSchema = {
      id: `custom-${timestamp}`,
      name: 'New Template',
      icon: 'article',
      description: '',
      version: 1,
      tabs: [
        {
          key: 'general',
          label: 'General',
          fields: [
            {
              key: 'name',
              label: 'Name',
              type: 'text',
            },
            {
              key: 'description',
              label: 'Description',
              type: 'textarea',
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.editingState.set({
      mode: 'edit',
      schema: newSchema,
      templateId: null,
    });
  }

  /**
   * Clone a template (creates a custom copy)
   */
  async cloneTemplate(template: TemplateSchema): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }

    // Ask user for the new template name
    const newName = await this.dialogGateway.openRenameDialog({
      title: 'Clone Template',
      currentName: `${template.label} (Copy)`,
    });

    if (!newName) {
      return; // User cancelled
    }

    try {
      this.worldbuildingService.cloneTemplate(
        template.id,
        newName,
        `Clone of ${template.label}`
      );

      this.snackBar.open(`✓ Template "${newName}" created`, 'Close', {
        duration: 3000,
      });

      // Wait for sync then reload
      await new Promise(resolve => setTimeout(resolve, this.reloadDelay));
      this.loadTemplates();
    } catch (err) {
      console.error('[TemplatesTab] Error cloning template:', err);
      this.snackBar.open('Failed to clone template', 'Close', {
        duration: 5000,
      });
    }
  }

  /**
   * Delete a custom template
   */
  async deleteTemplate(template: TemplateSchema): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }

    // Confirm deletion
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Template',
      message: `Are you sure you want to delete the template "${template.label}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    try {
      this.worldbuildingService.deleteTemplate(template.id);

      this.snackBar.open(`✓ Template "${template.label}" deleted`, 'Close', {
        duration: 3000,
      });

      // Wait for sync then reload
      await new Promise(resolve => setTimeout(resolve, this.reloadDelay));
      this.loadTemplates();
    } catch (err) {
      console.error('[TemplatesTab] Error deleting template:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete template';
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
      });
    }
  }

  /**
   * Edit a template
   */
  editTemplate(template: TemplateSchema): void {
    const project = this.project();
    if (!project) {
      return;
    }

    const fullSchema = this.worldbuildingService.getSchema(template.id);

    if (!fullSchema) {
      this.snackBar.open('Template not found', 'Close', { duration: 3000 });
      return;
    }

    this.editingState.set({
      mode: 'edit',
      schema: fullSchema,
      templateId: template.id,
    });
  }

  /**
   * Handle the editor's done event (save or cancel)
   */
  async onEditorDone(result: ElementTypeSchema | null): Promise<void> {
    const state = this.editingState();
    if (state.mode !== 'edit') return;

    if (!result) {
      this.editingState.set({ mode: 'list' });
      return;
    }

    try {
      if (state.templateId === null) {
        // New template
        this.worldbuildingService.saveSchemaToLibrary(result);
      } else {
        // Existing template
        this.worldbuildingService.updateTemplate(state.templateId, result);
      }

      // Wait for sync then reload
      await new Promise(resolve => setTimeout(resolve, this.reloadDelay));
      this.loadTemplates();

      this.editingState.set({ mode: 'list' });

      this.snackBar.open(
        `✓ Template "${result.name}" ${state.templateId === null ? 'created' : 'updated'}`,
        'Close',
        { duration: 3000 }
      );
    } catch (err) {
      console.error('[TemplatesTab] Error saving template:', err);
      this.editingState.set({
        mode: 'edit',
        schema: result,
        templateId: state.templateId,
      });
      this.snackBar.open('Failed to save template', 'Close', {
        duration: 5000,
      });
    }
  }
}
