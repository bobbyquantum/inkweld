import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NgxEditorModule } from 'ngx-editor';

import { ElementEditorComponent } from './element-editor.component';

describe('ElementEditorComponent', () => {
  let component: ElementEditorComponent;
  let fixture: ComponentFixture<ElementEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElementEditorComponent, NgxEditorModule],
      providers: [provideHttpClient(), provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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
    });

    it('should switch back to page mode', () => {
      component.setViewMode('fitWidth');
      component.setViewMode('page');
      expect(component.viewMode).toBe('page');
    });

    it('should hide margin guides in fit width mode', () => {
      const fixture = TestBed.createComponent(ElementEditorComponent);
      const compiled = fixture.nativeElement as HTMLElement;

      fixture.detectChanges();
      expect(compiled.querySelector('.margin-guide')).toBeTruthy();

      component.setViewMode('fitWidth');
      fixture.detectChanges();
      expect(compiled.querySelector('.margin-guide')).toBeFalsy();
    });
  });
});
