import { provideHttpClient } from '@angular/common/http';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NgxEditorModule } from 'ngx-editor';
import { of } from 'rxjs';

import { CssVariableService } from '../../services/css-variable.service';
import { DocumentService } from '../../services/document.service';
import { MouseDragService } from '../../services/mouse-drag.service';
import { ElementEditorComponent } from './element-editor.component';

class MockDocumentService {
  setupCollaboration = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
}

describe('ElementEditorComponent', () => {
  let component: ElementEditorComponent;
  let fixture: ComponentFixture<ElementEditorComponent>;
  let cssVariableService: jest.Mocked<CssVariableService>;
  let mouseDragService: jest.Mocked<MouseDragService>;
  let documentService: jest.Mocked<DocumentService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElementEditorComponent, NgxEditorModule],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        {
          provide: CssVariableService,
          useValue: {
            setPageDimensions: jest.fn(),
            setFitWidthMode: jest.fn(),
            setZoomLevel: jest.fn(),
          },
        },
        {
          provide: MouseDragService,
          useValue: {
            startDrag: jest.fn(),
            dragMoveEvents$: of({
              type: 'move',
              clientX: 0,
              clientY: 0,
              deltaX: 0,
              deltaY: 0,
            }),
            dragEndEvents$: of({
              type: 'end',
              clientX: 0,
              clientY: 0,
              deltaX: 0,
              deltaY: 0,
            }),
            dragEvents$: of({
              type: 'start',
              clientX: 0,
              clientY: 0,
              deltaX: 0,
              deltaY: 0,
            }),
          },
        },
        { provide: DocumentService, useClass: MockDocumentService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementEditorComponent);
    component = fixture.componentInstance;
    cssVariableService = TestBed.inject(
      CssVariableService
    ) as jest.Mocked<CssVariableService>;
    mouseDragService = TestBed.inject(
      MouseDragService
    ) as jest.Mocked<MouseDragService>;
    documentService = TestBed.inject(
      DocumentService
    ) as jest.Mocked<DocumentService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize editor and dimensions', () => {
      expect(component.editor).toBeDefined();
      expect(cssVariableService.setPageDimensions).toHaveBeenCalledWith({
        pageWidth: '21cm',
        leftMargin: '2cm',
        rightMargin: '2cm',
      });
    });

    it('should setup collaboration after view init', fakeAsync(() => {
      component.ngAfterViewInit();
      tick();
      expect(documentService.setupCollaboration).toHaveBeenCalledWith(
        component.editor,
        'default'
      );
    }));
  });

  describe('View Mode Functionality', () => {
    it('should initialize with page view mode', () => {
      expect(component.viewMode).toBe('page');
    });

    it('should toggle view mode dropdown visibility', () => {
      expect(component.showViewModeDropdown).toBe(false);
      component.toggleViewModeDropdown();
      expect(component.showViewModeDropdown).toBe(true);
      component.toggleViewModeDropdown();
      expect(component.showViewModeDropdown).toBe(false);
    });

    it('should switch to fit width mode', () => {
      component.setViewMode('fitWidth');
      expect(component.viewMode).toBe('fitWidth');
      expect(component.zoomLevel).toBe(100);
      expect(cssVariableService.setFitWidthMode).toHaveBeenCalled();
    });

    it('should switch back to page mode', () => {
      component.setViewMode('fitWidth');
      component.setViewMode('page');
      expect(component.viewMode).toBe('page');
      expect(cssVariableService.setPageDimensions).toHaveBeenCalled();
    });
  });

  describe('Zoom Functionality', () => {
    it('should increase zoom level', () => {
      component.increaseZoom();
      expect(component.zoomLevel).toBe(110);
      expect(cssVariableService.setZoomLevel).toHaveBeenCalledWith(110);
    });

    it('should decrease zoom level', () => {
      component.decreaseZoom();
      expect(component.zoomLevel).toBe(90);
      expect(cssVariableService.setZoomLevel).toHaveBeenCalledWith(90);
    });

    it('should not increase zoom beyond 200%', () => {
      component.zoomLevel = 200;
      component.increaseZoom();
      expect(component.zoomLevel).toBe(200);
    });

    it('should not decrease zoom below 50%', () => {
      component.zoomLevel = 50;
      component.decreaseZoom();
      expect(component.zoomLevel).toBe(50);
    });
  });

  describe('Drag Functionality', () => {
    it('should handle page left drag', () => {
      const mockEvent = { clientX: 100 } as MouseEvent;
      component.startDragging(mockEvent, 'pageLeft');
      expect(mouseDragService.startDrag).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle page right drag', () => {
      const mockEvent = { clientX: 100 } as MouseEvent;
      component.startDragging(mockEvent, 'pageRight');
      expect(mouseDragService.startDrag).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle margin left drag', () => {
      const mockEvent = { clientX: 100 } as MouseEvent;
      component.startDragging(mockEvent, 'marginLeft');
      expect(mouseDragService.startDrag).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle margin right drag', () => {
      const mockEvent = { clientX: 100 } as MouseEvent;
      component.startDragging(mockEvent, 'marginRight');
      expect(mouseDragService.startDrag).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('Destruction', () => {
    it('should destroy editor and disconnect document service', () => {
      jest.spyOn(component.editor, 'destroy');
      component.ngOnDestroy();
      expect(component.editor.destroy).toHaveBeenCalled();
      expect(documentService.disconnect).toHaveBeenCalledWith('default');
    });
  });
});
