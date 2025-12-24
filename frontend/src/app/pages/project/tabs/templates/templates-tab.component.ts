import {
  Component,
  computed,
  effect,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { firstValueFrom } from 'rxjs';

import {
  TemplateEditorDialogComponent,
  TemplateEditorDialogData,
} from '../../../../dialogs/template-editor-dialog/template-editor-dialog.component';
import { ElementTypeSchema, TabSchema } from '../../../../models/schema-types';

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

interface TemplateSchema {
  /** Schema ID (nanoid) - used for all lookups */
  id: string;
  label: string;
  icon: string;
  description?: string;
  tabCount: number;
  fieldCount: number;
  isBuiltIn: boolean;
}

/**
 * Component for displaying all worldbuilding templates (schemas) in a project
 */
@Component({
  selector: 'app-templates-tab',
  templateUrl: './templates-tab.component.html',
  styleUrls: ['./templates-tab.component.scss'],
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
})
export class TemplatesTabComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly dialog = inject(MatDialog);
  private readonly reloadDelay = inject(TEMPLATE_RELOAD_DELAY);

  readonly project = this.projectState.project;
  readonly templates = signal<TemplateSchema[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasTemplates = computed(() => this.templates().length > 0);

  constructor() {
    // Load templates when project changes
    effect(() => {
      const project = this.project();
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
      const schemas = this.worldbuildingService.getAllSchemas(
        project.username,
        project.slug
      );

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
        isBuiltIn: schema.isBuiltIn !== false, // Default to true if not specified
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
      const projectKey = `${project.username}:${project.slug}`;
      this.worldbuildingService.cloneTemplate(
        projectKey,
        template.id,
        newName,
        `Clone of ${template.label}`,
        project.username,
        project.slug
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
      const projectKey = `${project.username}:${project.slug}`;
      this.worldbuildingService.deleteTemplate(
        projectKey,
        template.id,
        project.username,
        project.slug
      );

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
  async editTemplate(template: TemplateSchema): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }

    try {
      // Load the full schema using the abstraction layer
      const fullSchema = this.worldbuildingService.getSchema(
        project.username,
        project.slug,
        template.id
      );

      if (!fullSchema) {
        this.snackBar.open('Template not found', 'Close', { duration: 3000 });
        return;
      }

      // Open editor dialog
      const dialogData: TemplateEditorDialogData = { schema: fullSchema };
      const dialogRef = this.dialog.open(TemplateEditorDialogComponent, {
        width: '900px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        data: dialogData,
        disableClose: true,
      });

      const result = (await firstValueFrom(dialogRef.afterClosed())) as
        | ElementTypeSchema
        | null
        | undefined;

      if (result) {
        // Update the template
        const projectKey = `${project.username}:${project.slug}`;
        this.worldbuildingService.updateTemplate(
          projectKey,
          template.id,
          result,
          project.username,
          project.slug
        );

        this.snackBar.open(`✓ Template "${result.name}" updated`, 'Close', {
          duration: 3000,
        });

        // Wait for sync then reload
        await new Promise(resolve => setTimeout(resolve, this.reloadDelay));
        this.loadTemplates();
      }
    } catch (err) {
      console.error('[TemplatesTab] Error editing template:', err);
      this.snackBar.open('Failed to update template', 'Close', {
        duration: 5000,
      });
    }
  }
}
