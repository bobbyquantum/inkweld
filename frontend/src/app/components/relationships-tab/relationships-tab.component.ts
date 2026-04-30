import { Component, computed, inject, NgZone, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SettingsTabStatusComponent } from '@components/settings-tab-status/settings-tab-status.component';
import {
  EditRelationshipTypeDialogComponent,
  type EditRelationshipTypeDialogData,
  type EditRelationshipTypeDialogResult,
} from '@dialogs/edit-relationship-type-dialog/edit-relationship-type-dialog.component';
import { DocumentSyncState } from '@models/document-sync-state';
import {
  getCategoryIcon,
  getCategoryLabel,
  type RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { firstValueFrom } from 'rxjs';

/**
 * View model for relationship types displayed in the list
 */
interface RelationshipTypeView {
  id: string;
  name: string;
  inverseLabel: string;
  showInverse: boolean;
  icon: string;
  category: RelationshipCategory;
  categoryLabel: string;
  color?: string;
  sourceConstraints: string;
  targetConstraints: string;
}

/**
 * Component for managing relationship types in a project
 */
@Component({
  selector: 'app-relationships-tab',
  templateUrl: './relationships-tab.component.html',
  styleUrls: ['./relationships-tab.component.scss'],
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    SettingsTabStatusComponent,
  ],
})
export class RelationshipsTabComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly dialog = inject(MatDialog);
  private readonly ngZone = inject(NgZone);

  readonly project = this.projectState.project;
  readonly isLoading = computed(
    () =>
      this.projectState.isLoading() ||
      (this.projectState.getSyncState() === DocumentSyncState.Syncing &&
        !this.hasTypes())
  );
  readonly error = signal<string | null>(null);

  protected readonly allTypes = this.relationshipService.allTypes;

  readonly relationshipTypes = computed(() => {
    const types = this.allTypes();
    const views = types.map(type => this.toView(type));

    // Sort by category, then by name
    return [...views].sort((a, b) => {
      if (a.category !== b.category) {
        return a.categoryLabel.localeCompare(b.categoryLabel);
      }
      return a.name.localeCompare(b.name);
    });
  });

  readonly hasTypes = computed(() => this.relationshipTypes().length > 0);

  readonly searchQuery = signal('');

  readonly filteredTypes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const types = this.relationshipTypes();
    if (!query) return types;
    return types.filter(
      t =>
        t.name.toLowerCase().includes(query) ||
        t.inverseLabel.toLowerCase().includes(query) ||
        t.categoryLabel.toLowerCase().includes(query)
    );
  });

  constructor() {
    // Types are reactive via the service's computed signal.
  }

  /**
   * Load all relationship types — mostly a no-op; clears errors.
   */
  loadRelationshipTypes(): void {
    this.error.set(null);
  }

  /**
   * Convert a RelationshipTypeDefinition to a view model
   */
  private toView(type: RelationshipTypeDefinition): RelationshipTypeView {
    return {
      id: type.id,
      name: type.name,
      inverseLabel: type.inverseLabel,
      showInverse: type.showInverse,
      icon: type.icon ?? getCategoryIcon(type.category),
      category: type.category,
      categoryLabel: getCategoryLabel(type.category),
      color: type.color,
      sourceConstraints: this.formatConstraints(type.sourceEndpoint),
      targetConstraints: this.formatConstraints(type.targetEndpoint),
    };
  }

  /**
   * Format endpoint constraints for display
   */
  private formatConstraints(endpoint: {
    allowedSchemas: string[];
    maxCount?: number | null;
  }): string {
    const parts: string[] = [];

    if (endpoint.allowedSchemas.length === 0) {
      parts.push('Any element');
    } else {
      parts.push(endpoint.allowedSchemas.join(', '));
    }

    if (endpoint.maxCount !== undefined && endpoint.maxCount !== null) {
      parts.push(`max ${endpoint.maxCount}`);
    }

    return parts.join(' · ');
  }

  /**
   * Refresh the relationship types list
   */
  refresh(): void {
    this.loadRelationshipTypes();
  }

  /**
   * Open the full editor dialog, return the result or null if cancelled.
   */
  private openEditorDialog(
    data: EditRelationshipTypeDialogData
  ): Promise<EditRelationshipTypeDialogResult | null> {
    return firstValueFrom(
      this.dialog
        .open<
          EditRelationshipTypeDialogComponent,
          EditRelationshipTypeDialogData,
          EditRelationshipTypeDialogResult
        >(EditRelationshipTypeDialogComponent, {
          data,
          width: '640px',
          maxHeight: '90vh',
        })
        .afterClosed()
    ).then(result => result ?? null);
  }

  /**
   * Create a new relationship type
   */
  async createType(): Promise<void> {
    const project = this.project();
    if (!project) return;

    const availableSchemas = this.worldbuildingService.getSchemas();

    const result = await this.openEditorDialog({
      isNew: true,
      availableSchemas,
    });

    if (!result) return; // User cancelled

    try {
      this.ngZone.run(() => {
        const newType = this.relationshipService.addCustomType(result);
        this.snackBar.open(
          `✓ Created relationship type: ${newType.name}`,
          'Close',
          { duration: 3000 }
        );
      });
    } catch (err: unknown) {
      console.error(
        '[RelationshipsTab] Error creating type:',
        err instanceof Error ? err.message : err
      );
      this.snackBar.open('Failed to create relationship type', 'Close', {
        duration: 5000,
      });
    }
  }

  /**
   * Edit a relationship type (full editor)
   */
  async editType(type: RelationshipTypeView): Promise<void> {
    const original = this.relationshipService.getTypeById(type.id);
    if (!original) return;

    const availableSchemas = this.worldbuildingService.getSchemas();

    const result = await this.openEditorDialog({
      type: original,
      isNew: false,
      availableSchemas,
    });

    if (!result) return; // User cancelled

    try {
      this.ngZone.run(() => {
        const updated = this.relationshipService.updateCustomType(
          type.id,
          result
        );

        if (updated) {
          this.snackBar.open(`✓ Updated relationship type`, 'Close', {
            duration: 3000,
          });
        } else {
          this.snackBar.open('Failed to update relationship type', 'Close', {
            duration: 5000,
          });
        }
      });
    } catch (err: unknown) {
      console.error(
        '[RelationshipsTab] Error updating type:',
        err instanceof Error ? err.message : err
      );
      this.snackBar.open('Failed to update relationship type', 'Close', {
        duration: 5000,
      });
    }
  }

  /**
   * Delete a relationship type
   */
  async deleteType(type: RelationshipTypeView): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Relationship Type',
      message: `Are you sure you want to delete "${type.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      this.ngZone.run(() => {
        const removed = this.relationshipService.removeCustomType(type.id);

        if (removed) {
          this.snackBar.open(
            `✓ Deleted relationship type: ${type.name}`,
            'Close',
            { duration: 3000 }
          );
        } else {
          this.snackBar.open('Failed to delete relationship type', 'Close', {
            duration: 5000,
          });
        }
      });
    } catch (err: unknown) {
      console.error(
        '[RelationshipsTab] Error deleting type:',
        err instanceof Error ? err.message : err
      );
      this.snackBar.open('Failed to delete relationship type', 'Close', {
        duration: 5000,
      });
    }
  }

  /**
   * Duplicate a relationship type — opens full editor pre-filled with clone data
   */
  async cloneType(type: RelationshipTypeView): Promise<void> {
    const project = this.project();
    if (!project) return;

    const original = this.relationshipService.getTypeById(type.id);
    if (!original) {
      this.snackBar.open('Failed to duplicate relationship type', 'Close', {
        duration: 5000,
      });
      return;
    }

    const availableSchemas = this.worldbuildingService.getSchemas();

    // Open the editor pre-filled with the clone's data (in create mode)
    const result = await this.openEditorDialog({
      type: {
        ...original,
        name: `${original.name} (Copy)`,
      },
      isNew: true,
      availableSchemas,
    });

    if (!result) return; // User cancelled

    try {
      this.ngZone.run(() => {
        const newType = this.relationshipService.addCustomType(result);
        this.snackBar.open(
          `✓ Duplicated relationship type: ${newType.name}`,
          'Close',
          { duration: 3000 }
        );
      });
    } catch (err: unknown) {
      console.error(
        '[RelationshipsTab] Error duplicating type:',
        err instanceof Error ? err.message : err
      );
      this.snackBar.open('Failed to duplicate relationship type', 'Close', {
        duration: 5000,
      });
    }
  }
}
