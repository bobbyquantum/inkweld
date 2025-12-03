import {
  Element as ElementDto,
  ElementType,
} from '../../api-client/model/element';
import { mapDtoToProjectElement, ProjectElement } from './project-element';

describe('project-element model', () => {
  describe('mapDtoToProjectElement', () => {
    it('should convert API Element DTO to ProjectElement', () => {
      const dto: ElementDto = {
        id: 'test-id',
        name: 'Test Element',
        type: ElementType.Folder,
        parentId: null,
        order: 0,
        level: 1,
        expandable: true,
        version: 1,
        metadata: { key: 'value' },
      };

      const result = mapDtoToProjectElement(dto);

      expect(result).toEqual({
        id: 'test-id',
        name: 'Test Element',
        type: ElementType.Folder,
        parentId: null,
        order: 0,
        level: 1,
        expandable: true,
        version: 1,
        metadata: { key: 'value' },
        expanded: false,
        visible: true,
      });
    });

    it('should set expanded to false by default', () => {
      const dto: ElementDto = {
        id: 'id',
        name: 'name',
        type: ElementType.Item,
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      };

      const result = mapDtoToProjectElement(dto);

      expect(result.expanded).toBe(false);
    });

    it('should set visible to true by default', () => {
      const dto: ElementDto = {
        id: 'id',
        name: 'name',
        type: ElementType.Character,
        parentId: 'parent-id',
        order: 1,
        level: 2,
        expandable: false,
        version: 1,
        metadata: {},
      };

      const result = mapDtoToProjectElement(dto);

      expect(result.visible).toBe(true);
    });

    it('should preserve all original DTO properties', () => {
      const dto: ElementDto = {
        id: 'unique-id',
        name: 'Complex Element',
        type: ElementType.Folder,
        parentId: 'parent-123',
        order: 5,
        level: 3,
        expandable: true,
        version: 42,
        metadata: {
          customKey: 'customValue',
          anotherKey: 'anotherValue',
        },
      };

      const result = mapDtoToProjectElement(dto);

      expect(result.id).toBe(dto.id);
      expect(result.name).toBe(dto.name);
      expect(result.type).toBe(dto.type);
      expect(result.parentId).toBe(dto.parentId);
      expect(result.order).toBe(dto.order);
      expect(result.level).toBe(dto.level);
      expect(result.expandable).toBe(dto.expandable);
      expect(result.version).toBe(dto.version);
      expect(result.metadata).toEqual(dto.metadata);
    });
  });

  describe('ProjectElement interface', () => {
    it('should allow expanded and visible to be optional', () => {
      // Type test - if this compiles, the interface is correct
      const element: ProjectElement = {
        id: 'id',
        name: 'name',
        type: ElementType.Item,
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
        // expanded and visible are intentionally omitted
      };

      // The element should still be valid without expanded/visible
      expect(element.expanded).toBeUndefined();
      expect(element.visible).toBeUndefined();
    });
  });
});
