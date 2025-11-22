import { Component, computed, effect, inject, signal } from '@angular/core';
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
import { DefaultTemplatesService } from '@services/default-templates.service';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { ProjectStateService } from '@services/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding.service';
import { firstValueFrom } from 'rxjs';
import * as Y from 'yjs';

import {
  TemplateEditorDialogComponent,
  TemplateEditorDialogData,
} from '../../../../dialogs/template-editor-dialog/template-editor-dialog.component';

interface TabSchema {
  key: string;
  label: string;
  icon?: string;
  order?: number;
  fields: FieldSchema[];
}

interface FieldSchema {
  key: string;
  label: string;
  type: string;
  [key: string]: unknown;
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
  createdAt?: string;
  updatedAt?: string;
  isBuiltIn?: boolean;
}

interface TemplateSchema {
  type: string;
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
  private readonly defaultTemplatesService = inject(DefaultTemplatesService);

  readonly project = this.projectState.project;
  readonly templates = signal<TemplateSchema[]>([]);
  readonly isLoading = signal(false);
  readonly isLoadingDefaults = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasTemplates = computed(() => this.templates().length > 0);

  constructor() {
    // Load templates when project changes
    effect(() => {
      const project = this.project();
      if (project) {
        void this.loadTemplates();
      }
    });
  }

  /**
   * Load all templates from the project's schema library
   */
  async loadTemplates(): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const projectKey = `${project.username}:${project.slug}`;
      const library = await this.worldbuildingService.loadSchemaLibrary(
        projectKey,
        project.username,
        project.slug
      );

      // Wait for WebSocket sync to complete after library is loaded
      // For new projects, schemas may have just been created on the backend
      await new Promise(resolve => setTimeout(resolve, 1000));

      const schemasMap = library.get('schemas') as Map<
        string,
        ElementTypeSchema
      >;

      if (!schemasMap || schemasMap.size === 0) {
        console.warn('[TemplatesTab] No schemas found in library');
        this.templates.set([]);
        return;
      }

      const templates: TemplateSchema[] = [];

