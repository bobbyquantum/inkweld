import {
  Toolbar,
  ToolbarWidget,
  ToolbarWidgetGroup,
} from '@angular/aria/toolbar';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from 'ngx-editor';
import { toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { MarkType, NodeType } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Subscription } from 'rxjs';

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
 * Custom Angular Material toolbar for ngx-editor / ProseMirror.
 * Replaces the default ngx-editor-menu with Material Design components.
 */
@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
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
export class EditorToolbarComponent implements OnDestroy {
  /** The ngx-editor Editor instance */
  @Input({ required: true }) editor!: Editor;

  /** Emitted when the meta panel toggle is clicked */
  @Output() metaPanelToggle = new EventEmitter<void>();

  /** Whether the meta panel is currently open (for icon state) */
  @Input() metaPanelOpen = false;

  /** Signal for tracking the current selection state */
  private selectionState = signal({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    link: false,
    heading: 0 as number,
    align: 'left' as TextAlign,
    bulletList: false,
    orderedList: false,
    blockquote: false,
  });

  /** Subscription to editor state changes */
  private stateSubscription?: Subscription;

  /** Debounce timer for state updates */
  private updateDebounceTimer?: ReturnType<typeof setTimeout>;

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

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }
  }

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
   */
  private execCommand(cmd: Command): void {
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

  /** Insert or edit a link */
  insertLink(): void {
    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const { schema, selection } = state;
    const linkMark = schema.marks['link'];
    if (!linkMark) return;

    const { from, to, empty } = selection;

    // Check if there's an existing link
    let existingHref = '';
    if (!empty) {
      state.doc.nodesBetween(from, to, node => {
        const link = linkMark.isInSet(node.marks);
        if (link) {
          existingHref = link.attrs['href'] as string;
        }
      });
    }

    // Prompt for URL (in a real implementation, use a Material dialog)
    const href = window.prompt('Enter URL:', existingHref || 'https://');
    if (href === null) return; // Cancelled

    if (href === '') {
      // Remove link
      dispatch(state.tr.removeMark(from, to, linkMark));
    } else {
      // Add/update link
      dispatch(
        state.tr.addMark(from, to, linkMark.create({ href, target: '_blank' }))
      );
    }
    this.refocusEditor();
  }

  /** Remove link from selection */
  removeLink(): void {
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

  // ========== Meta Panel Toggle ==========

  /** Toggle the meta panel */
  onMetaPanelToggle(): void {
    this.metaPanelToggle.emit();
  }
}
