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
            getIdentityData: vi
              .fn()
              .mockResolvedValue({ description: undefined }),
            getSchemaFromLibrary: vi.fn().mockReturnValue(null),
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
      elementType: ElementType.Worldbuilding,
      displayText: 'Elena',
      originalName: 'Elena',
      position: { x: 100, y: 200 },
    };

    beforeEach(() => {
      // Mock element lookup for WORLDBUILDING type
      const elementRefService = TestBed.inject(ElementRefService);
      vi.spyOn(elementRefService, 'getElementById').mockReturnValue({
        id: 'test-id',
        name: 'Elena',
        type: ElementType.Worldbuilding,
        schemaId: 'character-v1',
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
      expect(badge?.textContent?.trim()).toBe('Worldbuilding');
    });

    it('should show correct icon for element type', () => {
      expect(component.getTypeIcon()).toBe('category');
    });

    it('should format element type for display', () => {
      expect(component.formatElementType()).toBe('Worldbuilding');
    });

    it('should show display alias when displayText differs from originalName', () => {
      const aliasTooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Worldbuilding,
        displayText: 'The Hero', // Different from original name
        originalName: 'Elena',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = aliasTooltipData;
      fixture.detectChanges();

      const aliasElement =
        fixture.nativeElement.querySelector('.display-alias');
      expect(aliasElement).toBeTruthy();
      expect(aliasElement.textContent).toContain('The Hero');
    });

    it('should not show display alias when displayText equals originalName', () => {
      // Already set up with same names in beforeEach
      const aliasElement =
        fixture.nativeElement.querySelector('.display-alias');
      expect(aliasElement).toBeNull();
    });

    it('should show loading spinner when loading preview', () => {
      component.isLoadingPreview.set(true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector(
        '.tooltip-preview.loading mat-spinner'
      );
      expect(spinner).toBeTruthy();

      const loadingText = fixture.nativeElement.querySelector(
        '.tooltip-preview.loading'
      );
      expect(loadingText?.textContent).toContain('Loading preview...');
    });
  });

  describe('element type icons', () => {
    const testCases = [
      { type: ElementType.Item, icon: 'description' },
      { type: ElementType.Worldbuilding, icon: 'category' },
      { type: ElementType.Folder, icon: 'folder' },
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
      { type: ElementType.Worldbuilding, label: 'Worldbuilding' },
      { type: ElementType.Folder, label: 'Folder' },
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

    it('should clamp x position to minimum padding when too far left', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: -100, y: 200 }, // Negative x to test left boundary
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      const position = component.tooltipPosition();
      // Position should be clamped to padding (12px)
      expect(position.x).toBeGreaterThanOrEqual(0);
    });

    it('should clamp y position to minimum padding when too far up', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: -100 }, // Negative y to test top boundary
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      const position = component.tooltipPosition();
      // Position should be clamped to padding (12px)
      expect(position.y).toBeGreaterThanOrEqual(0);
    });

    it('should clamp x position when too far right', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: window.innerWidth + 100, y: 200 }, // Beyond right edge
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      const position = component.tooltipPosition();
      // Position should be clamped within viewport
      expect(position.x).toBeLessThanOrEqual(window.innerWidth);
    });

    it('should clamp y position when too far down', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: window.innerHeight + 100 }, // Beyond bottom edge
      };

      component.tooltipData = tooltipData;
      fixture.detectChanges();

      const position = component.tooltipPosition();
      // Position should be clamped within viewport
      expect(position.y).toBeLessThanOrEqual(window.innerHeight);
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

    it('should display path when previewContent has path', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      component.previewContent.set({
        path: 'Act 1 / Chapter 1',
        excerpt: undefined,
        wordCount: undefined,
      });
      fixture.detectChanges();

      const pathElement =
        fixture.debugElement.nativeElement.querySelector('.preview-path');
      expect(pathElement).toBeTruthy();
      expect(pathElement.textContent).toContain('Act 1 / Chapter 1');
    });

    it('should display excerpt when previewContent has excerpt', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      component.previewContent.set({
        path: undefined,
        excerpt: 'This is a preview of the content...',
        wordCount: undefined,
      });
      fixture.detectChanges();

      const excerptElement =
        fixture.debugElement.nativeElement.querySelector('.preview-excerpt');
      expect(excerptElement).toBeTruthy();
      expect(excerptElement.textContent).toContain(
        'This is a preview of the content...'
      );
    });

    it('should display word count when previewContent has wordCount', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      component.previewContent.set({
        path: undefined,
        excerpt: undefined,
        wordCount: 1500,
      });
      fixture.detectChanges();

      const metaElement =
        fixture.debugElement.nativeElement.querySelector('.preview-meta');
      expect(metaElement).toBeTruthy();
      expect(metaElement.textContent).toContain('1500 words');
    });

    it('should display all preview content fields', () => {
      const tooltipData: ElementRefTooltipData = {
        elementId: 'test-id',
        elementType: ElementType.Item,
        displayText: 'Test',
        originalName: 'Test',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      component.previewContent.set({
        path: 'Act 1 / Chapter 1',
        excerpt: 'Opening scene...',
        wordCount: 2500,
      });
      fixture.detectChanges();

      const pathElement =
        fixture.debugElement.nativeElement.querySelector('.preview-path');
      const excerptElement =
        fixture.debugElement.nativeElement.querySelector('.preview-excerpt');
      const metaElement =
        fixture.debugElement.nativeElement.querySelector('.preview-meta');

      expect(pathElement).toBeTruthy();
      expect(excerptElement).toBeTruthy();
      expect(metaElement).toBeTruthy();
    });
  });

  describe('worldbuilding element description', () => {
    it('should load description for worldbuilding elements', async () => {
      // Setup worldbuilding element
      const characterElement: Element = {
        id: 'character-1',
        name: 'Test Character',
        type: ElementType.Worldbuilding,
        schemaId: 'character-v1',
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      };

      // Update mocks
      const projectStateService = TestBed.inject(ProjectStateService);
      const worldbuildingService = TestBed.inject(WorldbuildingService);

      (projectStateService.elements as any).set([characterElement]);
      (projectStateService.project as any).set({
        username: 'testuser',
        slug: 'test-project',
      });
      vi.mocked(worldbuildingService.getIdentityData).mockResolvedValue({
        description: 'A brave warrior from the north.',
      });

      const tooltipData: ElementRefTooltipData = {
        elementId: 'character-1',
        elementType: ElementType.Worldbuilding,
        displayText: 'Test Character',
        originalName: 'Test Character',
        position: { x: 100, y: 200 },
      };

      component.tooltipData = tooltipData;
      await fixture.whenStable();
      fixture.detectChanges();

      expect(worldbuildingService.getIdentityData).toHaveBeenCalledWith(
        'character-1',
        'testuser',
        'test-project'
      );
      expect(component.previewContent()?.excerpt).toBe(
        'A brave warrior from the north.'
      );
    });
  });
});
