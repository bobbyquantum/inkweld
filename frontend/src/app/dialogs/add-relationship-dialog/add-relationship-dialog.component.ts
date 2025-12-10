import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';

import { Element, ElementType } from '../../../api-client';
import { RelationshipTypeDefinition } from '../../components/element-ref/element-ref.model';

/**
 * Data passed to the dialog
 */
export interface AddRelationshipDialogData {
  /** The source element (the element we're adding relationships FROM) */
  sourceElementId: string;
  /** The source element's schema type (e.g., 'CHARACTER', 'LOCATION') */
  sourceSchemaType?: string;
  /** Optional pre-selected relationship type */
  preselectedTypeId?: string;
}

/**
 * Result returned from the dialog
 */
export interface AddRelationshipDialogResult {
  /** The selected relationship type */
  relationshipTypeId: string;
  /** The target element ID */
  targetElementId: string;
  /** Optional note for the relationship */
  note?: string;
}

/**
 * Dialog for adding a new relationship to an element.
 *
 * Flow:
 * 1. Select relationship type from available types
 * 2. Search and select target element
 * 3. Optionally add a note
 * 4. Create the relationship
 */
@Component({
  selector: 'app-add-relationship-dialog',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
  ],
  templateUrl: './add-relationship-dialog.component.html',
  styleUrl: './add-relationship-dialog.component.scss',
})
export class AddRelationshipDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<AddRelationshipDialogComponent>);
  private data = inject<AddRelationshipDialogData>(MAT_DIALOG_DATA);
  private projectState = inject(ProjectStateService);
  private relationshipService = inject(RelationshipService);

  /** Form control for element search */
  elementSearchControl = new FormControl('');

  /** Selected relationship type */
  selectedTypeId = signal<string | null>(null);

  /** Selected target element */
  selectedElement = signal<Element | null>(null);

  /** Optional note */
  note = signal('');

  /** Search query for filtering elements */
  searchQuery = signal('');

  /** All available relationship types */
  availableTypes = computed(() => {
    const allTypes = this.relationshipService.allTypes();
    const sourceSchema = this.data.sourceSchemaType;

    // Filter types that allow the source schema
    return allTypes.filter(type => {
      // If no allowed schemas specified, allow all
      if (!type.sourceEndpoint?.allowedSchemas?.length) {
        return true;
      }
      // Check if source schema is allowed
      return (
        !sourceSchema ||
        type.sourceEndpoint.allowedSchemas.includes(sourceSchema)
      );
    });
  });

  /** Selected relationship type definition */
  selectedType = computed(() => {
    const typeId = this.selectedTypeId();
    if (!typeId) return null;
    return this.availableTypes().find(t => t.id === typeId) || null;
  });

  /** All elements in the project (for selection) */
  private allElements = computed(() => {
    return this.projectState.elements();
  });

  /** Filtered elements based on search and type constraints */
  filteredElements = computed(() => {
    const elements = this.allElements();
    const query = this.searchQuery().toLowerCase();
    const selectedType = this.selectedType();
    const sourceId = this.data.sourceElementId;

    return elements.filter(element => {
      // Don't show the source element itself
      if (element.id === sourceId) return false;

      // Filter by search query
      if (query && !element.name.toLowerCase().includes(query)) {
        return false;
      }

      // Filter by allowed target schemas
      if (selectedType?.targetEndpoint?.allowedSchemas?.length) {
        const elementSchema = this.getElementSchema(element);
        if (
          !selectedType.targetEndpoint.allowedSchemas.includes(elementSchema)
        ) {
          return false;
        }
      }

      return true;
    });
  });

  /** Whether the form is valid and can be submitted */
  canSubmit = computed(() => {
    return !!this.selectedTypeId() && !!this.selectedElement();
  });

  ngOnInit(): void {
    // Pre-select type if provided
    if (this.data.preselectedTypeId) {
      this.selectedTypeId.set(this.data.preselectedTypeId);
    }

    // Subscribe to search input changes
    this.elementSearchControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        this.searchQuery.set(value);
      }
    });
  }

  /**
   * Get the schema type for an element
   */
  getElementSchema(element: Element): string {
    // Map element type to schema type
    switch (element.type) {
      case ElementType.Character:
        return 'CHARACTER';
      case ElementType.Location:
        return 'LOCATION';
      case ElementType.Item:
        return 'ITEM';
      case ElementType.Folder:
        return 'FOLDER';
      case ElementType.WbItem:
        // For worldbuilding items, check metadata for schema type
        return element.metadata?.['schemaType'] || 'WB_ITEM';
      default:
        return 'ITEM';
    }
  }

  /**
   * Get icon for an element
   */
  getElementIcon(element: Element): string {
    switch (element.type) {
      case ElementType.Folder:
        return 'folder';
      case ElementType.Character:
        return 'person';
      case ElementType.Location:
        return 'place';
      case ElementType.Item:
        return 'description';
      case ElementType.WbItem:
        return 'auto_awesome';
      default:
        return 'link';
    }
  }

  /**
   * Get icon for a relationship type
   */
  getTypeIcon(type: RelationshipTypeDefinition): string {
    return type.icon || 'link';
  }

  /**
   * Handle relationship type selection
   */
  onTypeSelected(typeId: string): void {
    this.selectedTypeId.set(typeId);
    // Clear selected element when type changes (constraints may have changed)
    this.selectedElement.set(null);
    this.elementSearchControl.setValue('');
  }

  /**
   * Handle element selection from autocomplete
   */
  onElementSelected(event: MatAutocompleteSelectedEvent): void {
    const element = event.option.value as Element;
    this.selectedElement.set(element);
  }

  /**
   * Display function for autocomplete
   */
  displayElement(element: Element | null): string {
    return element?.name || '';
  }

  /**
   * Clear the selected element
   */
  clearSelectedElement(): void {
    this.selectedElement.set(null);
    this.elementSearchControl.setValue('');
  }

  /**
   * Submit the dialog and create the relationship
   */
  submit(): void {
    const typeId = this.selectedTypeId();
    const element = this.selectedElement();

    if (!typeId || !element) return;

    const result: AddRelationshipDialogResult = {
      relationshipTypeId: typeId,
      targetElementId: element.id,
      note: this.note() || undefined,
    };

    this.dialogRef.close(result);
  }

  /**
   * Cancel and close the dialog
   */
  cancel(): void {
    this.dialogRef.close(null);
  }
}