      // Extract all schemas from the Y.Map
      // Each schema is stored as a Y.Map with string keys
      schemasMap.forEach((schemaYMap: unknown) => {
        // schemaYMap is a Y.Map, need to extract its data
        if (
          schemaYMap &&
          typeof schemaYMap === 'object' &&
          'get' in schemaYMap &&
          typeof schemaYMap.get === 'function'
        ) {
          const ymap = schemaYMap as Y.Map<unknown>;
          const schema: ElementTypeSchema = {
            id: ymap.get('id') as string,
            type: ymap.get('type') as string,
            name: ymap.get('name') as string,
            icon: ymap.get('icon') as string,
            description: ymap.get('description') as string,
            version: ymap.get('version') as number,
            isBuiltIn: ymap.get('isBuiltIn') as boolean,
            tabs: ymap.has('tabs')
              ? (JSON.parse(ymap.get('tabs') as string) as TabSchema[])
              : [],
            defaultValues: ymap.has('defaultValues')
              ? (JSON.parse(ymap.get('defaultValues') as string) as Record<
                  string,
                  unknown
                >)
              : undefined,
            createdAt: ymap.get('createdAt') as string | undefined,
            updatedAt: ymap.get('updatedAt') as string | undefined,
          };

          if (schema && schema.type) {
            templates.push({
              type: schema.type,
              label: schema.name || schema.type,
              icon: schema.icon || 'article',
              description: schema.description,
              tabCount: schema.tabs?.length || 0,
              fieldCount: this.countFields(schema.tabs || []),
              isBuiltIn: schema.isBuiltIn !== false, // Default to true if not specified
            });
          }
        }
      });

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
    void this.loadTemplates();
  }

  /**
   * Load default templates from client-side assets
   */
  async loadDefaultTemplates(): Promise<void> {
    const project = this.project();
    if (!project || this.isLoadingDefaults()) {
      return;
    }

    this.isLoadingDefaults.set(true);
    this.error.set(null);

    try {
      // Load default templates from assets
      const defaultTemplates =
        await this.defaultTemplatesService.loadDefaultTemplates();

      const projectKey = `${project.username}:${project.slug}`;
      const library = await this.worldbuildingService.loadSchemaLibrary(
        projectKey,
        project.username,
        project.slug
      );

      // Get or create schemas map in the library
      let schemasMap = library.get('schemas') as Y.Map<unknown>;
      if (!schemasMap) {
        schemasMap = new Y.Map();
        library.set('schemas', schemasMap);
      }

      // Save each template to the schema library
      const templateArray = Object.values(defaultTemplates);
      for (const schema of templateArray) {
        const schemaYMap = new Y.Map<unknown>();
        schemaYMap.set('id', schema.id);
        schemaYMap.set('type', schema.type);
        schemaYMap.set('name', schema.name);
        schemaYMap.set('icon', schema.icon);
        schemaYMap.set('description', schema.description);
        schemaYMap.set('version', schema.version);
        schemaYMap.set('isBuiltIn', schema.isBuiltIn);
        schemaYMap.set('tabs', JSON.stringify(schema.tabs));
        if (schema.defaultValues) {
          schemaYMap.set('defaultValues', JSON.stringify(schema.defaultValues));
        }

        schemasMap.set(schema.type, schemaYMap);
      }

      this.snackBar.open(
        `✓ Loaded ${templateArray.length} default templates`,
        'Close',
        {
          duration: 3000,
        }
      );

      // Reload templates list to show the new templates
      await this.loadTemplates();
    } catch (err) {
      console.error('[TemplatesTab] Error loading default templates:', err);
      this.error.set('Failed to load default templates');
      this.snackBar.open('Failed to load default templates', 'Close', {
        duration: 5000,
      });
    } finally {
      this.isLoadingDefaults.set(false);
    }
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
      await this.worldbuildingService.cloneTemplate(
        projectKey,
        template.type,
        newName,
        `Clone of ${template.label}`,
        project.username,
        project.slug
      );

      this.snackBar.open(`✓ Template "${newName}" created`, 'Close', {
        duration: 3000,
      });

      // Wait for sync then reload
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.loadTemplates();
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
      await this.worldbuildingService.deleteTemplate(
        projectKey,
        template.type,
        project.username,
        project.slug
      );

      this.snackBar.open(`✓ Template "${template.label}" deleted`, 'Close', {
        duration: 3000,
      });

      // Wait for sync then reload
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.loadTemplates();
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
      // Load the full schema from the library
      const projectKey = `${project.username}:${project.slug}`;
      const library = await this.worldbuildingService.loadSchemaLibrary(
        projectKey,
        project.username,
        project.slug
      );

      const schemasMap = library.get('schemas') as Map<string, Y.Map<unknown>>;
      const schemaYMap = schemasMap?.get(template.type) as Y.Map<unknown>;

      if (!schemaYMap) {
        this.snackBar.open('Template not found', 'Close', { duration: 3000 });
        return;
      }

      // Convert Y.Map to ElementTypeSchema
      const fullSchema: ElementTypeSchema = {
        id: schemaYMap.get('id') as string,
        type: schemaYMap.get('type') as string,
        name: schemaYMap.get('name') as string,
        icon: schemaYMap.get('icon') as string,
        description: schemaYMap.get('description') as string,
        version: schemaYMap.get('version') as number,
        isBuiltIn: schemaYMap.get('isBuiltIn') as boolean,
        tabs: schemaYMap.has('tabs')
          ? (JSON.parse(schemaYMap.get('tabs') as string) as TabSchema[])
          : [],
        defaultValues: schemaYMap.has('defaultValues')
          ? (JSON.parse(schemaYMap.get('defaultValues') as string) as Record<
              string,
              unknown
            >)
          : undefined,
      };

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
        const updatedSchema = result;
        await this.worldbuildingService.updateTemplate(
          projectKey,
          template.type,
          updatedSchema,
          project.username,
          project.slug
        );

        this.snackBar.open(
          `✓ Template "${updatedSchema.name}" updated`,
          'Close',
          {
            duration: 3000,
          }
        );

        // Wait for sync then reload
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.loadTemplates();
      }
    } catch (err) {
      console.error('[TemplatesTab] Error editing template:', err);
      this.snackBar.open('Failed to update template', 'Close', {
        duration: 5000,
      });
    }
  }
}
