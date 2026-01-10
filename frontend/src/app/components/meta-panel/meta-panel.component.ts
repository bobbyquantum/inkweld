import {
  AccordionContent,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
} from '@angular/aria/accordion';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  ElementRelationship,
  RelationshipService,
  RelationshipTypeDefinition,
} from '@services/relationship';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

import { Element, ElementType } from '../../../api-client';
import {
  AddRelationshipDialogComponent,
  AddRelationshipDialogData,
  AddRelationshipDialogResult,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
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
 * Meta panel with accordion sections for document metadata.
 * Includes relationship type panels and is extensible for future sections.
 * Toggle button is in the parent editor toolbar.
 */
@Component({
  selector: 'app-meta-panel',
  standalone: true,
  imports: [
    AccordionGroup,
    AccordionTrigger,
    AccordionPanel,
    AccordionContent,
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './meta-panel.component.html',
  styleUrl: './meta-panel.component.scss',
})
export class MetaPanelComponent {
  /** Document ID for snapshots and relationships */
  documentId = input.required<string>();

  /** Current element ID for relationships panel */
  elementId = input<string | null>(null);

  /** Whether the panel is open */
  isOpen = input<boolean>(false);

  /** Event emitted when panel open state changes */
  openChange = output<boolean>();

  /** Whether the panel is expanded (showing full content) vs collapsed (showing icons) */
  isExpanded = signal(false);

  private relationshipService = inject(RelationshipService);
  private projectState = inject(ProjectStateService);
  private elementRefService = inject(ElementRefService);
  private worldbuildingService = inject(WorldbuildingService);
  private dialog = inject(MatDialog);

  /** The effective element ID (elementId or documentId) */
  private effectiveElementId = computed(() => {
    return this.elementId() || this.documentId();
  });

  /**
   * The normalized element ID for relationship matching.
   * Extracts the element ID from documentId format (username:slug:elementId).
   */
  private normalizedElementId = computed(() => {
    const id = this.effectiveElementId();
    return this.extractElementId(id ?? '');
  });

  /** All relationships from the service */
  private allRelationships = computed(() => {
    return this.relationshipService.relationships();
  });

  /** Outgoing relationships (from this element to others) */
  private outgoingRelationships = computed(() => {
    const targetId = this.normalizedElementId();
    return this.allRelationships().filter(
      (r: ElementRelationship) => r.sourceElementId === targetId
    );
  });

  /** Incoming relationships (backlinks from other elements) */
  private incomingRelationships = computed(() => {
    const targetId = this.normalizedElementId();
    return this.allRelationships().filter(
      (r: ElementRelationship) => r.targetElementId === targetId
    );
  });

  /** Count of outgoing relationships */
  outgoingCount = computed(() => this.outgoingRelationships().length);

  /** Count of incoming relationships */
  incomingCount = computed(() => this.incomingRelationships().length);

  /** Total count of all relationships */
  totalRelationshipsCount = computed(
    () => this.outgoingCount() + this.incomingCount()
  );

  /** All relationship types */
  private allTypes = computed(() => this.relationshipService.allTypes());

  /** Elements map for resolving names */
  private elements = computed(() => {
    return this.projectState.elements();
  });

  /** The current element (for getting schema type) */
  private currentElement = computed(() => {
    const id = this.effectiveElementId();
    return this.elements().find(e => e.id === this.extractElementId(id));
  });

  /**
   * Relationships grouped by type for display.
   * Each group becomes its own expansion panel.
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

  /** Whether there are any relationships */
  hasRelationships = computed(() => this.groupedRelationships().length > 0);

  /**
   * Extract the element ID from a documentId or elementId
   */
  private extractElementId(id: string): string {
    const parts = id.split(':');
    if (parts.length === 3) {
      return parts[2];
    }
    return id;
  }

  /**
   * Get element by ID
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
   * Get icon for an element by ID.
   * For Worldbuilding elements, looks up the schema icon.
   */
  getElementIcon(elementId: string): string {
    const element = this.getElement(elementId);
    if (!element) return 'link';

    switch (element.type) {
      case ElementType.Folder:
        return 'folder';
      case ElementType.Item:
        return 'description';
      case ElementType.Worldbuilding:
        // Look up schema icon for worldbuilding elements
        if (element.schemaId) {
          const schema = this.worldbuildingService.getSchemaById(
            element.schemaId
          );
          if (schema?.icon) {
            return schema.icon;
          }
        }
        return 'category';
      default:
        return 'link';
    }
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

    const element = this.getElement(targetId);
    if (element) {
      this.projectState.openDocument(element);
    }
  }

  /**
   * Get enhanced tooltip for a relationship group.
   * Shows the relationship type label and up to 3 element names,
   * plus "and X more..." if there are additional elements.
   */
  getGroupTooltip(group: RelationshipGroup): string {
    const maxToShow = 3;
    const elementNames = group.relationships.slice(0, maxToShow).map(rel => {
      const targetId = group.isIncoming
        ? rel.sourceElementId
        : rel.targetElementId;
      return this.getElementName(targetId);
    });

    const remaining = group.relationships.length - maxToShow;
    let tooltip = `${group.displayLabel}:\n${elementNames.join('\n')}`;

    if (remaining > 0) {
      tooltip += `\n...and ${remaining} more`;
    }

    return tooltip;
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
   * Show tooltip for an element on hover
   */
  showTooltipForElement(elementId: string, event: MouseEvent): void {
    const element = this.getElement(elementId);
    if (!element) return;

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

  /**
   * Toggle the panel open/closed state
   */
  toggle(): void {
    this.openChange.emit(!this.isOpen());
  }

  /**
   * Open the panel
   */
  open(): void {
    if (!this.isOpen()) {
      this.openChange.emit(true);
    }
  }

  /**
   * Close the panel
   */
  close(): void {
    if (this.isOpen()) {
      this.openChange.emit(false);
    }
  }

  /**
   * Toggle between expanded and collapsed states
   */
  toggleExpanded(): void {
    this.isExpanded.set(!this.isExpanded());
  }

  /**
   * Get a summary text for the relationships tooltip
   */
  getRelationshipsSummary(): string {
    const total = this.totalRelationshipsCount();
    if (total === 0) {
      return 'No relationships';
    }
    const outgoing = this.outgoingCount();
    const incoming = this.incomingCount();
    const parts: string[] = [];
    if (outgoing > 0) {
      parts.push(`${outgoing} outgoing`);
    }
    if (incoming > 0) {
      parts.push(`${incoming} incoming`);
    }
    return parts.join(', ');
  }
}
