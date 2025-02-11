import { provideHttpClient } from '@angular/common/http';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NgxEditorModule } from 'ngx-editor';

import { DocumentService } from '../../services/document.service';
import { ElementEditorComponent } from './element-editor.component';

class MockDocumentService {
  setupCollaboration = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
}

describe('ElementEditorComponent', () => {
  let component: ElementEditorComponent;
  let fixture: ComponentFixture<ElementEditorComponent>;
  let documentService: jest.Mocked<DocumentService>;
  let documentElement: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElementEditorComponent, NgxEditorModule],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        { provide: DocumentService, useClass: MockDocumentService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementEditorComponent);
    component = fixture.componentInstance;
    documentService = TestBed.inject(
      DocumentService
    ) as jest.Mocked<DocumentService>;
    documentElement = document.documentElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize editor and dimensions', () => {
      expect(component.editor).toBeDefined();
      expect(documentElement.style.getPropertyValue('--page-width')).toBe(
        '21cm'
      );
      expect(documentElement.style.getPropertyValue('--margin-left')).toBe(
        '2cm'
      );
      expect(documentElement.style.getPropertyValue('--margin-right')).toBe(
        '2cm'
      );
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
      expect(documentElement.style.getPropertyValue('--editor-max-width')).toBe(
        '100%'
      );
      expect(documentElement.style.getPropertyValue('--page-width')).toBe('');
      expect(documentElement.style.getPropertyValue('--margin-left')).toBe('');
      expect(documentElement.style.getPropertyValue('--margin-right')).toBe('');

      // Verify ruler is hidden in fit width mode
      const ruler = fixture.nativeElement.querySelector(
        '.ruler'
      ) as HTMLElement;
      expect(getComputedStyle(ruler).display).toBe('none');
    });

    it('should switch back to page mode', () => {
      component.setViewMode('fitWidth');
      component.setViewMode('page');
      expect(component.viewMode).toBe('page');
      expect(documentElement.style.getPropertyValue('--page-width')).toBe(
        '21cm'
      );
      expect(documentElement.style.getPropertyValue('--margin-left')).toBe(
        '2cm'
      );
      expect(documentElement.style.getPropertyValue('--margin-right')).toBe(
        '2cm'
      );
      expect(documentElement.style.getPropertyValue('--editor-max-width')).toBe(
        ''
      );
    });
  });

  describe('Zoom Functionality', () => {
    it('should increase zoom level', () => {
      component.increaseZoom();
      expect(component.zoomLevel).toBe(110);
      expect(documentElement.style.getPropertyValue('--editor-zoom')).toBe(
        '1.1'
      );
    });

    it('should decrease zoom level', () => {
      component.decreaseZoom();
      expect(component.zoomLevel).toBe(90);
      expect(documentElement.style.getPropertyValue('--editor-zoom')).toBe(
        '0.9'
      );
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
    let mousemoveEvent: MouseEvent;
    let mouseupEvent: MouseEvent;

    beforeEach(() => {
      mousemoveEvent = new MouseEvent('mousemove', {
        clientX: 150, // 50px to the right of start
        clientY: 100,
      });
      mouseupEvent = new MouseEvent('mouseup', {
        clientX: 150,
        clientY: 100,
      });
    });

    it('should handle page width drag', () => {
      const startEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 100,
      });

      component.startDragging(startEvent, 'pageRight');
      document.dispatchEvent(mousemoveEvent);
      document.dispatchEvent(mouseupEvent);

      // 50px movement at 100% zoom is about 1.32cm (50/37.795275591)
      expect(component.dimensions.pageWidth).toBeCloseTo(22.5, 1);
    });

    it('should handle margin drag', () => {
      const startEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 100,
      });

      component.startDragging(startEvent, 'marginRight');
      document.dispatchEvent(mousemoveEvent);
      document.dispatchEvent(mouseupEvent);

      // Moving right margin to the left (negative delta)
      expect(component.dimensions.rightMargin).toBeCloseTo(0.5, 1);
    });

    it('should cleanup subscriptions on window blur', () => {
      const startEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 100,
      });

      component.startDragging(startEvent, 'pageRight');
      window.dispatchEvent(new Event('blur'));

      // Verify dimensions haven't changed after blur
      expect(component.dimensions.pageWidth).toBe(21);
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
