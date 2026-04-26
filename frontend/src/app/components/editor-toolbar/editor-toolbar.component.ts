import {
  Toolbar,
  ToolbarWidget,
  ToolbarWidgetGroup,
} from '@angular/aria/toolbar';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  EventEmitter,
  Input,
  NgZone,
  type OnDestroy,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Editor } from '@bobbyquantum/ngx-editor';
import { toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { type MarkType, type NodeType } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import { type EditorState, type Transaction } from 'prosemirror-state';
import { type EditorView } from 'prosemirror-view';
import { type Subscription } from 'rxjs';

type Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean;

/**
 * Text alignment types supported by the editor
 */
type TextAlign = 'left' | 'center' | 'right' | 'justify';

/**
 * Heading levels supported by the editor (1-6)
 */
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Identifies a toolbar group by name.
 * Groups are hidden from the main toolbar row and moved to the overflow menu
 * in reverse priority order (last groups overflow first).
 */
export type ToolbarGroupName =
  | 'formatting'
  | 'heading'
  | 'alignment'
  | 'lists'
  | 'insert'
  | 'history';

/**
 * Custom Angular Material toolbar for ngx-editor / ProseMirror.
 * Replaces the default ngx-editor-menu with Material Design components.
 *
 * Overflow behaviour: when the toolbar is too narrow to show all groups on a
 * single row, lower-priority groups are hidden and their controls are
 * accessible via a "more" (▾) dropdown button.
 */
@Component({
  selector: 'app-editor-toolbar',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    Toolbar,
    ToolbarWidget,
    ToolbarWidgetGroup,
  ],
  templateUrl: './editor-toolbar.component.html',
  styleUrl: './editor-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorToolbarComponent implements AfterViewInit, OnDestroy {
  /** The ngx-editor Editor instance */
  @Input({ required: true }) editor!: Editor;

  /** Whether all editing actions should be disabled (read-only mode) */
  @Input() disabled = false;

  /** Whether the comment panel is currently open */
  @Input() commentPanelOpen = false;

  /** Emitted when the insert image button is clicked */
  @Output() insertImageClick = new EventEmitter<void>();

  /** Emitted when the insert/edit link button is clicked */
  @Output() insertLinkClick = new EventEmitter<void>();

  /** Emitted when the comment toggle button is clicked */
  @Output() toggleComments = new EventEmitter<void>();

  /** Reference to the toolbar host element */
  @ViewChild('toolbarEl', { static: true }) toolbarEl!: ElementRef<HTMLElement>;

  /** Platform-aware tooltip for the comments button */
  commentTooltip = /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? 'Comments (\u2318+\u2325+M to add)'
    : 'Comments (Ctrl+Alt+M to add)';

  /** Signal for tracking the current selection state */
  private readonly selectionState = signal({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    link: false,
    heading: 0,
    align: 'left',
    bulletList: false,
    orderedList: false,
    blockquote: false,
  });

  /**
   * Set of toolbar group names that have been pushed into the overflow menu
   * because they didn't fit on the main row.
   */
  readonly overflowGroups = signal<Set<ToolbarGroupName>>(new Set());

  /** True when at least one group has overflowed */
  readonly hasOverflow = computed(() => this.overflowGroups().size > 0);

  /** Subscription to editor state changes */
  private stateSubscription?: Subscription;

  /** Debounce timer for state updates */
  private updateDebounceTimer?: ReturnType<typeof setTimeout>;

  /** ResizeObserver watching the toolbar container width */
  private resizeObserver?: ResizeObserver;

  private readonly ngZone = inject(NgZone);

  /**
   * Priority order: groups listed last overflow first.
   * Overflow order: insert → lists → alignment → heading → formatting → history.
   * (history is highest-priority so Undo/Redo stay visible as long as possible.)
   */
  private readonly groupPriority: ToolbarGroupName[] = [
    'history',
    'formatting',
    'heading',
    'alignment',
    'lists',
    'insert',
  ];

  constructor() {
    // Watch for editor changes and subscribe to updates
    effect(() => {
      // Unsubscribe from previous editor if any
      this.stateSubscription?.unsubscribe();

      if (this.editor?.view && this.editor?.update) {
        // Subscribe to editor state changes
        this.stateSubscription = this.editor.update.subscribe(() => {
          this.updateSelectionState();
        });

        // Initial state update
        this.updateSelectionState();
      }
    });
  }

  ngAfterViewInit(): void {
    // Seed the natural-width cache while all groups are visible, then start
    // listening for resize events.
    this.seedGroupWidthCache();
    this.initResizeObserver();
  }

  /**
   * Performs an initial measurement of all group widths while they are
   * guaranteed to be visible (no overflow yet).  These cached values are used
   * by `recalculateOverflow()` when groups are hidden.
   */
  seedGroupWidthCache(): void {
    const container = this.toolbarEl?.nativeElement;
    if (!container) return;

    // Use a rAF so the browser has rendered the initial layout
    requestAnimationFrame(() => {
      for (const name of this.groupPriority) {
        const groupEl = container.querySelector<HTMLElement>(
          `[data-toolbar-group="${name}"]`
        );
        const dividerEl = container.querySelector<HTMLElement>(
          `[data-toolbar-divider="${name}"]`
        );
        const w = (groupEl?.offsetWidth ?? 0) + (dividerEl?.offsetWidth ?? 0);
        if (w > 0) {
          this.groupNaturalWidths.set(name, w);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }
    this.resizeObserver?.disconnect();
  }

  /**
   * Set up a ResizeObserver to recalculate overflow whenever the toolbar
   * container changes width.
   */
  initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => {
      // Run inside NgZone so signals trigger change detection
      this.ngZone.run(() => this.recalculateOverflow());
    });

    this.resizeObserver.observe(this.toolbarEl.nativeElement);
    // Initial calculation
    this.recalculateOverflow();
  }

  /**
   * Recalculate which groups should be in the overflow menu.
   *
   * Strategy:
   * 1. When groups are visible (not overflowed), measure and cache their widths.
   * 2. Compare the total cached width against available container width.
   * 3. Overflow lowest-priority groups until everything fits.
   * 4. When the container expands, use cached widths to determine if overflow
   *    can be cleared without needing to temporarily show hidden groups.
   *
   * Uses double-`requestAnimationFrame` to guarantee browser layout is complete
   * before reading measurements.
   */
  recalculateOverflow(): void {
    const container = this.toolbarEl?.nativeElement;
    if (!container) return;

    if (this.disabled) {
      this.overflowGroups.set(new Set());
      return;
    }

    // Use double-rAF to guarantee the browser has fully committed layout changes
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.performOverflowRecalc(container))
    );
  }

  /**
   * Inner pass of `recalculateOverflow`, executed after a double
   * `requestAnimationFrame` so browser layout is fully committed.
   */
  private performOverflowRecalc(container: HTMLElement): void {
    const containerWidth = container.offsetWidth;
    if (containerWidth === 0) return;

    // Update the width cache for groups that are currently visible (not hidden)
    for (const name of this.groupPriority) {
      const groupEl = container.querySelector<HTMLElement>(
        `[data-toolbar-group="${name}"]`
      );
      const dividerEl = container.querySelector<HTMLElement>(
        `[data-toolbar-divider="${name}"]`
      );

      if (groupEl && !groupEl.classList.contains('toolbar-group--hidden')) {
        const w = (groupEl.offsetWidth ?? 0) + (dividerEl?.offsetWidth ?? 0);
        if (w > 0) {
          this.groupNaturalWidths.set(name, w);
        }
      }
    }

    // The comments toggle is absolutely positioned and the toolbar reserves
    // space for it via `padding-right`, so subtracting horizontal padding
    // yields the width actually available to flex children. Reserve only
    // the overflow button on top of that so the reservation stays stable
    // whether or not it is currently in the DOM (prevents hysteresis that
    // would stop groups from being restored on resize).
    const style = getComputedStyle(container);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const overflowBtnWidth = 44;
    const availableWidth =
      containerWidth - paddingLeft - paddingRight - overflowBtnWidth;

    let totalGroupWidth = 0;
    for (const name of this.groupPriority) {
      totalGroupWidth += this.groupNaturalWidths.get(name) ?? 0;
    }

    if (totalGroupWidth === 0) {
      // Cache not yet populated — nothing to do
      return;
    }

    if (totalGroupWidth <= availableWidth) {
      this.ngZone.run(() => this.overflowGroups.set(new Set()));
      return;
    }

    const newOverflow = this.computeOverflowSet(
      totalGroupWidth,
      availableWidth
    );

    this.ngZone.run(() => {
      const prev = this.overflowGroups();
      const same =
        prev.size === newOverflow.size &&
        [...newOverflow].every(g => prev.has(g));
      if (!same) {
        this.overflowGroups.set(newOverflow);
      }
    });
  }

  /**
   * Given the total cached width and available width, pick the set of
   * lowest-priority groups to move into the overflow menu so the rest fit.
   */
  private computeOverflowSet(
    totalGroupWidth: number,
    availableWidth: number
  ): Set<ToolbarGroupName> {
    const newOverflow = new Set<ToolbarGroupName>();
    let remaining = totalGroupWidth;
    for (let i = this.groupPriority.length - 1; i >= 0; i--) {
      if (remaining <= availableWidth) break;
      const name = this.groupPriority[i];
      newOverflow.add(name);
      remaining -= this.groupNaturalWidths.get(name) ?? 0;
    }
    return newOverflow;
  }

  /** Cached natural (full-width) pixel widths for each toolbar group+divider pair */
  private readonly groupNaturalWidths = new Map<ToolbarGroupName, number>();

  /**
   * Called when the heading menu closes. Restores focus to the editor.
   */
  onMenuClosed(): void {
    this.refocusEditor();
  }

  /** Computed active state for bold */
  isBold = computed(() => this.selectionState().bold);

  /** Computed active state for italic */
  isItalic = computed(() => this.selectionState().italic);

  /** Computed active state for underline */
  isUnderline = computed(() => this.selectionState().underline);

  /** Computed active state for strikethrough */
  isStrike = computed(() => this.selectionState().strike);

  /** Computed active state for code */
  isCode = computed(() => this.selectionState().code);

  /** Computed active state for link */
  isLink = computed(() => this.selectionState().link);

  /** Current heading level (0 = paragraph) */
  headingLevel = computed(() => this.selectionState().heading);

  /** Current text alignment */
  textAlign = computed(() => this.selectionState().align);

  /** Computed active state for bullet list */
  isBulletList = computed(() => this.selectionState().bulletList);

  /** Computed active state for ordered list */
  isOrderedList = computed(() => this.selectionState().orderedList);

  /** Computed active state for blockquote */
  isBlockquote = computed(() => this.selectionState().blockquote);

  /**
   * Returns true if the given group name is currently in the overflow menu.
   */
  isOverflowed(group: ToolbarGroupName): boolean {
    return this.overflowGroups().has(group);
  }

  /**
   * Updates the selection state based on current editor state.
   * Debounced to avoid excessive updates during rapid typing.
   */
  private updateSelectionState(): void {
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }

    this.updateDebounceTimer = setTimeout(() => {
      const view = this.editor?.view;
      if (!view) return;

      const { state } = view;
      const { from, to } = state.selection;
      const { schema } = state;

      // Check marks
      const bold = this.isMarkActive(state, schema.marks['strong']);
      const italic = this.isMarkActive(state, schema.marks['em']);
      const underline = this.isMarkActive(state, schema.marks['u']);
      const strike = this.isMarkActive(state, schema.marks['s']);
      const code = this.isMarkActive(state, schema.marks['code']);
      const link = this.isMarkActive(state, schema.marks['link']);

      // Check heading level
      let heading = 0;
      const headingType = schema.nodes['heading'];
      if (headingType) {
        state.doc.nodesBetween(from, to, node => {
          if (node.type === headingType) {
            heading = node.attrs['level'] as number;
          }
        });
      }

      // Check alignment
      let align: TextAlign = 'left';
      state.doc.nodesBetween(from, to, node => {
        if (node.attrs['align']) {
          align = node.attrs['align'] as TextAlign;
        }
      });

      // Check list types
      const bulletList = this.isNodeActive(state, schema.nodes['bullet_list']);
      const orderedList = this.isNodeActive(
        state,
        schema.nodes['ordered_list']
      );
      const blockquote = this.isNodeActive(state, schema.nodes['blockquote']);

      this.selectionState.set({
        bold,
        italic,
        underline,
        strike,
        code,
        link,
        heading,
        align,
        bulletList,
        orderedList,
        blockquote,
      });
    }, 50);
  }

  /**
   * Checks if a mark is active at the current selection.
   */
  private isMarkActive(state: EditorState, markType: MarkType): boolean {
    if (!markType) return false;
    const { from, $from, to, empty } = state.selection;
    if (empty) {
      return !!markType.isInSet(state.storedMarks || $from.marks());
    }
    return state.doc.rangeHasMark(from, to, markType);
  }

  /**
   * Checks if a node type is active at the current selection.
   */
  private isNodeActive(state: EditorState, nodeType: NodeType): boolean {
    if (!nodeType) return false;
    const { selection } = state;
    const { $from, to } = selection;

    // Check if the node type is found in the path from root to selection
    // For list items, we need to check if we're inside a list
    let found = false;
    state.doc.nodesBetween($from.pos, to, node => {
      if (node.type === nodeType) {
        found = true;
      }
    });

    // Also check ancestor nodes
    for (let depth = $from.depth; depth >= 0; depth--) {
      if ($from.node(depth).type === nodeType) {
        found = true;
        break;
      }
    }

    return found;
  }

  /**
   * Refocuses the editor after a toolbar action.
   * Uses setTimeout to ensure focus happens after the browser's click event completes.
   */
  private refocusEditor(): void {
    const view = this.editor?.view;
    if (view) {
      setTimeout(() => view.focus(), 0);
    }
  }

  /**
   * Executes a ProseMirror command on the editor.
   * Automatically refocuses the editor after the command.
   * Does nothing if the toolbar is disabled (read-only mode).
   */
  private execCommand(cmd: Command): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    cmd(state, dispatch);
    this.refocusEditor();
  }

  // ========== Text Formatting Commands ==========

  /** Toggle bold formatting */
  toggleBold(): void {
    const markType = this.editor?.view?.state.schema.marks['strong'];
    if (markType) {
      this.execCommand(toggleMark(markType));
    }
  }

  /** Toggle italic formatting */
  toggleItalic(): void {
    const markType = this.editor?.view?.state.schema.marks['em'];
    if (markType) {
      this.execCommand(toggleMark(markType));
    }
  }

  /** Toggle underline formatting */
  toggleUnderline(): void {
    const markType = this.editor?.view?.state.schema.marks['u'];
    if (markType) {
      this.execCommand(toggleMark(markType));
    }
  }

  /** Toggle strikethrough formatting */
  toggleStrike(): void {
    const markType = this.editor?.view?.state.schema.marks['s'];
    if (markType) {
      this.execCommand(toggleMark(markType));
    }
  }

  /** Toggle code formatting */
  toggleCode(): void {
    const markType = this.editor?.view?.state.schema.marks['code'];
    if (markType) {
      this.execCommand(toggleMark(markType));
    }
  }

  // ========== Heading Commands ==========

  /** Set heading level (1-6) or paragraph (0) */
  setHeading(level: HeadingLevel | 0): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema, selection } = state;
    const { $from, $to } = selection;

    if (level === 0) {
      // Convert to paragraph
      const paragraphType = schema.nodes['paragraph'];
      if (paragraphType) {
        const tr = state.tr.setBlockType($from.pos, $to.pos, paragraphType);
        dispatch(tr);
      }
    } else {
      // Convert to heading
      const headingType = schema.nodes['heading'];
      if (headingType) {
        const tr = state.tr.setBlockType($from.pos, $to.pos, headingType, {
          level,
        });
        dispatch(tr);
      }
    }
    this.refocusEditor();
  }

  /** Get label for heading button */
  getHeadingLabel(): string {
    const level = this.headingLevel();
    return level > 0 ? `H${level}` : 'P';
  }

  // ========== Alignment Commands ==========

  /** Set text alignment */
  setAlign(align: TextAlign): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { from, to } = state.selection;

    // Update alignment attribute on affected nodes
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.spec.attrs?.['align']) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
      }
    });

    if (tr.docChanged) {
      dispatch(tr);
    }
    this.refocusEditor();
  }

  // ========== List Commands ==========

  /** Toggle bullet list */
  toggleBulletList(): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema } = state;
    const listType = schema.nodes['bullet_list'];
    const itemType = schema.nodes['list_item'];

    if (listType && itemType) {
      if (this.isBulletList()) {
        this.liftFromList(view);
      } else {
        wrapInList(listType)(state, dispatch);
      }
    }
    this.refocusEditor();
  }

  /** Toggle ordered list */
  toggleOrderedList(): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema } = state;
    const listType = schema.nodes['ordered_list'];
    const itemType = schema.nodes['list_item'];

    if (listType && itemType) {
      if (this.isOrderedList()) {
        this.liftFromList(view);
      } else {
        wrapInList(listType)(state, dispatch);
      }
    }
    this.refocusEditor();
  }

  /**
   * Lifts content out of a list.
   */
  private liftFromList(view: EditorView): void {
    const { state, dispatch } = view;
    const { selection } = state;
    const { $from } = selection;

    // Find the list item and lift its content
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (
        node.type.name === 'list_item' ||
        node.type.name === 'bullet_list' ||
        node.type.name === 'ordered_list'
      ) {
        // Use lift to move content out of the list
        const range = $from.blockRange(
          state.selection.$to,
          node => node.type.name === 'list_item'
        );
        if (range) {
          const tr = state.tr.lift(range, 0);
          dispatch(tr);
          return;
        }
      }
    }
  }

  /** Toggle blockquote */
  toggleBlockquote(): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema, selection } = state;
    const { $from, $to } = selection;
    const blockquoteType = schema.nodes['blockquote'];

    if (!blockquoteType) return;

    if (this.isBlockquote()) {
      // Lift out of blockquote
      const range = $from.blockRange($to);
      if (range) {
        const tr = state.tr.lift(range, 0);
        dispatch(tr);
      }
    } else {
      // Wrap in blockquote
      const range = $from.blockRange($to);
      if (range) {
        const tr = state.tr.wrap(range, [{ type: blockquoteType }]);
        dispatch(tr);
      }
    }
    this.refocusEditor();
  }

  // ========== Insert Commands ==========

  /** Insert horizontal rule */
  insertHorizontalRule(): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema } = state;
    const hrType = schema.nodes['horizontal_rule'];

    if (hrType) {
      const tr = state.tr.replaceSelectionWith(hrType.create());
      dispatch(tr);
    }
    this.refocusEditor();
  }

  /** Clear formatting from selection */
  clearFormatting(): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { from, to } = state.selection;

    if (from === to) {
      // No selection - clear stored marks
      dispatch(state.tr.setStoredMarks([]));
    } else {
      // Clear all marks in selection
      let tr = state.tr;
      Object.values(state.schema.marks).forEach(markType => {
        tr = tr.removeMark(from, to, markType);
      });
      dispatch(tr);
    }
    this.refocusEditor();
  }

  // ========== History Commands ==========

  /** Undo last change */
  undo(): void {
    this.execCommand(undo);
  }

  /** Redo last undone change */
  redo(): void {
    this.execCommand(redo);
  }

  // ========== Link Commands ==========

  /** Insert or edit a link — delegates to the document editor via event */
  insertLink(): void {
    if (this.disabled) return;
    this.insertLinkClick.emit();
  }

  /** Remove link from selection */
  removeLink(): void {
    if (this.disabled) return;

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema, selection } = state;
    const linkMark = schema.marks['link'];
    if (!linkMark) return;

    const { from, to } = selection;
    dispatch(state.tr.removeMark(from, to, linkMark));
    this.refocusEditor();
  }

  // ========== Image Insert ==========

  /** Emit event to open insert image dialog */
  insertImage(): void {
    this.insertImageClick.emit();
  }
}
