/**
 * The handle beside each line of a conversation: drag to move the line,
 * or use the arrows. It follows the hovered line, or the line holding the
 * cursor when nothing is hovered (touch screens have no hover).
 *
 * The drag never goes through ProseMirror's own drag-and-drop: the handle
 * lives outside the editable DOM, the drop is resolved to a gap between
 * top-level blocks, and the move is a single {@link moveBlock} command.
 */
import { type PluginView } from 'prosemirror-state';
import { type EditorView } from 'prosemirror-view';

import { moveBlock, topBlockAt, topBlocks } from './conversation-commands';
import { isConversationMode } from './conversation-mode';

const DRAG_TYPE = 'application/x-inkweld-block';
const views = new WeakMap<EditorView, BlockHandleView>();

export interface BlockHandleHost {
  label(key: string): string;
}

function handleButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'block-handle__button';
  button.title = label;
  button.setAttribute('aria-label', label);
  const glyph = document.createElement('span');
  glyph.className = 'material-icons';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  button.appendChild(glyph);
  button.addEventListener('mousedown', e => e.preventDefault());
  return button;
}

export class BlockHandleView implements PluginView {
  private readonly handle: HTMLElement;
  private readonly dropLine: HTMLElement;
  private host: HTMLElement | null = null;
  /** Index of the block the handle sits beside. */
  private index: number | null = null;
  private hovered = false;
  private dragIndex: number | null = null;
  private dropIndex: number | null = null;

  static of(view: EditorView): BlockHandleView | undefined {
    return views.get(view);
  }

  constructor(
    private readonly view: EditorView,
    labels: BlockHandleHost
  ) {
    views.set(view, this);

    this.handle = document.createElement('div');
    this.handle.className = 'block-handle';
    this.handle.contentEditable = 'false';
    this.handle.hidden = true;

    const grip = handleButton('drag_indicator', labels.label('dragToMove'));
    grip.classList.add('block-handle__grip');
    grip.draggable = true;
    grip.addEventListener('dragstart', e => this.onDragStart(e));
    grip.addEventListener('dragend', () => this.endDrag());

    const up = handleButton('arrow_upward', labels.label('moveUp'));
    up.addEventListener('click', () => this.nudge(-1));
    const down = handleButton('arrow_downward', labels.label('moveDown'));
    down.addEventListener('click', () => this.nudge(1));
    this.handle.append(grip, up, down);

    this.dropLine = document.createElement('div');
    this.dropLine.className = 'block-drop-line';
    this.dropLine.hidden = true;

    view.dom.addEventListener('mousemove', this.onMouseMove);
    view.dom.addEventListener('mouseleave', this.onMouseLeave);
    view.dom.addEventListener('scroll', this.onScroll, { passive: true });
    this.handle.addEventListener('mouseleave', this.onMouseLeave);
    this.attach();
    this.update();
  }

  update(): void {
    this.attach();
    if (!this.active()) {
      this.hide();
      return;
    }
    if (this.hovered && this.index !== null) {
      this.place(this.index);
      return;
    }
    const block = topBlockAt(this.view.state.selection.$from);
    if (block && this.view.hasFocus()) this.place(block.index);
    else this.hide();
  }

  destroy(): void {
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
    this.view.dom.removeEventListener('scroll', this.onScroll);
    this.host?.classList.remove('block-handle-host');
    this.handle.remove();
    this.dropLine.remove();
    views.delete(this.view);
  }

  /** Allow dropping a dragged block and show where it will land. */
  onDragOver(event: DragEvent): boolean {
    if (this.dragIndex === null) return false;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropIndex = this.gapAt(event.clientY);
    this.showDropLine(this.dropIndex);
    return true;
  }

