import { Component, computed, inject, NgZone, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';

import {
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '../../../../components/element-ref/element-ref.model';
import { DocumentSyncState } from '../../../../models/document-sync-state';
import { SettingsTabStatusComponent } from '../settings-tab-status.component';

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
    // We no longer need the effect to manually load types
    // as it's now a computed signal based on the service's signal.
  }

  /**
   * Load all relationship types - keep for backwards compatibility if needed,
   * but now it's mostly a no-op that just clears errors.
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
      icon: type.icon || this.getCategoryIcon(type.category),
      category: type.category,
      categoryLabel: this.getCategoryLabel(type.category),
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
   * Get category label for display
   */
  private getCategoryLabel(category: RelationshipCategory): string {
    switch (category) {
      case RelationshipCategory.Reference:
        return 'Reference';
      case RelationshipCategory.Familial:
        return 'Family';
      case RelationshipCategory.Social:
        return 'Social';
      case RelationshipCategory.Professional:
        return 'Professional';
      case RelationshipCategory.Spatial:
        return 'Location';
      case RelationshipCategory.Temporal:
        return 'Timeline';
      case RelationshipCategory.Ownership:
        return 'Ownership';
      case RelationshipCategory.Custom:
        return 'Custom';
      default:
        return 'Other';
    }
  }

  /**
   * Get default icon for a category
   */
  private getCategoryIcon(category: RelationshipCategory): string {
    switch (category) {
      case RelationshipCategory.Reference:
        return 'link';
      case RelationshipCategory.Familial:
        return 'family_restroom';
      case RelationshipCategory.Social:
        return 'people';
      case RelationshipCategory.Professional:
        return 'work';
      case RelationshipCategory.Spatial:
        return 'location_on';
      case RelationshipCategory.Temporal:
        return 'schedule';
      case RelationshipCategory.Ownership:
        return 'inventory_2';
      case RelationshipCategory.Custom:
        return 'tune';
      default:
        return 'link';
    }
  }

  /**
   * Refresh the relationship types list
   */
  refresh(): void {
    this.loadRelationshipTypes();
  }

  /**
   * Create a new relationship type
   */
  async createType(): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }

    // Ask for the relationship name
    const name = await this.dialogGateway.openRenameDialog({
      title: 'Create Relationship Type',
      currentName: '',
    });

    if (!name) {
      return; // User cancelled
    }

    // Ask for the inverse label
    const inverseLabel = await this.dialogGateway.openRenameDialog({
      title: 'Inverse Label',
      currentName: `${name} (inverse)`,
    });

    if (!inverseLabel) {
      return; // User cancelled
    }

    try {
      this.ngZone.run(() => {
        const newType = this.relationshipService.addCustomType({
          name,
          inverseLabel,
          showInverse: true,
          category: RelationshipCategory.Custom,
          sourceEndpoint: { allowedSchemas: [] },
          targetEndpoint: { allowedSchemas: [] },
        });

        this.snackBar.open(
          `✓ Created relationship type: ${newType.name}`,
          'Close',
          {
            duration: 3000,
          }
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
   * Edit a relationship type
   */
  async editType(type: RelationshipTypeView): Promise<void> {
    // Ask for the new name
    const newName = await this.dialogGateway.openRenameDialog({
      title: 'Edit Relationship Type',
      currentName: type.name,
    });

    if (!newName) {
      return; // User cancelled
    }

    try {
      this.ngZone.run(() => {
        const updated = this.relationshipService.updateCustomType(type.id, {
          name: newName,
        });

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

    if (!confirmed) {
      return;
    }

    try {
      this.ngZone.run(() => {
        const removed = this.relationshipService.removeCustomType(type.id);

        if (removed) {
          this.snackBar.open(
            `✓ Deleted relationship type: ${type.name}`,
            'Close',
            {
              duration: 3000,
            }
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
   * Duplicate a relationship type
   */
  async cloneType(type: RelationshipTypeView): Promise<void> {
    const project = this.project();
    if (!project) {
      return;
    }

    // Ask for the new name
    const newName = await this.dialogGateway.openRenameDialog({
      title: 'Duplicate Relationship Type',
      currentName: `${type.name} (Copy)`,
    });

    if (!newName) {
      return; // User cancelled
    }

    try {
      this.ngZone.run(() => {
        // Get the original type to copy all properties
        const original = this.relationshipService.getTypeById(type.id);
        if (!original) {
          throw new Error('Original type not found');
        }

        const newType = this.relationshipService.addCustomType({
          name: newName,
          inverseLabel: original.inverseLabel,
          showInverse: original.showInverse,
          icon: original.icon,
          category: original.category,
          color: original.color,
          sourceEndpoint: { ...original.sourceEndpoint },
          targetEndpoint: { ...original.targetEndpoint },
        });

        this.snackBar.open(
          `✓ Duplicated relationship type: ${newType.name}`,
          'Close',
          {
            duration: 3000,
          }
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
