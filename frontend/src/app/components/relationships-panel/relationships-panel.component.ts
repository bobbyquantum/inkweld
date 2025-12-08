import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  ElementRelationship,
  RelationshipService,
} from '@services/relationship';

import { Element, ElementType } from '../../../api-client';
import { ElementRefService } from '../element-ref/element-ref.service';
import { ElementRefTooltipData } from '../element-ref/element-ref-tooltip/element-ref-tooltip.component';

/**
 * Panel component for displaying relationships (backlinks and outgoing refs)
 * for the current document or element.
 */
@Component({
  selector: 'app-relationships-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
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

  private relationshipService = inject(RelationshipService);
  private projectState = inject(ProjectStateService);
  private elementRefService = inject(ElementRefService);

  /** All relationships from the service */
  private allRelationships = computed(() => {
    return this.relationshipService.relationships();
  });

  /** Outgoing relationships (from this element to others) */
  outgoingRelationships = computed(() => {
    const targetId = this.elementId() || this.documentId();
    return this.allRelationships().filter(
      (r: ElementRelationship) => r.sourceElementId === targetId
    );
  });

  /** Incoming relationships (backlinks from other elements) */
  incomingRelationships = computed(() => {
    const targetId = this.elementId() || this.documentId();
    return this.allRelationships().filter(
      (r: ElementRelationship) => r.targetElementId === targetId
    );
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

  /**
   * Get element by ID
   */
  getElement(elementId: string): Element | undefined {
    return this.elements().find((e: Element) => e.id === elementId);
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

    // Map element types to icons
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
   * Get relationship type display name
   */
  getRelationshipTypeName(type: string): string {
    // Try to find custom type first
    const customTypes = this.relationshipService.customRelationshipTypes();
    const customType = customTypes.find(t => t.id === type);
    if (customType) {
      return customType.label;
    }

    // Default types
    switch (type) {
      case 'references':
        return 'References';
      case 'mentioned-in':
        return 'Mentioned in';
      case 'related-to':
        return 'Related to';
      default:
        return type;
    }
  }

  /**
   * Navigate to the referenced element
   */
  navigateToElement(
    relationship: ElementRelationship,
    isOutgoing: boolean
  ): void {
    const targetId = isOutgoing
      ? relationship.targetElementId
      : relationship.sourceElementId;

    // Find the element and open it
    const elements = this.elements();
    const element = elements.find((e: Element) => e.id === targetId);
    if (element) {
      this.projectState.openDocument(element);
    }
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
