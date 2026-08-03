import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  ViewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  type MatMenu,
  MatMenuModule,
  type MatMenuPanel,
} from '@angular/material/menu';
import { type Element, ElementType } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { TreeNodeIconComponent } from '../project-tree/components/tree-node-icon/tree-node-icon.component';

/**
 * A single row in the breadcrumb flyout menu.
 *
 * Folder rows open a nested submenu (their children); non-folder rows
 * navigate to that element on click.
 */
interface MenuRow {
  element: Element;
  isFolder: boolean;
  /** True when this row lies on the path to the currently-open element. */
  isCurrentBranch: boolean;
}

/**
 * Recursive Material menu used by {@link DocumentBreadcrumbsComponent} for the
 * "click a parent to jump elsewhere" flyout.
 *
 * The component renders one `<mat-menu>` whose items are the direct children
 * of `parentId` (or all top-level elements when `parentId` is null). Folder
 * rows declare a nested `[matMenuTriggerFor]` pointing at another instance of
 * this same component, giving arbitrarily deep submenus. Non-folder rows call
 * {@link ElementNavigationService.openElement} on click.
 *
 * `currentBranchId` is the id of the breadcrumb segment immediately after the
 * one that opened this menu — i.e. the child along the path to the currently
 * open element. It's used to highlight "where you are" inside the flyout.
 *
 * The recursion is bounded by the actual tree structure; a defensive
 * `visited` set is threaded through to guard against malformed cyclic
 * `parentId` chains, though `ElementTreeService` already prevents those.
 */
@Component({
  selector: 'app-breadcrumb-menu',
  exportAs: 'appBreadcrumbMenu',
  imports: [
    MatIconModule,
    MatMenuModule,
    TreeNodeIconComponent,
    forwardRef(() => BreadcrumbMenuComponent),
    TranslocoModule,
  ],
  template: `
    <mat-menu #menu="matMenu" class="breadcrumb-flyout-menu">
      @for (row of rows(); track row.element.id) {
        @if (row.isFolder) {
          <button
            mat-menu-item
            [matMenuTriggerFor]="childMenu.menu"
            [class.current-branch]="row.isCurrentBranch"
            [attr.data-testid]="'breadcrumb-flyout-row-' + row.element.id"
            [attr.aria-haspopup]="true">
            <app-tree-node-icon
              [isExpandable]="true"
              [isExpanded]="false"
              [type]="row.element.type"
              [schemaId]="row.element.schemaId"
              [metadata]="row.element.metadata" />
            <span>{{ row.element.name || ('untitled' | transloco) }}</span>
            <mat-icon class="breadcrumb-flyout-chevron" matMenuIcon>
              chevron_right
            </mat-icon>
          </button>
          <app-breadcrumb-menu
            #childMenu="appBreadcrumbMenu"
            [parentId]="row.element.id"
            [currentBranchId]="nextBranchIdFor(row.element.id)"
            [visited]="visitedWithCurrentParent()" />
        } @else {
          <button
            mat-menu-item
            (click)="openElement(row.element)"
            [class.current-branch]="row.isCurrentBranch"
            [attr.data-testid]="'breadcrumb-flyout-row-' + row.element.id">
            <app-tree-node-icon
              [isExpandable]="false"
              [type]="row.element.type"
              [schemaId]="row.element.schemaId"
              [metadata]="row.element.metadata" />
            <span>{{ row.element.name || ('untitled' | transloco) }}</span>
          </button>
        }
      } @empty {
        <div class="breadcrumb-flyout-empty" mat-menu-item disabled>
          <app-tree-node-icon
            [isExpandable]="true"
            [isExpanded]="false"
            [type]="ElementType.Folder" />
          <span>{{ 'emptyFolder' | transloco }}</span>
        </div>
      }
    </mat-menu>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './breadcrumb-menu.component.scss',
})
export class BreadcrumbMenuComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly navigation = inject(ElementNavigationService);

  /**
   * The parent id whose direct children this menu lists. `null` lists
   * top-level (root) elements.
   */
  readonly parentId = input<string | null>(null);

  /**
   * Element id of the segment along the path to the currently-open element
   * at this menu's depth. Used to mark the "you are here" row. May be null
   * when the menu isn't on the current branch.
   */
  readonly currentBranchId = input<string | null>(null);

  /**
   * Set of ancestor parent ids already visited up the recursion chain.
   * Prevents infinite render in the face of cyclic `parentId` data.
   */
  readonly visited = input<ReadonlySet<string>>(new Set());

  /** Reference to this component's inner `<mat-menu>` directive instance. */
  @ViewChild('menu', { static: true }) menuRef?: MatMenu;

  /**
   * Public accessor used by parent menus to bind `[matMenuTriggerFor]` to
   * this component's inner `MatMenu` panel via the template variable
   * `#childMenu="appBreadcrumbMenu"` -> `childMenu.menu`.
   */
  get menu(): MatMenuPanel | null {
    return this.menuRef ?? null;
  }

  /** ElementType enum exposed for template use. */
  protected readonly ElementType = ElementType;

  /**
   * Direct children of `parentId`, sorted by their `order` field, mapped to
   * {@link MenuRow}s. Empty (and safe) when the parent has no children or when
   * `parentId` is in the `visited` set (cycle guard).
   */
  readonly rows = computed<MenuRow[]>(() => {
    const parent = this.parentId();
    const seen = this.visited();
    if (parent !== null && seen.has(parent)) return [];

    const elements = this.projectState.elements();
    const children = elements
      .filter(el => el.parentId === parent)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const branchId = this.currentBranchId();
    return children.map(el => ({
      element: el,
      isFolder: el.type === ElementType.Folder,
      isCurrentBranch: branchId === el.id,
    }));
  });

  /**
   * Open a non-folder element in a tab and navigate to it. Material closes
   * the menu chain automatically on click.
   */
  openElement(element: Element): void {
    this.navigation.openElement(element);
  }

  /**
   * Returns the id of the next segment along the current-branch path within
   * the subtree of `elementId`, or null if `elementId` isn't on the current
   * branch.
   *
   * Used to thread `currentBranchId` into nested menus so the highlight
   * follows the user down the tree.
   */
  nextBranchIdFor(elementId: string): string | null {
    const branch = this.currentBranchId();
    if (!branch) return null;
    if (elementId === branch) return null;

    const elements = this.projectState.elements();
    const map = new Map<string, Element>(elements.map(el => [el.id, el]));

    // Walk from branch up to elementId; the child of elementId on that path
    // is what we want.
    let cursor: Element | undefined = map.get(branch);
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      if (cursor.parentId === elementId) return cursor.id;
      cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    }
    return null;
  }

  /**
   * Returns a new visited set with this level's own `parentId` added, for
   * passing to nested menus. Immutable so Angular change detection sees a
   * fresh reference.
   */
  visitedWithCurrentParent(): ReadonlySet<string> {
    const next = new Set(this.visited());
    const parent = this.parentId();
    if (parent !== null) next.add(parent);
    return next;
  }
}
