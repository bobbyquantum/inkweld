import { Component, computed, inject, Input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Element, ElementType } from '@inkweld/index';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';

/**
 * Breadcrumbs component that displays the hierarchical path to the current element.
 *
 * Shows the folder hierarchy leading to the currently open document/element,
 * with clickable links to navigate to parent folders.
 *
 * @example
 * <app-breadcrumbs [elementId]="currentElementId"></app-breadcrumbs>
 */
@Component({
  selector: 'app-breadcrumbs',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './breadcrumbs.component.html',
  styleUrls: ['./breadcrumbs.component.scss'],
})
export class BreadcrumbsComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly elementTreeService = inject(ElementTreeService);

  /** The ID of the current element (format: username:slug:elementId or just elementId) */
  private readonly elementIdSignal = signal<string>('');

  @Input()
  set elementId(value: string) {
    this.elementIdSignal.set(value);
  }

  /**
   * Computed signal that builds the breadcrumb path from root to current element.
   * Returns elements in order from root to current element.
   */
  readonly breadcrumbPath = computed<Element[]>(() => {
    const fullId = this.elementIdSignal();
    if (!fullId) return [];

    // Extract the element ID (handle both full format and simple ID)
    const parts = fullId.split(':');
    const elementId = parts.length === 3 ? parts[2] : fullId;
    if (!elementId) return [];

    const elements = this.projectState.elements();
    const elementIndex = elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return [];

    const currentElement = elements[elementIndex];

    // Get ancestors from immediate parent to root
    const ancestors = this.elementTreeService.getAncestors(
      elements,
      elementIndex
    );

    // Reverse to get root-to-current order, then add current element
    return [...ancestors.reverse(), currentElement];
  });

  /**
   * Check if we should show breadcrumbs (need at least 2 items - parent + current)
   */
  readonly showBreadcrumbs = computed(() => this.breadcrumbPath().length > 1);

  /**
   * Get icon for an element type
   */
  getElementIcon(element: Element): string {
    if (element.type === ElementType.Folder) {
      return 'folder';
    }
    if (element.type === ElementType.Item) {
      return 'description';
    }
    // Check for custom icon in metadata
    if (element.metadata?.['icon']) {
      return element.metadata['icon'] as string;
    }
    // Default icons for built-in worldbuilding types
    switch (element.type) {
      case ElementType.Character:
        return 'person';
      case ElementType.Location:
        return 'place';
      case ElementType.WbItem:
        return 'category';
      default:
        return 'article';
    }
  }

  /**
   * Navigate to an element by opening it in a tab
   */
  navigateToElement(element: Element, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.projectState.openDocument(element);
  }

  /**
   * Check if an element is the last one (current document)
   */
  isLast(element: Element): boolean {
    const path = this.breadcrumbPath();
    return path.length > 0 && path[path.length - 1].id === element.id;
  }
}
