import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { RelationshipService } from '@services/relationship/relationship.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasLayerService } from './canvas-layer.service';

describe('CanvasLayerService', () => {
  let service: CanvasLayerService;
  let canvasService: any;
  let dialog: any;
  let relationshipService: any;

  beforeEach(() => {
    canvasService = {
      activeConfig: vi.fn(() => null),
      addLayer: vi.fn(() => 'new-layer'),
      updateLayer: vi.fn(),
      addObject: vi.fn(),
      removeLayer: vi.fn(),
      getObjectsForLayer: vi.fn(() => []),
    };
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(undefined) })),
    };
    relationshipService = {
      removeRelationship: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasLayerService,
        { provide: CanvasService, useValue: canvasService },
        { provide: MatDialog, useValue: dialog },
        { provide: RelationshipService, useValue: relationshipService },
      ],
    });
    service = TestBed.inject(CanvasLayerService);
  });

  describe('addLayer', () => {
    it('returns the new layer id from canvasService', () => {
      expect(service.addLayer()).toBe('new-layer');
    });

    it('returns null when canvasService.addLayer returns falsy', () => {
      canvasService.addLayer.mockReturnValue(null);
      expect(service.addLayer()).toBeNull();
    });
  });

  describe('toggleVisibility', () => {
    it('toggles visible=true to false', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', visible: true }],
        objects: [],
      });
      service.toggleVisibility('L1');
      expect(canvasService.updateLayer).toHaveBeenCalledWith('L1', {
        visible: false,
      });
    });

    it('toggles visible=false to true', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', visible: false }],
        objects: [],
      });
      service.toggleVisibility('L1');
      expect(canvasService.updateLayer).toHaveBeenCalledWith('L1', {
        visible: true,
      });
    });

    it('does nothing when layer not found', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [],
        objects: [],
      });
      service.toggleVisibility('missing');
      expect(canvasService.updateLayer).not.toHaveBeenCalled();
    });
  });

  describe('toggleLock', () => {
    it('toggles locked=false to true', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', locked: false }],
        objects: [],
      });
      service.toggleLock('L1');
      expect(canvasService.updateLayer).toHaveBeenCalledWith('L1', {
        locked: true,
      });
    });

    it('toggles locked=true to false', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', locked: true }],
        objects: [],
      });
      service.toggleLock('L1');
      expect(canvasService.updateLayer).toHaveBeenCalledWith('L1', {
        locked: false,
      });
    });

    it('does nothing when layer not found', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [],
        objects: [],
      });
      service.toggleLock('missing');
      expect(canvasService.updateLayer).not.toHaveBeenCalled();
    });
  });

  describe('renameLayer', () => {
    it('opens dialog and returns undefined when dialog is cancelled', async () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', name: 'My Layer' }],
      });
      const result = await service.renameLayer('L1');
      expect(dialog.open).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('updates layer name and returns new name when dialog confirms', async () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', name: 'Old Name' }],
      });
      dialog.open.mockReturnValue({ afterClosed: () => of('  New Name  ') });
      const result = await service.renameLayer('L1');
      expect(canvasService.updateLayer).toHaveBeenCalledWith('L1', {
        name: 'New Name',
      });
      expect(result).toBe('  New Name  ');
    });

    it('does not update when dialog returns whitespace-only string', async () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', name: 'Old Name' }],
      });
      dialog.open.mockReturnValue({ afterClosed: () => of('   ') });
      await service.renameLayer('L1');
      expect(canvasService.updateLayer).not.toHaveBeenCalled();
    });

    it('returns undefined immediately when layer not found', async () => {
      canvasService.activeConfig.mockReturnValue({ layers: [] });
      const result = await service.renameLayer('missing');
      expect(result).toBeUndefined();
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('duplicateLayer', () => {
    it('creates copies of all objects in the source layer', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', name: 'Layer 1' }],
        objects: [
          {
            id: 'O1',
            layerId: 'L1',
            type: 'text',
            x: 10,
            y: 20,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
          },
        ],
      });
      canvasService.addLayer.mockReturnValue('L2');
      service.duplicateLayer('L1');
      expect(canvasService.addObject).toHaveBeenCalledTimes(1);
      const added = canvasService.addObject.mock.calls[0][0];
      expect(added.layerId).toBe('L2');
      expect(added.id).not.toBe('O1');
      expect(added.x).toBe(10);
    });

    it('clears pin relationship fields on duplicated pin objects', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', name: 'Layer 1' }],
        objects: [
          {
            id: 'P1',
            layerId: 'L1',
            type: 'pin',
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            color: '#f00',
            label: 'pin',
            icon: '',
            relationshipId: 'R1',
            linkedElementId: 'E1',
          },
        ],
      });
      canvasService.addLayer.mockReturnValue('L2');
      service.duplicateLayer('L1');
      const added = canvasService.addObject.mock.calls[0][0];
      expect(added.relationshipId).toBeUndefined();
      expect(added.linkedElementId).toBeUndefined();
    });

    it('does nothing when config is null', () => {
      canvasService.activeConfig.mockReturnValue(null);
      service.duplicateLayer('L1');
      expect(canvasService.addObject).not.toHaveBeenCalled();
    });

    it('does nothing when layer not found', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [],
        objects: [],
      });
      service.duplicateLayer('missing');
      expect(canvasService.addObject).not.toHaveBeenCalled();
    });

    it('does nothing when addLayer returns falsy', () => {
      canvasService.activeConfig.mockReturnValue({
        layers: [{ id: 'L1', name: 'Layer 1' }],
        objects: [
          {
            id: 'O1',
            layerId: 'L1',
            type: 'text',
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
          },
        ],
      });
      canvasService.addLayer.mockReturnValue(null);
      service.duplicateLayer('L1');
      expect(canvasService.addObject).not.toHaveBeenCalled();
    });
  });

  describe('deleteLayer', () => {
    it('removes the layer when user confirms', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      const result = await service.deleteLayer('L1');
      expect(canvasService.removeLayer).toHaveBeenCalledWith('L1');
      expect(result).toBe(true);
    });

    it('calls cleanupPinRelationships with layer objects', async () => {
      canvasService.getObjectsForLayer.mockReturnValue([
        {
          id: 'P1',
          type: 'pin',
          layerId: 'L1',
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          color: '#f00',
          label: '',
          icon: '',
          relationshipId: 'R1',
        },
      ]);
      dialog.open.mockReturnValue({ afterClosed: () => of(true) });
      await service.deleteLayer('L1');
      expect(relationshipService.removeRelationship).toHaveBeenCalledWith('R1');
    });

    it('does not remove layer when user cancels', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(false) });
      const result = await service.deleteLayer('L1');
      expect(canvasService.removeLayer).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('does not remove layer when dialog returns undefined', async () => {
      // default mock returns of(undefined)
      const result = await service.deleteLayer('L1');
      expect(canvasService.removeLayer).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
