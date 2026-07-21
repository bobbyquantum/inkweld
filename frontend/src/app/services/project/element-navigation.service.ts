import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import type { Element, ElementType } from '@inkweld/index';

import { isWorldbuildingType } from '../../utils/worldbuilding.utils';
import { ProjectStateService } from './project-state.service';

/**
 * Maps an element's type to the route segment used in project URLs, e.g.
 * `/:username/:slug/<typeRoute>/:elementId`.
 *
 * Folders -> `folder`, worldbuilding elements -> `worldbuilding`, and so on.
 * Anything else (regular documents/items) falls back to `document`.
 */
export function typeRouteForElement(type: ElementType | string): string {
  const t = String(type);
  if (t === 'FOLDER') return 'folder';
  if (t === 'RELATIONSHIP_CHART') return 'relationship-chart';
  if (t === 'CANVAS') return 'canvas';
  if (t === 'TIMELINE') return 'timeline';
  if (isWorldbuildingType(t)) return 'worldbuilding';
  return 'document';
}

/**
 * Single source of truth for "open this element in a tab and navigate to its
 * route". Previously this logic was duplicated in at least four places
 * (project-tree, project component, home tab, breadcrumb flyout).
 *
 * Calling `openElement` performs both halves atomically:
 *   1. registers the element as an open tab via `ProjectStateService.openDocument`
 *   2. navigates the router to `/:username/:slug/<typeRoute>/:elementId`
 *
 * If no project is loaded the navigation step is skipped (the tab is still
 * opened) so callers don't need to defensively guard for project presence
 * themselves.
 */
@Injectable({ providedIn: 'root' })
export class ElementNavigationService {
  private readonly projectState = inject(ProjectStateService);
  private readonly router = inject(Router);

  /**
   * Open `element` in a tab and navigate to its route. No-op when `element`
   * has no id. Navigation is skipped (but the tab is still opened) when no
   * project is loaded into `ProjectStateService`.
   */
  openElement(element: Element): void {
    if (!element?.id) return;

    this.projectState.openDocument(element);

    const project = this.projectState.project();
    if (!project?.username || !project?.slug) return;

    const typeRoute = typeRouteForElement(element.type);
    void this.router.navigate([
      '/',
      project.username,
      project.slug,
      typeRoute,
      element.id,
    ]);
  }
}
