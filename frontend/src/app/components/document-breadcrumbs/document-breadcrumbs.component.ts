import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Element } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { BreadcrumbMenuComponent } from './breadcrumb-menu.component';

/**
 * A single segment in the breadcrumb trail.
 */
export interface BreadcrumbSegment {
  id: string;
  name: string;
  /** True when this segment represents the currently-open document/element (last segment). */
  isCurrent: boolean;
  /**
   * Parent id of this segment's element. The flyout for this segment lists
   * the children of `parentId` (i.e. this segment's siblings). `null` for the
   * root segment, which lists all top-level elements.
   */
  parentId: string | null;
  /**
   * Id of the next segment along the chain (the child of this segment on the
   * path to the current element). Passed as `currentBranchId` to the flyout
   * so the "you are here" row is highlighted. `null` for the last segment.
   */
  nextBranchId: string | null;
}

/**
 * Breadcrumb component that displays the folder path leading to the
 * currently-open document or element, e.g. "Part One › Chapter Two › Scene 3".
 *
 * Every segment except the last (current) is clickable: clicking it opens a
 * Material flyout listing that segment's siblings (children of its parent),
 * with folders expanding into nested submenus. Lets you jump anywhere in the
 * tree without back-tracking. The current/last segment stays static.
 *
 * Visibility is gated on the `showBreadcrumbs` user setting and only renders
 * when the element has at least one ancestor.
 */
@Component({
  selector: 'app-document-breadcrumbs',
  imports: [
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    BreadcrumbMenuComponent,
  ],
  templateUrl: './document-breadcrumbs.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './document-breadcrumbs.component.scss',
})
export class DocumentBreadcrumbsComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly settingsService = inject(SettingsService);

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
      parentId: el.parentId,
      nextBranchId: index < chain.length - 1 ? chain[index + 1].id : null,
    }));
  });

  /** Plain-text path used for tooltip / aria-label, e.g. "A › B › C". */
  readonly fullPath = computed(() =>
    this.segments()
      .map(s => s.name)
      .join(' › ')
  );

  /**
   * Whether the breadcrumb should render. Hidden when the user has disabled
   * breadcrumbs in settings or when the element is at the top level (no
   * folder path to display).
   */
  readonly visible = computed(
    () => this.settingsService.showBreadcrumbs() && this.segments().length > 1
  );
}
