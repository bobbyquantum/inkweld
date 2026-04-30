import { computed, inject, Injectable, signal } from '@angular/core';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasClipboardService } from '@services/canvas/canvas-clipboard.service';
import { CanvasSelectionService } from '@services/canvas/canvas-selection.service';

/** Callbacks supplied by the host component. */
export interface ContextMenuCallbacks {
  /** Currently selected object id (signal-style getter). */
  getSelectedObjectId: () => string | null;
  /** Update the selected object id. */
  setSelectedObjectId: (id: string | null) => void;
  /** Resolve (and possibly auto-pick) an active layer id. Returns '' when none. */
  ensureActiveLayer: () => string;
  /** Current viewport-center in canvas coordinates. */
  getViewportCenter: () => { x: number; y: number };
  /** Current canvas-pointer position in canvas coordinates, or null. */
  getCanvasPointerPosition: () => { x: number; y: number } | null;
  /** Current element id. */
  getElementId: () => string;
}

/**
 * Component-scoped service that owns clipboard/context-menu state
 * (paste position, menu screen position) and exposes thin operations
 * for copy/cut/paste/duplicate/delete/sendToLayer that the host
 * component delegates to.
 */
@Injectable()
export class CanvasContextMenuService {
  private readonly canvasService = inject(CanvasService);
  private readonly canvasClipboard = inject(CanvasClipboardService);
  private readonly canvasSelection = inject(CanvasSelectionService);

  /** Position (in page pixels) where the context menu should appear */
  readonly position = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  /** Canvas-space position where the context menu was opened (for paste) */
  private canvasPos: { x: number; y: number } | null = null;

  /** Clipboard reactive proxy. */
  readonly clipboard = this.canvasClipboard.clipboard;

  /** True when something is in the clipboard. */
  readonly hasClipboard = computed(() => this.clipboard() !== null);

  /** Open the menu by recording its screen + canvas positions. */
  openAt(
    pageX: number,
    pageY: number,
    canvasPointerPos: { x: number; y: number } | null
  ): void {
    this.position.set({ x: pageX, y: pageY });
    this.canvasPos = canvasPointerPos;
  }

  /** Reset the recorded paste position (called after paste from keyboard). */
  clearCanvasPos(): void {
    this.canvasPos = null;
  }

  /** Copy the selected object to the clipboard. */
  copy(callbacks: ContextMenuCallbacks): void {
    const id = callbacks.getSelectedObjectId();
    if (id) this.canvasClipboard.copy(id);
  }

  /** Cut the selected object (copy + remove). */
  cut(callbacks: ContextMenuCallbacks): void {
    const id = callbacks.getSelectedObjectId();
    if (!id) return;
    if (this.canvasClipboard.cutObject(id)) {
      callbacks.setSelectedObjectId(null);
      this.canvasSelection.clearSelection();
    }
  }

  /** Paste from clipboard at the recorded canvas position (or viewport center). */
  paste(callbacks: ContextMenuCallbacks): void {
    if (!this.clipboard()) return;
    const layerId = callbacks.ensureActiveLayer();
    if (!layerId) return;
    const pos = this.canvasPos ?? callbacks.getViewportCenter();
    const newId = this.canvasClipboard.paste(
      layerId,
      pos,
      callbacks.getElementId()
    );
    if (newId) callbacks.setSelectedObjectId(newId);
    this.canvasPos = null;
  }

  /** Duplicate the selected object with a small offset. */
  duplicate(callbacks: ContextMenuCallbacks): void {
    const id = callbacks.getSelectedObjectId();
    if (!id) return;
    const newId = this.canvasClipboard.duplicate(id);
    if (newId) callbacks.setSelectedObjectId(newId);
  }

  /** Get the layer ID of the currently selected object. */
  getSelectedObjectLayerId(callbacks: ContextMenuCallbacks): string {
    const config = this.canvasService.activeConfig();
    const id = callbacks.getSelectedObjectId();
    if (!config || !id) return '';
    return config.objects.find(o => o.id === id)?.layerId ?? '';
  }

  /** Move the selected object to a different layer. */
  sendToLayer(targetLayerId: string, callbacks: ContextMenuCallbacks): void {
    const id = callbacks.getSelectedObjectId();
    if (!id) return;
    this.canvasService.moveObjectToLayer(id, targetLayerId);
  }
}
