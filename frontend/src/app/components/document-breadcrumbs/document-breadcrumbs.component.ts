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
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { ElementTreeMenuComponent } from '../element-tree-menu/element-tree-menu.component';

/**
 * Synthetic id used for the virtual project-name root segment. It is not a real
 * element id; it only distinguishes the root from actual tree elements so the
 * template can render it (and its flyout) consistently.
 */
export const PROJECT_ROOT_ID = '__project__';

/**
 * A single segment in the breadcrumb trail.
 */
export interface BreadcrumbSegment {
  id: string;
  name: string;
  /** True when this segment represents the currently-open document/element (last segment). */
  isCurrent: boolean;
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
 * Material flyout listing that segment's children, with folders expanding
 * into nested submenus. Lets you jump anywhere in the tree without
 * back-tracking. The current/last segment stays static.
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
    TranslocoModule,
    ElementTreeMenuComponent,
  ],
  templateUrl: './document-breadcrumbs.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './document-breadcrumbs.component.scss',
})
export class DocumentBreadcrumbsComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly settingsService = inject(SettingsService);
  private readonly transloco = inject(TranslocoService);

  /** Synthetic id of the virtual project-name root segment. */
  protected readonly projectRootId = PROJECT_ROOT_ID;

  /** Element id of the currently-open document/element (NOT the username:slug:id form). */
  readonly elementId = input.required<string>();

  /**
   * Ordered list of breadcrumb segments from the virtual project-name root
   * down to the currently-open element. Empty when the element cannot be found.
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

    const projectName =
      this.projectState.project()?.title ||
      this.transloco.translate<string>('project.breadcrumbs.untitledProject');
    const untitled = this.transloco.translate<string>('untitled');
    const segments: BreadcrumbSegment[] = [
      {
        id: PROJECT_ROOT_ID,
        name: projectName,
        isCurrent: false,
        nextBranchId: chain[0]?.id ?? null,
      },
    ];

    chain.forEach((el, index) => {
      segments.push({
        id: el.id,
        name: el.name || untitled,
        isCurrent: index === chain.length - 1,
        nextBranchId: index < chain.length - 1 ? chain[index + 1].id : null,
      });
    });

    return segments;
  });

  /** Plain-text path used for tooltip / aria-label, e.g. "A › B › C". */
  readonly fullPath = computed(() =>
    this.segments()
      .map(s => s.name)
      .join(' › ')
  );

  /**
   * Whether the breadcrumb should render. Hidden when the user has disabled
   * breadcrumbs in settings or when the element cannot be found.
   */
  readonly visible = computed(
    () => this.settingsService.showBreadcrumbs() && this.segments().length > 1
  );
}
