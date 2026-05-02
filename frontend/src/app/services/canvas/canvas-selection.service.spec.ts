import { TestBed } from '@angular/core/testing';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import type Konva from 'konva';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasSelectionService } from './canvas-selection.service';

interface MockNode {
  id: () => string;
  parent: MockNode | null;
  getClientRect?: () => { x: number; y: number; width: number; height: number };
}

function makeNode(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  parent: MockNode | null = null
): MockNode {
  return {
    id: () => id,
    parent,
    getClientRect: () => rect,
  };
}

describe('CanvasSelectionService', () => {
  let service: CanvasSelectionService;
  let transformerNodes: ReturnType<typeof vi.fn>;
  let selectionBatchDraw: ReturnType<typeof vi.fn>;
  let removeObject: ReturnType<typeof vi.fn>;
  let removeRelationship: ReturnType<typeof vi.fn>;
  let getIntersection: ReturnType<typeof vi.fn>;
  let getPointerPosition: ReturnType<typeof vi.fn>;
  let konvaNodes: Map<string, MockNode>;
  let konvaLayers: Map<string, { getChildren: () => MockNode[] }>;
  let activeConfigSig: { objects: { id: string; type: string }[] } | null;

  beforeEach(() => {
    transformerNodes = vi.fn();
    selectionBatchDraw = vi.fn();
    removeObject = vi.fn();
    removeRelationship = vi.fn();
    getIntersection = vi.fn();
    getPointerPosition = vi.fn();
    konvaNodes = new Map();
    konvaLayers = new Map();
    activeConfigSig = { objects: [] };

    const renderer = {
      get transformer() {
        return { nodes: transformerNodes } as unknown as Konva.Transformer;
      },
      get selectionLayer() {
        return { batchDraw: selectionBatchDraw } as unknown as Konva.Layer;
      },
      get stage() {
        return {
          getIntersection,
          getPointerPosition,
        } as unknown as Konva.Stage;
      },
      get konvaNodes() {
        return konvaNodes;
      },
      get konvaLayers() {
        return konvaLayers;
      },
    };

    const canvasService = {
      activeConfig: () => activeConfigSig,
      removeObject,
    };

    const relationshipService = {
      removeRelationship,
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasSelectionService,
        { provide: CanvasRendererService, useValue: renderer },
        { provide: CanvasService, useValue: canvasService },
        { provide: RelationshipService, useValue: relationshipService },
      ],
    });

    service = TestBed.inject(CanvasSelectionService);
  });

  it('selectNode attaches transformer and redraws', () => {
    const node = { id: () => 'n1' } as unknown as Konva.Node;
    service.selectNode(node);
    expect(transformerNodes).toHaveBeenCalledWith([node]);
    expect(selectionBatchDraw).toHaveBeenCalled();
  });

  it('selectNodesInRect with single match notifies onSingleSelected', () => {
    const node = makeNode('a', { x: 0, y: 0, width: 10, height: 10 });
    konvaLayers.set('layer-1', {
      getChildren: () => [node],
    });
    const onSingleSelected = vi.fn();
    const onCleared = vi.fn();
    service.selectNodesInRect(
      { x: 0, y: 0, width: 5, height: 5 },
      { onSingleSelected, onCleared }
    );
    expect(transformerNodes).toHaveBeenCalledWith([node]);
    expect(onSingleSelected).toHaveBeenCalledWith('a');
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('selectNodesInRect with multiple matches notifies onCleared', () => {
    const a = makeNode('a', { x: 0, y: 0, width: 10, height: 10 });
    const b = makeNode('b', { x: 5, y: 5, width: 10, height: 10 });
    konvaLayers.set('layer-1', { getChildren: () => [a, b] });
    const onSingleSelected = vi.fn();
    const onCleared = vi.fn();
    service.selectNodesInRect(
      { x: 0, y: 0, width: 20, height: 20 },
      { onSingleSelected, onCleared }
    );
    expect(transformerNodes).toHaveBeenCalledWith([a, b]);
    expect(onCleared).toHaveBeenCalled();
    expect(onSingleSelected).not.toHaveBeenCalled();
  });

  it('selectNodesInRect with no match notifies onCleared and clears nodes', () => {
    konvaLayers.set('layer-1', { getChildren: () => [] });
    const onSingleSelected = vi.fn();
    const onCleared = vi.fn();
    service.selectNodesInRect(
      { x: 0, y: 0, width: 1, height: 1 },
      { onSingleSelected, onCleared }
    );
    expect(transformerNodes).toHaveBeenCalledWith([]);
    expect(onCleared).toHaveBeenCalled();
  });

  it('selectObjectAtPointer invokes onSelect when intersection is known', () => {
    const node = { id: () => 'obj-1', parent: null } as unknown as Konva.Node;
    konvaNodes.set('obj-1', node);
    getPointerPosition.mockReturnValue({ x: 1, y: 1 });
    getIntersection.mockReturnValue(node);
    const onSelect = vi.fn();
    service.selectObjectAtPointer({ onSelect });
    expect(onSelect).toHaveBeenCalledWith('obj-1');
  });

  it('selectObjectAtPointer does nothing when no intersection', () => {
    getPointerPosition.mockReturnValue({ x: 1, y: 1 });
    getIntersection.mockReturnValue(null);
    const onSelect = vi.fn();
    service.selectObjectAtPointer({ onSelect });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selectObjectAtPointer does nothing when pointer position is null', () => {
    getPointerPosition.mockReturnValue(null);
    const onSelect = vi.fn();
    service.selectObjectAtPointer({ onSelect });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clearSelection clears transformer nodes and redraws', () => {
    service.clearSelection();
    expect(transformerNodes).toHaveBeenCalledWith([]);
    expect(selectionBatchDraw).toHaveBeenCalled();
  });

  it('deleteObject calls removeObject for non-pin', () => {
    activeConfigSig = { objects: [{ id: 'o1', type: 'shape' }] };
    service.deleteObject('o1');
    expect(removeObject).toHaveBeenCalledWith('o1');
    expect(removeRelationship).not.toHaveBeenCalled();
  });

  it('deleteObject removes pin relationship for pins', () => {
    activeConfigSig = {
      objects: [{ id: 'pin-1', type: 'pin' }],
    };
    service.deleteObject('pin-1');
    expect(removeObject).toHaveBeenCalledWith('pin-1');
  });

  it('deleteObject still removes object if not in active config', () => {
    activeConfigSig = { objects: [] };
    service.deleteObject('missing');
    expect(removeObject).toHaveBeenCalledWith('missing');
  });
});
