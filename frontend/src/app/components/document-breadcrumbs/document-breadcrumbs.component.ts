import { Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Element } from '@inkweld/index';
import { ProjectStateService } from '@services/project/project-state.service';

/**
 * A single segment in the breadcrumb trail.
 */
export interface BreadcrumbSegment {
  id: string;
  name: string;
  /** True when this segment represents the currently-open document/element (last segment). */
  isCurrent: boolean;
}

/**
 * Breadcrumb component that displays the folder path leading to the
 * currently-open document or element, e.g. "Part One › Chapter Two › Scene 3".
 *
 * Folder segments are clickable: clicking expands the folder (and all of its
 * ancestors) in the project tree so the user can quickly reveal the location
 * of the current document.
 */
@Component({
  selector: 'app-document-breadcrumbs',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './document-breadcrumbs.component.html',
  styleUrl: './document-breadcrumbs.component.scss',
})
export class DocumentBreadcrumbsComponent {
  private readonly projectState = inject(ProjectStateService);

  /** Element id of the currently-open document/element (NOT the username:slug:id form). */
  readonly elementId = input.required<string>();

  /**
   * Ordered list of breadcrumb segments from the topmost ancestor down to the
   * currently-open element. Empty when the element cannot be found.
   */
  readonly segments = computed<BreadcrumbSegment[]>(() => {
    const id = this.elementId();
    if (!id) return [];

    const elements = this.projectState.elements();
    const map = new Map<string, Element>(elements.map(el => [el.id, el]));
    const current = map.get(id);
    if (!current) return [];

    const chain: Element[] = [];
    let cursor: Element | undefined = current;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    }

    return chain.map((el, index) => ({
      id: el.id,
      name: el.name || 'Untitled',
      isCurrent: index === chain.length - 1,
    }));
  });

  /** Plain-text path used for tooltip / aria-label, e.g. "A › B › C". */
  readonly fullPath = computed(() =>
    this.segments()
      .map(s => s.name)
      .join(' › ')
  );

  /**
   * Reveal a folder segment in the project tree by expanding it and all of
   * its ancestors. The current element segment is not interactive.
   */
  protected onSegmentClick(segmentId: string): void {
    const elements = this.projectState.elements();
    const map = new Map<string, Element>(elements.map(el => [el.id, el]));
    let cursor: Element | undefined = map.get(segmentId);
    while (cursor) {
      this.projectState.setExpanded(cursor.id, true);
      cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    }
  }
}
