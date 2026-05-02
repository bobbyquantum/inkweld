import { DestroyRef, inject, Injectable } from '@angular/core';
import type { CanvasTool } from '@models/canvas.model';

/**
 * Behaviour callbacks that the canvas component supplies to the keyboard
 * service. The service owns dispatch logic and the document-level listener
 * lifetime; the component owns side-effects on its own state.
 */
export interface CanvasKeyboardHandlers {
  onCopy(): void;
  onCut(): void;
  /** Paste from the keyboard (no context-menu position available). */
  onPaste(): void;
  onDuplicate(): void;
  /** Delete or backspace on the selected object. */
  onDelete(): void;
  /** Escape: clear selection and revert to the select tool. */
  onEscape(): void;
  onToolChange(tool: CanvasTool): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFitAll(): void;
}

/**
 * Document-level keyboard shortcut dispatcher for the canvas tab.
 *
 * Knows nothing about Konva, dialogs, or component state — it just
 * translates key events into the {@link CanvasKeyboardHandlers} contract.
 * Handles its own listener cleanup via the host's {@link DestroyRef}.
 */
@Injectable()
export class CanvasKeyboardService {
  private readonly destroyRef = inject(DestroyRef);

  private static readonly TOOL_KEY_MAP: Record<string, CanvasTool> = {
    v: 'select',
    r: 'rectSelect',
    h: 'pan',
    p: 'pin',
    d: 'draw',
    l: 'line',
    s: 'shape',
    t: 'text',
  };

  /** Attach the listener. Subsequent calls are no-ops. */
  attach(handlers: CanvasKeyboardHandlers): void {
    if (this.attached) return;
    this.attached = true;
    const handler = (e: KeyboardEvent) => this.dispatch(e, handlers);
    document.addEventListener('keydown', handler);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('keydown', handler);
    });
  }

  private attached = false;

  /** Exposed for unit tests. */
  dispatch(e: KeyboardEvent, h: CanvasKeyboardHandlers): void {
    if (this.isTypingTarget(e.target)) return;

    const key = e.key.toLowerCase();
    if (this.handleClipboardShortcuts(e, key, h)) return;
    if (this.handleToolSelectionShortcuts(key, e.ctrlKey || e.metaKey, h))
      return;
    if (this.handleEditingShortcuts(e, key, h)) return;
    this.handleZoomShortcuts(e, key, h);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return true;
    }
    if (target instanceof HTMLElement) {
      return (
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true'
      );
    }
    return false;
  }

  private handleClipboardShortcuts(
    e: KeyboardEvent,
    key: string,
    h: CanvasKeyboardHandlers
  ): boolean {
    if (!e.ctrlKey && !e.metaKey) return false;
    switch (key) {
      case 'c':
        e.preventDefault();
        h.onCopy();
        return true;
      case 'x':
        e.preventDefault();
        h.onCut();
        return true;
      case 'v':
        e.preventDefault();
        h.onPaste();
        return true;
      case 'd':
        e.preventDefault();
        h.onDuplicate();
        return true;
      default:
        return false;
    }
  }

  private handleToolSelectionShortcuts(
    key: string,
    hasModifier: boolean,
    h: CanvasKeyboardHandlers
  ): boolean {
    if (hasModifier) return false;
    const tool = CanvasKeyboardService.TOOL_KEY_MAP[key];
    if (!tool) return false;
    h.onToolChange(tool);
    return true;
  }

  private handleEditingShortcuts(
    e: KeyboardEvent,
    key: string,
    h: CanvasKeyboardHandlers
  ): boolean {
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      h.onDelete();
      return true;
    }
    if (key !== 'escape') return false;
    h.onEscape();
    return true;
  }

  private handleZoomShortcuts(
    e: KeyboardEvent,
    key: string,
    h: CanvasKeyboardHandlers
  ): void {
    if (!e.ctrlKey && !e.metaKey) return;
    if (key === '=' || key === '+') {
      e.preventDefault();
      h.onZoomIn();
      return;
    }
    if (key === '-') {
      e.preventDefault();
      h.onZoomOut();
      return;
    }
    if (key === '0') {
      e.preventDefault();
      h.onFitAll();
    }
  }
}
