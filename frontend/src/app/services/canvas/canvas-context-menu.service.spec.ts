import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasClipboardService } from './canvas-clipboard.service';
import {
  CanvasContextMenuService,
  type ContextMenuCallbacks,
} from './canvas-context-menu.service';
import { CanvasSelectionService } from './canvas-selection.service';

describe('CanvasContextMenuService', () => {
  let service: CanvasContextMenuService;
  let clipboard: any;
  let selection: any;
  let canvasService: any;
  let cb: ContextMenuCallbacks;

  beforeEach(() => {
    clipboard = {
      clipboard: signal(null),
      copy: vi.fn(),
      cutObject: vi.fn(() => true),
      paste: vi.fn(() => 'new-id'),
      duplicate: vi.fn(() => 'dup-id'),
    };
    selection = { clearSelection: vi.fn() };
    canvasService = {
      activeConfig: vi.fn(() => ({
        objects: [{ id: 'obj1', layerId: 'L1' }],
      })),
      moveObjectToLayer: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasContextMenuService,
        { provide: CanvasClipboardService, useValue: clipboard },
        { provide: CanvasSelectionService, useValue: selection },
        { provide: CanvasService, useValue: canvasService },
      ],
    });
    service = TestBed.inject(CanvasContextMenuService);

    cb = {
      getSelectedObjectId: vi.fn(() => 'obj1'),
      setSelectedObjectId: vi.fn(),
      ensureActiveLayer: vi.fn(() => 'L1'),
      getViewportCenter: vi.fn(() => ({ x: 5, y: 5 })),
      getCanvasPointerPosition: vi.fn(() => ({ x: 1, y: 2 })),
      getElementId: vi.fn(() => 'el1'),
    };
  });

  it('records position and canvas pointer on openAt', () => {
    service.openAt(100, 200, { x: 9, y: 8 });
    expect(service.position()).toEqual({ x: 100, y: 200 });
  });

  it('copy delegates to clipboard.copy', () => {
    service.copy(cb);
    expect(clipboard.copy).toHaveBeenCalledWith('obj1');
  });

  it('cut clears selection on success', () => {
    service.cut(cb);
    expect(cb.setSelectedObjectId).toHaveBeenCalledWith(null);
    expect(selection.clearSelection).toHaveBeenCalled();
  });

  it('paste does nothing when clipboard empty', () => {
    service.paste(cb);
    expect(clipboard.paste).not.toHaveBeenCalled();
  });

  it('paste at viewport center when no canvas pos recorded', () => {
    clipboard.clipboard.set({ obj: 'x' });
    service.paste(cb);
    expect(clipboard.paste).toHaveBeenCalledWith('L1', { x: 5, y: 5 }, 'el1');
    expect(cb.setSelectedObjectId).toHaveBeenCalledWith('new-id');
  });

  it('duplicate selects new id', () => {
    service.duplicate(cb);
    expect(cb.setSelectedObjectId).toHaveBeenCalledWith('dup-id');
  });

  it('getSelectedObjectLayerId returns layer for selected', () => {
    expect(service.getSelectedObjectLayerId(cb)).toBe('L1');
  });

  it('sendToLayer delegates to canvasService', () => {
    service.sendToLayer('L2', cb);
    expect(canvasService.moveObjectToLayer).toHaveBeenCalledWith('obj1', 'L2');
  });
});