  onDrop(event: DragEvent): boolean {
    if (this.dragIndex === null) return false;
    event.preventDefault();
    const from = this.dragIndex;
    const to = this.dropIndex ?? this.gapAt(event.clientY);
    this.endDrag();
    moveBlock(from, to)(this.view.state, this.view.dispatch);
    this.view.focus();
    return true;
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.active() || this.dragIndex !== null) return;
    const index = this.blockIndexFor(event.target as Node | null);
    if (index === null) return;
    this.hovered = true;
    this.place(index);
  };

  private readonly onMouseLeave = (event: MouseEvent): void => {
    if (this.handle.contains(event.relatedTarget as Node | null)) return;
    this.hovered = false;
    this.update();
  };

  /** The editable area scrolls inside the host: keep the handle beside its line. */
  private readonly onScroll = (): void => {
    if (this.index !== null && !this.handle.hidden) this.place(this.index);
  };

  private active(): boolean {
    return this.view.editable && isConversationMode(this.view.state);
  }

  /** Keep the handle and drop line inside the editor's positioned parent. */
  private attach(): void {
    const parent = this.view.dom.parentElement;
    if (!parent || parent === this.host) return;
    this.host?.classList.remove('block-handle-host');
    this.host = parent;
    parent.classList.add('block-handle-host');
    parent.append(this.handle, this.dropLine);
  }

  /** Index of the top-level block whose DOM contains `target`. */
  private blockIndexFor(target: Node | null): number | null {
    let el: Node | null = target;
    while (el && el.parentNode !== this.view.dom) el = el.parentNode;
    if (!el) return null;
    for (const block of topBlocks(this.view.state.doc)) {
      if (this.view.nodeDOM(block.pos) === el) return block.index;
    }
    return null;
  }

  private blockElement(index: number): HTMLElement | null {
    const block = topBlocks(this.view.state.doc)[index];
    if (!block) return null;
    const dom = this.view.nodeDOM(block.pos);
    return dom instanceof HTMLElement ? dom : null;
  }

  private place(index: number): void {
    const el = this.blockElement(index);
    if (!el || !this.host) {
      this.hide();
      return;
    }
    this.index = index;
    const hostRect = this.host.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const top = rect.top - hostRect.top + this.host.scrollTop;
    this.handle.style.top = `${Math.max(0, top)}px`;
    this.handle.hidden = false;
  }

  private hide(): void {
    this.handle.hidden = true;
    if (!this.hovered) this.index = null;
  }

  private nudge(direction: -1 | 1): void {
    if (this.index === null) return;
    const to = direction < 0 ? this.index - 1 : this.index + 2;
    if (moveBlock(this.index, to)(this.view.state, this.view.dispatch)) {
      this.index += direction;
      this.hovered = false;
    }
    this.view.focus();
  }

  private onDragStart(event: DragEvent): void {
    if (this.index === null || !event.dataTransfer) return;
    this.dragIndex = this.index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, String(this.index));
    // Firefox only starts a drag that carries some data it understands.
    const el = this.blockElement(this.index);
    event.dataTransfer.setData('text/plain', el?.textContent ?? '');
    if (el) event.dataTransfer.setDragImage(el, 0, 0);
    el?.classList.add('is-dragging');
  }

  private endDrag(): void {
    if (this.dragIndex !== null) {
      this.blockElement(this.dragIndex)?.classList.remove('is-dragging');
    }
    this.dragIndex = null;
    this.dropIndex = null;
    this.dropLine.hidden = true;
  }

  /** The gap (0 … childCount) nearest to a vertical position. */
  private gapAt(clientY: number): number {
    const blocks = topBlocks(this.view.state.doc);
    for (const block of blocks) {
      const dom = this.view.nodeDOM(block.pos);
      if (!(dom instanceof HTMLElement)) continue;
      const rect = dom.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return block.index;
    }
    return blocks.length;
  }

  private showDropLine(gap: number): void {
    if (!this.host) return;
    const hostRect = this.host.getBoundingClientRect();
    const count = this.view.state.doc.childCount;
    const el = this.blockElement(Math.min(gap, count - 1));
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = gap < count ? rect.top : rect.bottom;
    this.dropLine.style.top = `${y - hostRect.top + this.host.scrollTop - 1}px`;
    this.dropLine.hidden = false;
  }
}
