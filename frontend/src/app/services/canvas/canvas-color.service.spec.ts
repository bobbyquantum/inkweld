import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import Konva from 'konva';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasColorService } from './canvas-color.service';
import { CanvasRendererService } from './canvas-renderer.service';

interface AnyObj {
  id: string;
  type: string;
  [k: string]: unknown;
}

describe('CanvasColorService', () => {
  let service: CanvasColorService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockCanvasService: {
    activeConfig: ReturnType<typeof signal>;
    updateObject: ReturnType<typeof vi.fn>;
  };
  let mockRenderer: { konvaLayers: Map<string, unknown> };

  beforeEach(() => {
    mockDialog = { open: vi.fn() };
    mockCanvasService = {
      activeConfig: signal<{ objects: AnyObj[] } | null>(null),
      updateObject: vi.fn(),
    };
    mockRenderer = { konvaLayers: new Map() };

    TestBed.configureTestingModule({
      providers: [
        CanvasColorService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: CanvasService, useValue: mockCanvasService },
        { provide: CanvasRendererService, useValue: mockRenderer },
      ],
    });
    service = TestBed.inject(CanvasColorService);
  });

  describe('openEditColorsDialog', () => {
    it('does nothing when no config is active', () => {
      service.openEditColorsDialog('any');
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('does nothing when object not found', () => {
      mockCanvasService.activeConfig.set({ objects: [] });
      service.openEditColorsDialog('missing');
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('does not open dialog for image objects', () => {
      mockCanvasService.activeConfig.set({
        objects: [{ id: 'i', type: 'image' }],
      });
      service.openEditColorsDialog('i');
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('opens dialog with fill only for text', () => {
      mockCanvasService.activeConfig.set({
        objects: [{ id: 't', type: 'text', fill: '#333' }],
      });
      mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.openEditColorsDialog('t');
      const data = mockDialog.open.mock.calls[0][1].data;
      expect(data.showFill).toBe(true);
      expect(data.showStroke).toBe(false);
      expect(data.fill).toBe('#333');
    });

    it('opens dialog with fill and stroke for shape', () => {
      mockCanvasService.activeConfig.set({
        objects: [
          { id: 's', type: 'shape', fill: '#ff0000', stroke: '#000000' },
        ],
      });
      mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.openEditColorsDialog('s');
      const data = mockDialog.open.mock.calls[0][1].data;
      expect(data.showFill).toBe(true);
      expect(data.showStroke).toBe(true);
      expect(data.fill).toBe('#ff0000');
      expect(data.stroke).toBe('#000000');
    });

    it('opens dialog with stroke only for open path', () => {
      mockCanvasService.activeConfig.set({
        objects: [{ id: 'p', type: 'path', stroke: '#0000ff', closed: false }],
      });
      mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.openEditColorsDialog('p');
      const data = mockDialog.open.mock.calls[0][1].data;
      expect(data.showStroke).toBe(true);
      expect(data.showFill).toBe(false);
    });

    it('opens dialog with stroke and fill for closed path', () => {
      mockCanvasService.activeConfig.set({
        objects: [
          {
            id: 'p',
            type: 'path',
            stroke: '#0000ff',
            closed: true,
            fill: '#00ff00',
          },
        ],
      });
      mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.openEditColorsDialog('p');
      const data = mockDialog.open.mock.calls[0][1].data;
      expect(data.showStroke).toBe(true);
      expect(data.showFill).toBe(true);
      expect(data.fill).toBe('#00ff00');
    });

    it('opens dialog with fill (color) for pin', () => {
      mockCanvasService.activeConfig.set({
        objects: [{ id: 'pin', type: 'pin', color: '#E53935' }],
      });
      mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.openEditColorsDialog('pin');
      const data = mockDialog.open.mock.calls[0][1].data;
      expect(data.fill).toBe('#E53935');
    });

    it('persists shape colours and live-updates the konva node', () => {
      const fillFn = vi.fn();
      const strokeFn = vi.fn();
      const batchDraw = vi.fn();
      const node = {
        fill: fillFn,
        stroke: strokeFn,
        getLayer: () => ({ batchDraw }),
      };
      const layer = { findOne: vi.fn(() => node) };
      mockRenderer.konvaLayers.set('l', layer);

      mockCanvasService.activeConfig.set({
        objects: [{ id: 's', type: 'shape', fill: '#000', stroke: '#fff' }],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#aabb00', stroke: '#112233' }),
      });

      service.openEditColorsDialog('s');

      expect(mockCanvasService.updateObject).toHaveBeenCalledWith(
        's',
        expect.objectContaining({ fill: '#aabb00', stroke: '#112233' })
      );
      expect(batchDraw).toHaveBeenCalled();
    });

    it('persists pin colour under "color" key', () => {
      mockCanvasService.activeConfig.set({
        objects: [{ id: 'p', type: 'pin', color: '#E53935' }],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#00FF00' }),
      });
      service.openEditColorsDialog('p');
      expect(mockCanvasService.updateObject).toHaveBeenCalledWith(
        'p',
        expect.objectContaining({ color: '#00FF00' })
      );
    });

    it('does not update when dialog cancelled', () => {
      mockCanvasService.activeConfig.set({
        objects: [{ id: 's', type: 'shape', fill: '#000' }],
      });
      mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.openEditColorsDialog('s');
      expect(mockCanvasService.updateObject).not.toHaveBeenCalled();
    });
  });

  describe('konva node colour application', () => {
    function setupNode(node: unknown): void {
      const layer = { findOne: vi.fn(() => node) };
      mockRenderer.konvaLayers.set('l', layer);
    }

    it('applies fill to text node', () => {
      const node = Object.create(Konva.Text.prototype);
      node.fill = vi.fn();
      node.getLayer = () => ({ batchDraw: vi.fn() });
      setupNode(node);

      mockCanvasService.activeConfig.set({
        objects: [{ id: 't', type: 'text', fill: '#000' }],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#333' }),
      });

      service.openEditColorsDialog('t');
      expect(node.fill).toHaveBeenCalledWith('#333');
    });

    it('applies stroke and fill to path (Konva.Line) node', () => {
      const node = Object.create(Konva.Line.prototype);
      node.fill = vi.fn();
      node.stroke = vi.fn();
      node.getLayer = () => ({ batchDraw: vi.fn() });
      setupNode(node);

      mockCanvasService.activeConfig.set({
        objects: [
          {
            id: 'p',
            type: 'path',
            stroke: '#0000ff',
            closed: true,
            fill: '#00ff00',
          },
        ],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ stroke: '#ff0000', fill: '#00ff00' }),
      });

      service.openEditColorsDialog('p');
      expect(node.stroke).toHaveBeenCalledWith('#ff0000');
      expect(node.fill).toHaveBeenCalledWith('#00ff00');
    });

    it('applies fill to pin marker (Circle) inside group', () => {
      const circle = { fill: vi.fn() };
      const group = Object.create(Konva.Group.prototype);
      group.findOne = vi.fn((sel: string) =>
        sel === 'Circle' ? circle : null
      );
      group.getLayer = () => ({ batchDraw: vi.fn() });
      setupNode(group);

      mockCanvasService.activeConfig.set({
        objects: [{ id: 'pin', type: 'pin', color: '#000' }],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#E53935' }),
      });

      service.openEditColorsDialog('pin');
      expect(circle.fill).toHaveBeenCalledWith('#E53935');
    });

    it('skips konva update when node not found', () => {
      mockRenderer.konvaLayers.set('l', { findOne: vi.fn(() => null) });
      mockCanvasService.activeConfig.set({
        objects: [{ id: 's', type: 'shape', fill: '#000' }],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#aaa' }),
      });
      // Should not throw
      expect(() => service.openEditColorsDialog('s')).not.toThrow();
      expect(mockCanvasService.updateObject).toHaveBeenCalled();
    });

    it('handles shape node missing fill/stroke gracefully', () => {
      const node = { getLayer: () => ({ batchDraw: vi.fn() }) };
      setupNode(node);
      mockCanvasService.activeConfig.set({
        objects: [{ id: 's', type: 'shape', fill: '#000' }],
      });
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#aaa', stroke: '#bbb' }),
      });
      expect(() => service.openEditColorsDialog('s')).not.toThrow();
    });
  });
});
