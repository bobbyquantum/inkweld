import {
  CANVAS_PIN_RELATIONSHIP_TYPE,
  type CanvasObject,
  type CanvasPin,
  type CanvasShape,
} from '@models/canvas.model';
import type { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupPinRelationships,
  createPinRelationship,
  ensureCanvasPinRelationshipType,
  removePinRelationship,
} from './canvas-pin-helpers';

// ─────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────

function createMockRelationshipService() {
  return {
    addRelationship: vi.fn().mockReturnValue({ id: 'rel-123' }),
    removeRelationship: vi.fn(),
    getTypeById: vi.fn(),
    addRawType: vi.fn(),
  } as unknown as RelationshipService;
}

const baseObj = {
  id: 'pin-1',
  layerId: 'l',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

// ─────────────────────────────────────────────────────────────────────────
// createPinRelationship
// ─────────────────────────────────────────────────────────────────────────

describe('createPinRelationship', () => {
  let svc: ReturnType<typeof createMockRelationshipService>;

  beforeEach(() => {
    svc = createMockRelationshipService();
  });

  it('should create a relationship and return its ID', () => {
    const id = createPinRelationship(
      svc as unknown as RelationshipService,
      'canvas-el',
      'target-el'
    );
    expect(id).toBe('rel-123');
    expect(svc.addRelationship).toHaveBeenCalledWith(
      'canvas-el',
      'target-el',
      CANVAS_PIN_RELATIONSHIP_TYPE
    );
  });

  it('should ensure the pin relationship type exists before creating', () => {
    createPinRelationship(
      svc as unknown as RelationshipService,
      'canvas-el',
      'target-el'
    );
    expect(svc.getTypeById).toHaveBeenCalledWith(CANVAS_PIN_RELATIONSHIP_TYPE);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// removePinRelationship
// ─────────────────────────────────────────────────────────────────────────

describe('removePinRelationship', () => {
  let svc: ReturnType<typeof createMockRelationshipService>;

  beforeEach(() => {
    svc = createMockRelationshipService();
  });

  it('should remove relationship when pin has relationshipId', () => {
    const pin: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'Test',
      icon: 'place',
      color: '#f00',
      linkedElementId: 'el-1',
      relationshipId: 'rel-abc',
    };
    removePinRelationship(svc as unknown as RelationshipService, pin);
    expect(svc.removeRelationship).toHaveBeenCalledWith('rel-abc');
  });

  it('should not call removeRelationship when pin has no relationshipId', () => {
    const pin: CanvasPin = {
      ...baseObj,
      type: 'pin',
      label: 'Test',
      icon: 'place',
      color: '#f00',
    };
    removePinRelationship(svc as unknown as RelationshipService, pin);
    expect(svc.removeRelationship).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ensureCanvasPinRelationshipType
// ─────────────────────────────────────────────────────────────────────────

describe('ensureCanvasPinRelationshipType', () => {
  let svc: ReturnType<typeof createMockRelationshipService>;

  beforeEach(() => {
    svc = createMockRelationshipService();
  });

  it('should add the type when it does not exist', () => {
    (svc.getTypeById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    ensureCanvasPinRelationshipType(svc as unknown as RelationshipService);
    expect(svc.addRawType).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CANVAS_PIN_RELATIONSHIP_TYPE,
        name: 'Pinned on canvas',
      })
    );
  });

  it('should not add the type when it already exists', () => {
    (svc.getTypeById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: CANVAS_PIN_RELATIONSHIP_TYPE,
    });
    ensureCanvasPinRelationshipType(svc as unknown as RelationshipService);
    expect(svc.addRawType).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// cleanupPinRelationships
// ─────────────────────────────────────────────────────────────────────────

describe('cleanupPinRelationships', () => {
  let svc: ReturnType<typeof createMockRelationshipService>;

  beforeEach(() => {
    svc = createMockRelationshipService();
  });

  it('should remove relationships for all linked pins', () => {
    const objects: CanvasObject[] = [
      {
        ...baseObj,
        id: 'pin-1',
        type: 'pin',
        label: 'P1',
        icon: 'place',
        color: '#f00',
        relationshipId: 'rel-1',
      } as CanvasPin,
      {
        ...baseObj,
        id: 'pin-2',
        type: 'pin',
        label: 'P2',
        icon: 'place',
        color: '#f00',
        relationshipId: 'rel-2',
      } as CanvasPin,
    ];
    cleanupPinRelationships(svc as unknown as RelationshipService, objects);
    expect(svc.removeRelationship).toHaveBeenCalledTimes(2);
    expect(svc.removeRelationship).toHaveBeenCalledWith('rel-1');
    expect(svc.removeRelationship).toHaveBeenCalledWith('rel-2');
  });

  it('should skip non-pin objects', () => {
    const objects: CanvasObject[] = [
      {
        ...baseObj,
        id: 'shape-1',
        type: 'shape',
        shapeType: 'rect',
        width: 50,
        height: 50,
        stroke: '#000',
        strokeWidth: 1,
      } as CanvasShape,
    ];
    cleanupPinRelationships(svc as unknown as RelationshipService, objects);
    expect(svc.removeRelationship).not.toHaveBeenCalled();
  });

  it('should handle empty array', () => {
    cleanupPinRelationships(svc as unknown as RelationshipService, []);
    expect(svc.removeRelationship).not.toHaveBeenCalled();
  });

  it('should skip pins without relationshipId', () => {
    const objects: CanvasObject[] = [
      {
        ...baseObj,
        id: 'pin-1',
        type: 'pin',
        label: 'Unlinked',
        icon: 'place',
        color: '#f00',
      } as CanvasPin,
    ];
    cleanupPinRelationships(svc as unknown as RelationshipService, objects);
    expect(svc.removeRelationship).not.toHaveBeenCalled();
  });
});
