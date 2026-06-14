import { effect, inject, Injectable, Injector } from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { ProjectStateService } from '@services/project/project-state.service';

/**
 * Route path for project pages. Matches the route config in app.routes.ts.
 */
const PROJECT_ROUTE_PATH = ':username/:slug';

/**
 * Custom title strategy that coordinates Angular router titles with the
 * dynamic project title set by ProjectComponent.
 *
 * Previously ProjectComponent used an effect to call Title.setTitle directly.
 * That created a race when navigating away from a project: the detached
 * component's effect could overwrite the new route's title, or the title
 * could be left at the static default "Inkweld" if route reuse prevented the
 * router from re-applying the route title.
 *
 * This strategy:
 * - Sets "Inkweld – {project name}" when the active route is a project route
 * - Falls back to route data titles for all other routes
 * - Reacts to project title changes while staying on a project route
 *
 * Note: ProjectStateService is resolved lazily via Injector to avoid a
 * circular dependency: Router injects TitleStrategy, and ProjectStateService
 * injects Router.
 */
@Injectable()
export class InkweldTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private isProjectRoute = false;

  constructor() {
    super();

    // Update the document title when the project changes while we are on a
    // project route (e.g. the user renames the project in settings).
    effect(() => {
      const projectState = this.injector.get(ProjectStateService);
      const project = projectState.project();
      if (project && this.isProjectRoute) {
        this.title.setTitle(`Inkweld \u2013 ${project.title}`);
      }
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const projectSnapshot = this.findProjectSnapshot(snapshot.root);
    this.isProjectRoute = projectSnapshot !== null;

    if (projectSnapshot) {
      const project = this.injector.get(ProjectStateService).project();
      if (project) {
        this.title.setTitle(`Inkweld \u2013 ${project.title}`);
        return;
      }
    }

    const title = this.buildTitle(snapshot);
    if (title !== undefined) {
      this.title.setTitle(title);
    }
  }

  /**
   * Walks the route snapshot tree to find the project route node.
   */
  private findProjectSnapshot(
    route: ActivatedRouteSnapshot
  ): ActivatedRouteSnapshot | null {
    if (route.routeConfig?.path === PROJECT_ROUTE_PATH) {
      return route;
    }

    for (const child of route.children) {
      const found = this.findProjectSnapshot(child);
      if (found) {
        return found;
      }
    }

    return null;
  }
}
