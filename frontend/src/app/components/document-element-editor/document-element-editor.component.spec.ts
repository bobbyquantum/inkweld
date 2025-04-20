import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { NgxEditorModule } from 'ngx-editor';
import { of } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DocumentElementEditorComponent } from './document-element-editor.component';

class MockDocumentService {
  setupCollaboration = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
  initializeSyncStatus = jest.fn();
  getSyncStatus = jest.fn().mockReturnValue(of(DocumentSyncState.Offline));
  getSyncStatusSignal = jest
    .fn()
    .mockReturnValue(() => DocumentSyncState.Offline);
  getWordCountSignal = jest.fn().mockReturnValue(() => 0);
}

class MockProjectStateService {
  isLoading = jest.fn().mockReturnValue(false);
  project = jest
    .fn()
    .mockReturnValue({ username: 'test', slug: 'test', title: 'Test' });
}

describe('DocumentElementEditorComponent', () => {
  let component: DocumentElementEditorComponent;
  let fixture: ComponentFixture<DocumentElementEditorComponent>;
  let documentService: MockDocumentService;
  let projectStateService: MockProjectStateService;
  let mockStyle: { [key: string]: string };

  beforeEach(async () => {
    documentService = new MockDocumentService();
    projectStateService = new MockProjectStateService();
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
        { provide: ProjectStateService, useValue: projectStateService },
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

  it('should render sync status in template', () => {
    fixture.detectChanges();
    const spans = fixture.nativeElement.querySelectorAll(
      '.editor-status-bar > span'
    );
    expect(spans.length).toBe(2);
    expect(spans[1].textContent.trim()).toBe(component.syncState());
  });
});
