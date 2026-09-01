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
  onUndo(): void;
  onRedo(): void;
  /** Step the active stroke width up or down (`]` / `[`). */
  onAdjustStrokeWidth(direction: 1 | -1): void;
  /** Space held: pan the canvas without leaving the current tool. */
  onSpacePanChange(active: boolean): void;
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
    e: 'eraser',
    l: 'line',
    s: 'shape',
    t: 'text',
    g: 'polygon',
  };

  /** Attach the listeners. Subsequent calls are no-ops. */
  attach(handlers: CanvasKeyboardHandlers): void {
    if (this.attached) return;
    // A fast navigation can destroy the tab before its deferred init runs;
    // attaching then would leak document listeners with nothing to detach them.
    if (this.destroyRef.destroyed) return;
    this.attached = true;
    const onKeyDown = (e: KeyboardEvent) => this.dispatch(e, handlers);
    const onKeyUp = (e: KeyboardEvent) => this.dispatchKeyUp(e, handlers);
    // Alt-tabbing away while space is held never delivers the keyup, which
    // would otherwise leave the canvas stuck in pan mode.
    const onBlur = () => this.releaseSpacePan(handlers);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    globalThis.addEventListener('blur', onBlur);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      globalThis.removeEventListener('blur', onBlur);
    });
  }

  private attached = false;

  /** Whether space is currently held down (temporary pan). */
  private spaceHeld = false;

  /** Exposed for unit tests. */
  dispatch(e: KeyboardEvent, h: CanvasKeyboardHandlers): void {
    if (this.isTypingTarget(e.target)) return;

    const key = e.key.toLowerCase();
    if (this.handleHistoryShortcuts(e, key, h)) return;
    if (this.handleClipboardShortcuts(e, key, h)) return;
    if (this.handleSpacePan(e, key, h)) return;
    if (this.handleToolSelectionShortcuts(key, e.ctrlKey || e.metaKey, h))
      return;
    if (this.handleBrushShortcuts(e, key, h)) return;
    if (this.handleEditingShortcuts(e, key, h)) return;
    this.handleZoomShortcuts(e, key, h);
  }

  /** Exposed for unit tests. */
  dispatchKeyUp(e: KeyboardEvent, h: CanvasKeyboardHandlers): void {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    this.releaseSpacePan(h);
  }

  /** End temporary panning, if it was active. Exposed for unit tests. */
  releaseSpacePan(h: CanvasKeyboardHandlers): void {
    if (!this.spaceHeld) return;
    this.spaceHeld = false;
    h.onSpacePanChange(false);
  }

  private handleHistoryShortcuts(
    e: KeyboardEvent,
    key: string,
    h: CanvasKeyboardHandlers
  ): boolean {
    if (!e.ctrlKey && !e.metaKey) return false;

    if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) h.onRedo();
      else h.onUndo();
      return true;
    }
    if (key === 'y') {
      e.preventDefault();
      h.onRedo();
      return true;
    }
    return false;
  }

  private handleSpacePan(
    e: KeyboardEvent,
    key: string,
    h: CanvasKeyboardHandlers
  ): boolean {
    if (key !== ' ' && key !== 'spacebar') return false;
    e.preventDefault();
    if (this.spaceHeld) return true;
    this.spaceHeld = true;
    h.onSpacePanChange(true);
    return true;
  }

  private handleBrushShortcuts(
    e: KeyboardEvent,
    key: string,
    h: CanvasKeyboardHandlers
  ): boolean {
    if (e.ctrlKey || e.metaKey) return false;
    if (key === '[') {
      e.preventDefault();
      h.onAdjustStrokeWidth(-1);
      return true;
    }
    if (key === ']') {
      e.preventDefault();
      h.onAdjustStrokeWidth(1);
      return true;
    }
    return false;
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
