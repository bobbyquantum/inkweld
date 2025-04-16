import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ProjectAPIService } from '@inkweld/index';
import { DocumentService } from '@services/document.service';
import { NgxEditorModule } from 'ngx-editor';
import { of } from 'rxjs';

import { DocumentElementEditorComponent } from './document-element-editor.component';

class MockDocumentService {
  setupCollaboration = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
}

class MockProjectAPIService {
  projectControllerGetProjectByUsernameAndSlug = jest
    .fn()
    .mockReturnValue(
      of({ name: 'Test Project', description: 'Test description' })
    );
  projectElementControllerGetProjectElements = jest
    .fn()
    .mockReturnValue(of([]));
}

describe('DocumentElementEditorComponent', () => {
  let component: DocumentElementEditorComponent;
  let fixture: ComponentFixture<DocumentElementEditorComponent>;
  let documentService: MockDocumentService;
  let projectApiService: MockProjectAPIService;
  let mockStyle: { [key: string]: string };

  beforeEach(async () => {
    documentService = new MockDocumentService();
    projectApiService = new MockProjectAPIService();
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
      ],
      providers: [
        { provide: DocumentService, useValue: documentService },
        { provide: ProjectAPIService, useValue: projectApiService },
      ],
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
    component.documentId = 'test:test:abc123';
    component.ngAfterViewInit();
    jest.runAllTimers();
    expect(documentService.setupCollaboration).toHaveBeenCalled();
    jest.useRealTimers();
    expect(documentService.setupCollaboration).toHaveBeenCalledTimes(1);
  });

  it('should disconnect on destroy', () => {
    component.documentId = 'test:test:abc123';
    component.zenMode = false;
    component.ngOnDestroy();
    expect(documentService.disconnect).toHaveBeenCalledWith('test:test:abc123');
  });

  it('should have color presets', () => {
    expect(component.colorPresets.length).toBeGreaterThan(0);
    expect(component.colorPresets).toContain('#000000');
    expect(component.colorPresets).toContain('#ffffff');
  });
});
