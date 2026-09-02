import {
  CANVAS_PIN_RELATIONSHIP_TYPE,
  type CanvasPin,
} from '@models/canvas.model';
import type { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPinRelationship,
  ensureCanvasLinkRelationshipType,
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
    const id = createPinRelationship(svc, 'canvas-el', 'target-el');
    expect(id).toBe('rel-123');
    expect(svc.addRelationship).toHaveBeenCalledWith(
      'canvas-el',
      'target-el',
      CANVAS_PIN_RELATIONSHIP_TYPE
    );
  });

  it('should ensure the pin relationship type exists before creating', () => {
    createPinRelationship(svc, 'canvas-el', 'target-el');
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
    removePinRelationship(svc, pin);
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
    removePinRelationship(svc, pin);
    expect(svc.removeRelationship).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ensureCanvasLinkRelationshipType
// ─────────────────────────────────────────────────────────────────────────

describe('ensureCanvasLinkRelationshipType', () => {
  let svc: ReturnType<typeof createMockRelationshipService>;

  beforeEach(() => {
    svc = createMockRelationshipService();
  });

  it('should add the type when it does not exist', () => {
    (svc.getTypeById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    ensureCanvasLinkRelationshipType(svc, 'pin');
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
    ensureCanvasLinkRelationshipType(svc, 'pin');
    expect(svc.addRawType).not.toHaveBeenCalled();
  });
});
