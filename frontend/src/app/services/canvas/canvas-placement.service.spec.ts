import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import type {
  CanvasPin,
  CanvasText,
  CanvasToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasPlacementService } from '@services/canvas/canvas-placement.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import type Konva from 'konva';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CanvasPlacementService', () => {
  let service: CanvasPlacementService;
  let canvasService: {
    addObject: ReturnType<typeof vi.fn>;
    updateObject: ReturnType<typeof vi.fn>;
    createPin: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogGateway: { openInsertImageDialog: ReturnType<typeof vi.fn> };
  let localStorage: {
    saveMedia: ReturnType<typeof vi.fn>;
    preCacheMediaUrl: ReturnType<typeof vi.fn>;
  };
  let projectState: {
    project: ReturnType<typeof vi.fn>;
    elements: ReturnType<typeof vi.fn>;
  };
  let relationship: {
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationship: ReturnType<typeof vi.fn>;
  };

  const handlers = {
    ensureLayer: () => 'layer-1',
    pointer: () => ({ x: 100, y: 200 }),
    viewportCenter: () => ({ x: 50, y: 75 }),
    elementId: () => 'elem-1',
  };

  beforeEach(() => {
    canvasService = {
      addObject: vi.fn(),
      updateObject: vi.fn(),
      createPin: vi.fn().mockReturnValue({ id: 'p1', type: 'pin' }),
    };
    dialog = { open: vi.fn() };
    dialogGateway = { openInsertImageDialog: vi.fn() };
    localStorage = {
      saveMedia: vi.fn().mockResolvedValue(undefined),
      preCacheMediaUrl: vi.fn(),
    };
    projectState = {
      project: vi.fn().mockReturnValue({ username: 'u', slug: 's' }),
      elements: vi.fn().mockReturnValue([{ id: 'el-9', name: 'Hero' }]),
    };
    relationship = {
      addRelationship: vi.fn().mockReturnValue({ id: 'rel-1' }),
      removeRelationship: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasPlacementService,
        { provide: CanvasService, useValue: canvasService },
        { provide: MatDialog, useValue: dialog },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: LocalStorageService, useValue: localStorage },
        { provide: ProjectStateService, useValue: projectState },
        { provide: RelationshipService, useValue: relationship },
      ],
    });
    service = TestBed.inject(CanvasPlacementService);
  });

  describe('placePin', () => {
    it('does nothing when pointer is null', () => {
      service.placePin({ ...handlers, pointer: () => null });
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('opens pin dialog and adds pin on confirm', () => {
      const result = { label: 'A', color: '#fff', linkedElementId: undefined };
      dialog.open.mockReturnValue({ afterClosed: () => of(result) });
      service.placePin(handlers);
      expect(canvasService.createPin).toHaveBeenCalledWith(
        'layer-1',
        100,
        200,
        'A',
        expect.objectContaining({ color: '#fff' })
      );
      expect(canvasService.addObject).toHaveBeenCalled();
    });

    it('skips add when dialog cancelled', () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
      service.placePin(handlers);
      expect(canvasService.addObject).not.toHaveBeenCalled();
    });
  });

  describe('placeText', () => {
    const settings: CanvasToolSettings = {
      fill: '#000',
      fontSize: 16,
      fontFamily: 'Arial',
    } as CanvasToolSettings;

    it('does nothing when pointer is null', () => {
      service.placeText({ ...handlers, pointer: () => null }, settings);
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('adds text object on confirm', () => {
      dialog.open.mockReturnValue({
        afterClosed: () => of({ text: 'Hello', color: '#111' }),
      });
      service.placeText(handlers, settings);
      expect(canvasService.addObject).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text', text: 'Hello', fill: '#111' })
      );
    });
  });

  describe('placeDefaultShape', () => {
    it('creates a rect when shapeType is rect', () => {
      const settings: CanvasToolSettings = {
        shapeType: 'rect',
        stroke: '#000',
        strokeWidth: 2,
        fill: '#abc',
      } as CanvasToolSettings;
      service.placeDefaultShape(handlers, settings);
      expect(canvasService.addObject).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'shape', shapeType: 'rect' })
      );
    });

    it('creates a line with points when shapeType is line', () => {
      const settings: CanvasToolSettings = {
        shapeType: 'line',
        stroke: '#000',
        strokeWidth: 2,
        fill: '#abc',
      } as CanvasToolSettings;
      service.placeDefaultShape(handlers, settings);
      const arg = canvasService.addObject.mock.calls[0][0];
      expect(arg.shapeType).toBe('line');
      expect(arg.points).toEqual([0, 0, 100, 0]);
    });
  });

  describe('openTextEditDialog', () => {
    it('updates text node and object on confirm', () => {
      dialog.open.mockReturnValue({
        afterClosed: () => of({ text: 'New', color: '#222' }),
      });
      const obj = { id: 't1', text: 'Old', fill: '#000' } as CanvasText;
      const node = { text: vi.fn(), fill: vi.fn() } as unknown as Konva.Text;
      service.openTextEditDialog(obj, node);
      expect(node.text).toHaveBeenCalledWith('New');
      expect(node.fill).toHaveBeenCalledWith('#222');
      expect(canvasService.updateObject).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ text: 'New', fill: '#222' })
      );
    });
  });

  describe('openPinEditDialog', () => {
    it('updates pin and link indicator on confirm', () => {
      const updateSpy = vi
        .spyOn(CanvasRendererService, 'updatePinLinkIndicator')
        .mockImplementation(() => {});
      dialog.open.mockReturnValue({
        afterClosed: () =>
          of({ label: 'L', color: '#abc', linkedElementId: undefined }),
      });
      const obj = {
        id: 'p1',
        label: 'old',
        color: '#000',
        linkedElementId: undefined,
        relationshipId: undefined,
      } as CanvasPin;
      const label = {
        text: vi.fn(),
        x: vi.fn(),
        width: () => 40,
      } as unknown as Konva.Text;
      const marker = { fill: vi.fn() } as unknown as Konva.Circle;
      const group = {
        getLayer: () => ({ batchDraw: vi.fn() }),
      } as unknown as Konva.Group;
      service.openPinEditDialog(obj, label, marker, group, 'elem-1');
      expect(updateSpy).toHaveBeenCalled();
      expect(canvasService.updateObject).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ label: 'L', color: '#abc' })
      );
    });
  });

  describe('addImage', () => {
    it('returns early when project is null', async () => {
      projectState.project.mockReturnValue(null);
      await service.addImage(handlers);
      expect(dialogGateway.openInsertImageDialog).not.toHaveBeenCalled();
    });

    it('returns early when dialog returns no media', async () => {
      dialogGateway.openInsertImageDialog.mockResolvedValue(undefined);
      await service.addImage(handlers);
      expect(localStorage.saveMedia).not.toHaveBeenCalled();
    });

    it('saves media when dialog returns a blob', async () => {
      const blob = new Blob(['x'], { type: 'image/png' });
      dialogGateway.openInsertImageDialog.mockResolvedValue({
        mediaId: 'm1',
        imageBlob: blob,
      });
      // jsdom Image: stub onload by overriding global Image constructor
      const origImage = global.Image;
      class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 80;
        naturalHeight = 60;
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      }
      (global as any).Image = FakeImage;
      try {
        await service.addImage(handlers);
        await new Promise(r => setTimeout(r, 5));
      } finally {
        (global as any).Image = origImage;
      }
      expect(localStorage.saveMedia).toHaveBeenCalledWith('u/s', 'm1', blob);
      expect(canvasService.addObject).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image', name: 'm1' })
      );
    });
  });
});
