import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DocumentService } from '@services/document.service';
import { NgxEditorModule } from 'ngx-editor';

import { EditorControlsMenuComponent } from './editor-controls-menu.component';
import { ElementEditorComponent } from './element-editor.component';

class MockDocumentService {
  setupCollaboration = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
}

describe('ElementEditorComponent', () => {
  let component: ElementEditorComponent;
  let fixture: ComponentFixture<ElementEditorComponent>;
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

    fixture = TestBed.createComponent(ElementEditorComponent);
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
    expect(documentService.disconnect).toHaveBeenCalledWith('default');
  });

  it('should update zoom level', () => {
    component.onZoomLevelChange(150);
    expect(component.zoomLevel).toBe(150);
  });

  it('should set view mode', () => {
    component.setViewMode('page');
    expect(component.viewMode).toBe('page');

    component.setViewMode('fitWidth');
    expect(component.viewMode).toBe('fitWidth');
    expect(component.zoomLevel).toBe(100);
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
