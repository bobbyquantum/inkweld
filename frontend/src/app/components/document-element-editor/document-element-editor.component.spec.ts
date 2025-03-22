import { CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DocumentService } from '@services/document.service';
import { NgxEditorModule } from 'ngx-editor';

import { DocumentElementEditorComponent } from './document-element-editor.component';
import { EditorControlsMenuComponent } from './editor-controls-menu.component';

class MockDocumentService {
  setupCollaboration = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
}

describe('DocumentElementEditorComponent', () => {
  let component: DocumentElementEditorComponent;
  let fixture: ComponentFixture<DocumentElementEditorComponent>;
  let documentService: MockDocumentService;
  let mockStyle: { [key: string]: string };

  beforeEach(async () => {
    documentService = new MockDocumentService();
    mockStyle = {};

    // Mock document.documentElement
    Object.defineProperty(document, 'documentElement', {
      value: {
        style: {
          setProperty: (prop: string, value: string) => {
            mockStyle[prop] = value;
          },
          removeProperty: (prop: string) => {
            delete mockStyle[prop];
          },
        },
      },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        NgxEditorModule,
        MatSelectModule,
        MatOptionModule,
        EditorControlsMenuComponent,
        DragDropModule,
      ],
      providers: [{ provide: DocumentService, useValue: documentService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentElementEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should setup collaboration after view init', () => {
    jest.useFakeTimers();
    component.ngAfterViewInit();
    jest.runAllTimers();
    expect(documentService.setupCollaboration).toHaveBeenCalled();
    jest.useRealTimers();
    expect(documentService.setupCollaboration).toHaveBeenCalledTimes(1);
  });

  it('should disconnect on destroy', () => {
    component.ngOnDestroy();
    expect(documentService.disconnect).toHaveBeenCalledWith('invalid');
  });

  it('should update zoom level', () => {
    component.onZoomLevelChange(150);
    expect(component.zoomLevel).toBe(150);
    expect(mockStyle['--editor-zoom']).toBe('1.5');
  });

  it('should increase zoom level', () => {
    component.zoomLevel = 100;
    component.increaseZoom();
    expect(component.zoomLevel).toBe(110);
    expect(mockStyle['--editor-zoom']).toBe('1.1');
  });

  it('should not increase zoom beyond 200', () => {
    component.zoomLevel = 200;
    component.increaseZoom();
    expect(component.zoomLevel).toBe(200);
  });

  it('should decrease zoom level', () => {
    component.zoomLevel = 100;
    component.decreaseZoom();
    expect(component.zoomLevel).toBe(90);
    expect(mockStyle['--editor-zoom']).toBe('0.9');
  });

  it('should not decrease zoom below 50', () => {
    component.zoomLevel = 50;
    component.decreaseZoom();
    expect(component.zoomLevel).toBe(50);
  });

  it('should set view mode', () => {
    component.setViewMode('page');
    expect(component.viewMode).toBe('page');
    expect(mockStyle['--page-width']).toBe('21cm');
    expect(mockStyle['--margin-left']).toBe('2cm');
    expect(mockStyle['--margin-right']).toBe('2cm');

    component.setViewMode('fitWidth');
    expect(component.viewMode).toBe('fitWidth');
    expect(component.zoomLevel).toBe(100);
    expect(mockStyle['--editor-max-width']).toBe('100%');
    expect(mockStyle['--page-width']).toBeUndefined();
  });

  it('should update tooltips', () => {
    component.dimensions = {
      pageWidth: 21,
      leftMargin: 2,
      rightMargin: 2,
    };
    component.updateTooltips();
    expect(component.tooltips.pageWidth).toBe('Page width: 21.0cm');
    expect(component.tooltips.leftMargin).toBe('Left margin: 2.0cm');
    expect(component.tooltips.rightMargin).toBe('Right margin: 2.0cm');
    expect(component.tooltips.contentWidth).toBe('Content width: 17.0cm');
  });

  it('should handle drag end for page width increase', () => {
    const mockEvent: CdkDragEnd = {
      source: {
        getFreeDragPosition: () => ({ x: 37.795275591, y: 0 }),
        reset: jest.fn(),
      } as any,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    };

    component.onDragEnd(mockEvent, 'pageRight');
    expect(component.dimensions.pageWidth).toBe(22);
    expect(mockEvent.source.reset).toHaveBeenCalled();
  });

  it('should handle drag end for page width decrease', () => {
    const mockEvent: CdkDragEnd = {
      source: {
        getFreeDragPosition: () => ({ x: 37.795275591, y: 0 }),
        reset: jest.fn(),
      } as any,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    };

    // Set initial width to test decrease
    component.dimensions.pageWidth = 21;
    component.onDragEnd(mockEvent, 'pageLeft');
    // Decreasing means -delta, so 21 - 1 = 20
    expect(component.dimensions.pageWidth).toBe(20);
    expect(mockEvent.source.reset).toHaveBeenCalled();
  });

  it('should handle drag end for left margin', () => {
    const mockEvent: CdkDragEnd = {
      source: {
        getFreeDragPosition: () => ({ x: 37.795275591, y: 0 }),
        reset: jest.fn(),
      } as any,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    };

    component.onDragEnd(mockEvent, 'marginLeft');
    expect(component.dimensions.leftMargin).toBe(3);
    expect(mockEvent.source.reset).toHaveBeenCalled();
  });

  it('should handle drag end for right margin', () => {
    const mockEvent: CdkDragEnd = {
      source: {
        getFreeDragPosition: () => ({ x: 37.795275591, y: 0 }),
        reset: jest.fn(),
      } as any,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    };

    component.dimensions = {
      pageWidth: 21,
      leftMargin: 2,
      rightMargin: 2,
    };
    component.onDragEnd(mockEvent, 'marginRight');
    // For marginRight, we use -delta, so 2 - 1 = 1
    expect(component.dimensions.rightMargin).toBe(1);
    expect(mockEvent.source.reset).toHaveBeenCalled();
  });

  it('should adjust margins when page width is reduced too much', () => {
    // Set up a state where margins need adjustment
    component.dimensions = {
      pageWidth: 15, // Starting with 15cm
      leftMargin: 5, // 5cm left margin
      rightMargin: 6, // 6cm right margin
      // Total margins (11cm) exceed pageWidth - 5cm (10cm), so they should be adjusted
    };

    // Simulate reducing width to 12cm, which will trigger adjustMarginsForNewWidth
    const mockEvent: CdkDragEnd = {
      source: {
        getFreeDragPosition: () => ({ x: -113.3858, y: 0 }), // About -3cm
        reset: jest.fn(),
      } as any,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    };

    component.onDragEnd(mockEvent, 'pageRight');

    // Check that the width was reduced
    expect(component.dimensions.pageWidth).toBe(12);

    // Check that margins were adjusted to fit with at least 5cm for content
    expect(
      component.dimensions.leftMargin + component.dimensions.rightMargin
    ).toBeLessThanOrEqual(7); // 12cm - 5cm = 7cm max total margins

    // Verify that each margin is at least 0.5cm
    expect(component.dimensions.leftMargin).toBeGreaterThanOrEqual(0.5);
    expect(component.dimensions.rightMargin).toBeGreaterThanOrEqual(0.5);
  });

  it('should get tooltip text for different drag points', () => {
    component.tooltips = {
      pageWidth: 'Page: 21cm',
      contentWidth: 'Content: 17cm',
      leftMargin: 'Left: 2cm',
      rightMargin: 'Right: 2cm',
    };

    expect(component.getTooltipText('pageLeft')).toBe(
      'Page: 21cm\nContent: 17cm'
    );
    expect(component.getTooltipText('marginLeft')).toBe('Left: 2cm');
    expect(component.getTooltipText('marginRight')).toBe('Right: 2cm');
  });

  it('should toggle view mode dropdown', () => {
    expect(component.showViewModeDropdown).toBe(false);
    component.toggleViewModeDropdown();
    expect(component.showViewModeDropdown).toBe(true);
    component.toggleViewModeDropdown();
    expect(component.showViewModeDropdown).toBe(false);
  });

  it('should have default toolbar configuration', () => {
    expect(component.toolbar).toEqual([
      ['bold', 'italic'],
      ['underline', 'strike'],
      ['code', 'blockquote'],
      ['ordered_list', 'bullet_list'],
      [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
      ['link', 'image'],
      ['text_color', 'background_color'],
      ['align_left', 'align_center', 'align_right', 'align_justify'],
      ['horizontal_rule', 'format_clear'],
      ['superscript', 'subscript'],
      ['undo', 'redo'],
    ]);
  });

  it('should have color presets', () => {
    expect(component.colorPresets.length).toBeGreaterThan(0);
    expect(component.colorPresets).toContain('#000000'); // black
    expect(component.colorPresets).toContain('#ffffff'); // white
  });
});
