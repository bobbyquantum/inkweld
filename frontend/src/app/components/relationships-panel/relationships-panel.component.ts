import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  ElementRelationship,
  RelationshipService,
} from '@services/relationship';

import { Element, ElementType } from '../../../api-client';
import {
  AddRelationshipDialogComponent,
  AddRelationshipDialogData,
  AddRelationshipDialogResult,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
import { RelationshipTypeDefinition } from '../element-ref/element-ref.model';
import { ElementRefService } from '../element-ref/element-ref.service';
import { ElementRefTooltipData } from '../element-ref/element-ref-tooltip/element-ref-tooltip.component';

/**
 * Grouped relationships by type for display
 */
interface RelationshipGroup {
  /** The relationship type definition */
  type: RelationshipTypeDefinition;
  /** Relationships in this group */
  relationships: ElementRelationship[];
  /** Whether these are incoming (backlinks) or outgoing */
  isIncoming: boolean;
  /** Display label (type name or inverse label) */
  displayLabel: string;
}

/**
 * Panel component for displaying relationships (backlinks and outgoing refs)
 * for the current document or element.
 *
 * Relationships are grouped by type, with each type as an expandable panel.
 */
@Component({
  selector: 'app-relationships-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatExpansionModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './relationships-panel.component.html',
  styleUrl: './relationships-panel.component.scss',
})
export class RelationshipsPanelComponent {
  /** Document ID to show relationships for */
  documentId = input.required<string>();

  /** Optional specific element ID (for worldbuilding elements) */
  elementId = input<string | null>(null);

  /** Loading state */
  loading = signal(false);

  /** Error message */
  error = signal<string | null>(null);

  /** Track which panels are expanded */
  expandedPanels = signal<Set<string>>(new Set());

  private relationshipService = inject(RelationshipService);
  private projectState = inject(ProjectStateService);
  private elementRefService = inject(ElementRefService);
  private dialog = inject(MatDialog);

  /** All relationships from the service */
  private allRelationships = computed(() => {
    return this.relationshipService.relationships();
  });

  /** The effective element ID (elementId or documentId) */
  private effectiveElementId = computed(() => {
    return this.elementId() || this.documentId();
  });

  /** Outgoing relationships (from this element to others) */
  outgoingRelationships = computed(() => {
    const targetId = this.effectiveElementId();
    return this.allRelationships().filter(
      (r: ElementRelationship) => r.sourceElementId === targetId
    );
  });

  /** Incoming relationships (backlinks from other elements) */
  incomingRelationships = computed(() => {
    const targetId = this.effectiveElementId();
    return this.allRelationships().filter(
      (r: ElementRelationship) => r.targetElementId === targetId
    );
  });

  /** All relationship types */
  private allTypes = computed(() => this.relationshipService.allTypes());

  /**
   * Relationships grouped by type for display.
   * Outgoing relationships show the type name.
   * Incoming relationships show the inverse label.
   */
  groupedRelationships = computed(() => {
    const outgoing = this.outgoingRelationships();
    const incoming = this.incomingRelationships();
    const types = this.allTypes();
    const groups: RelationshipGroup[] = [];

    // Group outgoing relationships by type
    const outgoingByType = new Map<string, ElementRelationship[]>();
    for (const rel of outgoing) {
      const typeId = rel.relationshipTypeId;
      if (!outgoingByType.has(typeId)) {
        outgoingByType.set(typeId, []);
      }
      outgoingByType.get(typeId)!.push(rel);
    }

    // Create groups for outgoing
    for (const [typeId, rels] of outgoingByType) {
      const typeDef = types.find(t => t.id === typeId);
      if (typeDef) {
        groups.push({
          type: typeDef,
          relationships: rels,
          isIncoming: false,
          displayLabel: typeDef.name,
        });
      }
    }

    // Group incoming relationships by type
    const incomingByType = new Map<string, ElementRelationship[]>();
    for (const rel of incoming) {
      const typeId = rel.relationshipTypeId;
      const typeDef = types.find(t => t.id === typeId);
      // Only show incoming if showInverse is true
      if (typeDef?.showInverse !== false) {
        if (!incomingByType.has(typeId)) {
          incomingByType.set(typeId, []);
        }
        incomingByType.get(typeId)!.push(rel);
      }
    }

    // Create groups for incoming (backlinks)
    for (const [typeId, rels] of incomingByType) {
      const typeDef = types.find(t => t.id === typeId);
      if (typeDef) {
        groups.push({
          type: typeDef,
          relationships: rels,
          isIncoming: true,
          displayLabel: typeDef.inverseLabel || `${typeDef.name} (backlink)`,
        });
      }
    }

    // Sort groups: outgoing first, then by display label
    groups.sort((a, b) => {
      if (a.isIncoming !== b.isIncoming) {
        return a.isIncoming ? 1 : -1;
      }
      return a.displayLabel.localeCompare(b.displayLabel);
    });

    return groups;
  });

  /** Count of outgoing relationships */
  outgoingCount = computed(() => this.outgoingRelationships().length);

  /** Count of incoming relationships (backlinks) */
  incomingCount = computed(() => this.incomingRelationships().length);

  /** Total relationship count */
  totalCount = computed(() => this.outgoingCount() + this.incomingCount());

  /** Elements map for resolving names */
  private elements = computed(() => {
    return this.projectState.elements();
  });

  /** The current element (for getting schema type) */
  private currentElement = computed(() => {
    const id = this.effectiveElementId();
    return this.elements().find(e => e.id === id);
  });

  /**
   * Extract the element ID from a documentId or elementId
   * DocumentIds are formatted as "username:slug:elementId"
   */
  private extractElementId(id: string): string {
    const parts = id.split(':');
    // If it has 3 parts, it's a documentId - return the last part (element ID)
    if (parts.length === 3) {
      return parts[2];
    }
    // Otherwise assume it's already just the element ID
    return id;
  }

  /**
   * Get element by ID (handles both documentId format and plain element ID)
   */
  getElement(elementId: string): Element | undefined {
    const actualElementId = this.extractElementId(elementId);
    return this.elements().find((e: Element) => e.id === actualElementId);
  }

  /**
   * Get display name for an element by ID
   */
  getElementName(elementId: string): string {
    const element = this.getElement(elementId);
    return element?.name || 'Unknown';
  }

  /**
   * Get icon for an element by ID
   */
  getElementIcon(elementId: string): string {
    const element = this.getElement(elementId);
    if (!element) return 'link';

    // Use ElementRefService to get the appropriate icon
    return this.elementRefService.getElementIcon(element);
  }

  /**
   * Get the schema ID for an element.
   * For WORLDBUILDING elements, returns the schemaId.
   * For other elements, returns the element type.
   */
  private getElementSchema(element: Element): string {
    if (element.type === ElementType.Worldbuilding && element.schemaId) {
      return element.schemaId;
    }
    return element.type;
  }

  /**
   * Get a unique key for a relationship group
   */
  getGroupKey(group: RelationshipGroup): string {
    return `${group.type.id}-${group.isIncoming ? 'in' : 'out'}`;
  }

  /**
   * Navigate to the referenced element
   */
  navigateToElement(
    relationship: ElementRelationship,
    isIncoming: boolean
  ): void {
    const targetId = isIncoming
      ? relationship.sourceElementId
      : relationship.targetElementId;

    // Find the element and open it
    const element = this.getElement(targetId);
    if (element) {
      this.projectState.openDocument(element);
    }
  }

  /**
   * Open the add relationship dialog
   */
  openAddRelationshipDialog(): void {
    const currentElement = this.currentElement();
    const sourceSchema = currentElement
      ? this.getElementSchema(currentElement)
      : undefined;

    const dialogData: AddRelationshipDialogData = {
      sourceElementId: this.effectiveElementId(),
      sourceSchemaType: sourceSchema,
    };

    const dialogRef = this.dialog.open(AddRelationshipDialogComponent, {
      data: dialogData,
      width: '500px',
      maxWidth: '90vw',
    });

    dialogRef
      .afterClosed()
      .subscribe((result: AddRelationshipDialogResult | null) => {
        if (result) {
          // Create the relationship
          this.relationshipService.addRelationship(
            this.effectiveElementId(),
            result.targetElementId,
            result.relationshipTypeId,
            { note: result.note }
          );
        }
      });
  }

  /**
   * Delete a relationship
   */
  deleteRelationship(
    relationship: ElementRelationship,
    event: MouseEvent
  ): void {
    event.stopPropagation();
    this.relationshipService.removeRelationship(relationship.id);
  }

  /**
   * Refresh relationships list
   */
  refresh(): void {
    // Force re-evaluation by triggering a change detection
    // The computed signals will automatically update
  }

  /**
   * Show tooltip for an element on hover
   */
  showTooltipForElement(elementId: string, event: MouseEvent): void {
    const element = this.getElement(elementId);
    if (!element) return;

    // Use currentTarget to get the list item, not the child element that triggered the event
    const listItem = event.currentTarget as HTMLElement;
    const rect = listItem.getBoundingClientRect();
    const tooltipData: ElementRefTooltipData = {
      elementId: element.id,
      elementType: element.type,
      displayText: element.name,
      originalName: element.name,
      position: {
        x: rect.left,
        y: rect.bottom + 4,
      },
    };

    this.elementRefService.showTooltip(tooltipData);
  }

  /**
   * Hide tooltip on mouse leave
   */
  hideTooltip(): void {
    this.elementRefService.hideTooltip();
  }
}
