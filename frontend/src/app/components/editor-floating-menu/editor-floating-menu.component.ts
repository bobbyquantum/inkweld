import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  Input,
  type OnDestroy,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Editor } from '@bobbyquantum/ngx-editor';
import { toggleMark } from 'prosemirror-commands';
import { type MarkType } from 'prosemirror-model';
import { type EditorState, type Transaction } from 'prosemirror-state';
import { type Subscription } from 'rxjs';

type Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean;

/**
 * Custom Material floating menu for ngx-editor / ProseMirror.
 * Handles its own positioning using viewport boundaries (not editor bounds).
 * Appears when text is selected, providing quick formatting options.
 */
@Component({
  selector: 'app-editor-floating-menu',
  imports: [MatIconModule, MatTooltipModule, Toolbar, ToolbarWidget],
  templateUrl: './editor-floating-menu.component.html',
  styleUrl: './editor-floating-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.position]': '"fixed"',
    '[style.z-index]': '"1000"',
    '[style.top.px]': 'positionState().top',
    '[style.left.px]': 'positionState().left',
    '[style.visibility]': 'positionState().visible ? "visible" : "hidden"',
    '[style.opacity]': 'positionState().visible ? "1" : "0"',
    '[style.pointer-events]': 'positionState().visible ? "auto" : "none"',
    '[style.transition]': '"opacity 0.15s ease"',
  },
})
export class EditorFloatingMenuComponent implements OnDestroy {
  /** The ngx-editor Editor instance */
  @Input({ required: true }) editor!: Editor;

  /** Emitted when the user clicks the comment button */
  addComment = output<void>();

  /** Emitted when the user clicks the link button — delegates to document editor */
  insertLink = output<void>();

  /** Signal for tracking the current selection state */
  private readonly selectionState = signal({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    link: false,
  });

  /** Position and visibility state */
  protected positionState = signal({
    visible: false,
    top: 0,
    left: 0,
  });

  /** Subscription to editor state changes */
  private stateSubscription?: Subscription;

  /** Whether mouse is being dragged (selecting text) */
  private isDragging = false;

