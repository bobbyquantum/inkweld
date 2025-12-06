/**
 * Element Reference Tooltip Component Tests
 */

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Element, ElementType } from '../../../../api-client';
import { LoggerService } from '../../../services/core/logger.service';
import { ProjectStateService } from '../../../services/project/project-state.service';
import { WorldbuildingService } from '../../../services/worldbuilding/worldbuilding.service';
import { ElementRefService } from '../element-ref.service';
import {
  ElementRefTooltipComponent,
  ElementRefTooltipData,
} from './element-ref-tooltip.component';

describe('ElementRefTooltipComponent', () => {
  let component: ElementRefTooltipComponent;
  let fixture: ComponentFixture<ElementRefTooltipComponent>;
  let mockElements: Element[];

  beforeEach(async () => {
    mockElements = [
      {
        id: 'test-id',
        name: 'Test Element',
        type: ElementType.Item,
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      },
    ];

    await TestBed.configureTestingModule({
      imports: [ElementRefTooltipComponent],
      providers: [
        ElementRefService,
        {
          provide: ProjectStateService,
          useValue: {
            elements: signal(mockElements),
            project: signal(null),
          },
        },
        {
          provide: WorldbuildingService,
          useValue: {
            getCustomSchemaTypes: vi.fn().mockReturnValue([]),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementRefTooltipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('visibility', () => {
    it('should be hidden when no tooltip data', () => {
      expect(component.isVisible()).toBe(false);
    });

    it('should be visible when tooltip data is set', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Chapter 1',
        originalName: 'Chapter 1',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      expect(component.isVisible()).toBe(true);
    });

    it('should hide when tooltip data is set to null', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Chapter 1',
        originalName: 'Chapter 1',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();
      expect(component.isVisible()).toBe(true);

      component.tooltipData = null;
      fixture.detectChanges();
      expect(component.isVisible()).toBe(false);
    });
  });

  describe('display content', () => {
    const tooltipData: ElementRefTooltipData = {
      elementId: 'test-id',
      elementType: ElementType.Character,
      displayText: 'Elena',
      originalName: 'Elena',
      position: { x: 100, y: 200 },
    };

    beforeEach(() => {
      // Mock element lookup for CHARACTER type
      const elementRefService = TestBed.inject(ElementRefService);
      vi.spyOn(elementRefService, 'getElementById').mockReturnValue({
        id: 'test-id',
        name: 'Elena',
        type: ElementType.Character,
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      });

      component.tooltipData = tooltipData;
      fixture.detectChanges();
    });

    it('should display the element name in header', () => {
      const header = fixture.nativeElement.querySelector('.element-name');
      expect(header).toBeTruthy();
      expect(header.textContent).toContain('Elena');
    });

    it('should display the element type badge', () => {
      const badge = fixture.nativeElement.querySelector('.tooltip-type-badge');
      expect(badge).toBeTruthy();
      expect(badge?.textContent?.trim()).toBe('Character');
    });

    it('should show correct icon for element type', () => {
      expect(component.getTypeIcon()).toBe('person');
    });

    it('should format element type for display', () => {
      expect(component.formatElementType()).toBe('Character');
    });
  });

  describe('element type icons', () => {
    const testCases = [
      { type: ElementType.Item, icon: 'description' },
      { type: ElementType.Character, icon: 'person' },
      { type: ElementType.Location, icon: 'place' },
      { type: ElementType.Folder, icon: 'folder' },
      { type: ElementType.WbItem, icon: 'category' },
      { type: ElementType.Map, icon: 'map' },
    ];

    testCases.forEach(({ type, icon }) => {
      it(`should return '${icon}' icon for ${type} type`, () => {
        // Mock element of the specific type so the service can resolve it
        const elementRefService = TestBed.inject(ElementRefService);
        vi.spyOn(elementRefService, 'getElementById').mockReturnValue({
          id: 'test-id',
          name: 'Test Element',
          type: type,
          parentId: null,
          order: 0,
          level: 0,
          expandable: false,
          version: 1,
          metadata: {},
        });

        const tooltipData: ElementRefTooltipData = {
          elementId: 'test-id',
          elementType: type,
          displayText: 'Test',
          originalName: 'Test',
          position: { x: 100, y: 200 },
        };

        component.tooltipData = tooltipData;
        fixture.detectChanges();

        expect(component.getTypeIcon()).toBe(icon);
      });
    });

    it('should return default icon for unknown type when element not found', () => {
      // Ensure element is NOT found so it falls back to type-based icon
      const elementRefService = TestBed.inject(ElementRefService);
      vi.spyOn(elementRefService, 'getElementById').mockReturnValue(undefined);

      const tooltipData: ElementRefTooltipData = {
        elementId: 'nonexistent-id',
        elementType: 'UNKNOWN' as ElementType,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      // Default icon from getDefaultIconForType for unknown type is 'description'
      expect(component.getTypeIcon()).toBe('description');
    });
  });

  describe('type formatting', () => {
    const typeTestCases = [
      { type: ElementType.Item, label: 'Document' },
      { type: ElementType.Character, label: 'Character' },
      { type: ElementType.Location, label: 'Location' },
      { type: ElementType.Folder, label: 'Folder' },
      { type: ElementType.WbItem, label: 'Item' },
      { type: ElementType.Map, label: 'Map' },
    ];

    typeTestCases.forEach(({ type, label }) => {
      it(`should format ${type} as '${label}'`, () => {
        const tooltipData: ElementRefTooltipData = {
          elementId: 'test-id',
          elementType: type,
          displayText: 'Test',
          originalName: 'Test',
          position: { x: 100, y: 200 },
        };

        component.tooltipData = tooltipData;
        fixture.detectChanges();

        expect(component.formatElementType()).toBe(label);
      });
    });
  });

  describe('positioning', () => {
    it('should calculate position based on tooltip data', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      const position = component.tooltipPosition();
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
    });

    it('should position above when near bottom of viewport', () => {
      // Simulate position near bottom of screen
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: window.innerHeight - 50 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      expect(component.showAbove()).toBe(true);
    });

    it('should position below when plenty of space', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 100 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      expect(component.showAbove()).toBe(false);
    });
  });

  describe('keyboard handling', () => {
    it('should close on Escape key', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();
      expect(component.isVisible()).toBe(true);

      // Trigger the escape handler directly
      component.onEscape();
      fixture.detectChanges();

      expect(component.isVisible()).toBe(false);
    });
  });

  describe('preview content', () => {
    it('should reset preview content when data changes to null', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      component.tooltipData = null;
      fixture.detectChanges();

      expect(component.previewContent()).toBeNull();
      expect(component.isLoadingPreview()).toBe(false);
    });
  });
});