  constructor() {
    // Watch for editor changes and subscribe to updates
    effect(() => {
      this.stateSubscription?.unsubscribe();

      if (this.editor?.view && this.editor?.update) {
        this.stateSubscription = this.editor.update.subscribe(() => {
          this.updateSelectionState();
          this.updatePosition();
        });
        this.updateSelectionState();
        this.updatePosition();
      }
    });
  }

  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.isDragging = true;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.isDragging = false;
    // Small delay to let selection finalize
    setTimeout(() => this.updatePosition(), 10);
  }

  @HostListener('document:touchstart')
  onDocumentTouchStart(): void {
    this.updatePosition();
  }

  @HostListener('document:touchend')
  onDocumentTouchEnd(): void {
    // Delay for touch — the OS selection handles and native menu need time to settle
    setTimeout(() => this.updatePosition(), 300);
  }

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
  }

  /**
   * Prevents focus from shifting to the button.
   * This keeps the editor selection intact.
   */
  preventFocusLoss(event: MouseEvent): void {
    event.preventDefault();
  }

  /**
   * Updates the menu position based on selection coordinates.
   * Uses viewport as boundary, not editor bounds.
   */
  private updatePosition(): void {
    const view = this.editor?.view;
    if (!view) {
      this.hide();
      return;
    }

    const { state } = view;
    const { selection } = state;
    const { from, to, empty } = selection;

    // Don't show if no selection or still dragging
    if (empty || this.isDragging) {
      this.hide();
      return;
    }

    // Get selection coordinates (these are viewport-relative)
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    // Calculate selection bounds
    const selectionTop = Math.min(start.top, end.top);
    const selectionBottom = Math.max(start.bottom, end.bottom);
    const selectionLeft = Math.min(start.left, end.left);
    const selectionRight = Math.max(start.right, end.right);
    const selectionCenterX = (selectionLeft + selectionRight) / 2;

    // Menu dimensions (approximate)
    const menuHeight = 40;
    const menuWidth = 220;
    const gap = 8;
    // On touch devices use a larger gap below to clear OS selection handles
    const touchGapBelow = 32;

    // Viewport boundaries with some padding
    const viewportTop = 60; // Account for app toolbar
    const viewportLeft = 10;
    const viewportRight = globalThis.innerWidth - 10;
    const viewportBottom = globalThis.innerHeight - 10;

    // Determine vertical position.
    // On touch devices prefer below to avoid conflicting with the OS context menu
    // which appears above the selection on Android.
    let top: number;
    if (this.shouldPreferBelowSelection()) {
      const belowPos = selectionBottom + touchGapBelow;
      if (belowPos + menuHeight < viewportBottom) {
        top = belowPos;
      } else {
        // No room below, fall back to above
        top = Math.max(viewportTop, selectionTop - menuHeight - gap);
      }
    } else if (selectionTop - menuHeight - gap < viewportTop) {
      // Desktop: prefer above, flip to below if not enough room
      top = selectionBottom + gap;
    } else {
      top = selectionTop - menuHeight - gap;
    }

    // Calculate horizontal position (centered on selection)
    let left = selectionCenterX - menuWidth / 2;

    // Clamp to viewport
    if (left < viewportLeft) {
      left = viewportLeft;
    } else if (left + menuWidth > viewportRight) {
      left = viewportRight - menuWidth;
    }

    this.positionState.set({
      visible: true,
      top,
      left,
    });
  }

  private shouldPreferBelowSelection(): boolean {
    return (
      globalThis.matchMedia('(pointer: coarse)').matches ||
      globalThis.navigator.maxTouchPoints > 0
    );
  }

  private hide(): void {
    this.positionState.update(s => ({ ...s, visible: false }));
  }

  /** Computed active state for bold */
  isBold = computed(() => this.selectionState().bold);

  /** Computed active state for italic */
  isItalic = computed(() => this.selectionState().italic);

  /** Computed active state for underline */
  isUnderline = computed(() => this.selectionState().underline);

  /** Computed active state for strikethrough */
  isStrike = computed(() => this.selectionState().strike);

  /** Computed active state for link */
  isLink = computed(() => this.selectionState().link);

  /**
   * Updates the selection state based on current editor state.
   */
  private updateSelectionState(): void {
    const view = this.editor?.view;
    if (!view) return;

    const { state } = view;
    const { schema } = state;

    const bold = this.isMarkActive(state, schema.marks['strong']);
    const italic = this.isMarkActive(state, schema.marks['em']);
    const underline = this.isMarkActive(state, schema.marks['u']);
    const strike = this.isMarkActive(state, schema.marks['s']);
    const link = this.isMarkActive(state, schema.marks['link']);

    this.selectionState.set({ bold, italic, underline, strike, link });
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
   * Executes a ProseMirror command on the editor.
   */
  private executeCommand(command: Command): void {
    const view = this.editor?.view;
    if (!view) return;

    command(view.state, view.dispatch);
    view.focus();
  }

  /** Toggles bold formatting */
  toggleBold(): void {
    const markType = this.editor?.view?.state.schema.marks['strong'];
    if (markType) {
      this.executeCommand(toggleMark(markType));
    }
  }

  /** Toggles italic formatting */
  toggleItalic(): void {
    const markType = this.editor?.view?.state.schema.marks['em'];
    if (markType) {
      this.executeCommand(toggleMark(markType));
    }
  }

  /** Toggles underline formatting */
  toggleUnderline(): void {
    const markType = this.editor?.view?.state.schema.marks['u'];
    if (markType) {
      this.executeCommand(toggleMark(markType));
    }
  }

  /** Toggles strikethrough formatting */
  toggleStrike(): void {
    const markType = this.editor?.view?.state.schema.marks['s'];
    if (markType) {
      this.executeCommand(toggleMark(markType));
    }
  }

  /** Delegates link insertion/editing to the document editor */
  toggleLink(): void {
    this.insertLink.emit();
    this.hide();
  }

  onAddComment(): void {
    this.addComment.emit();
    this.hide();
  }
}
