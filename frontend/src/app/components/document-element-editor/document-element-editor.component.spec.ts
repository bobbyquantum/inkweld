import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { createComponentFactory, Spectator } from '@ngneat/spectator/jest';
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
  let spectator: Spectator<DocumentElementEditorComponent>;
  let component: DocumentElementEditorComponent;
  let documentService: MockDocumentService;
  let mockStyle: { [key: string]: string };

  const createComponent = createComponentFactory({
    component: DocumentElementEditorComponent,
    imports: [
      MatButtonModule,
      MatIconModule,
      NgxEditorModule,
      MatSelectModule,
      MatOptionModule,
    ],
    providers: [
      { provide: DocumentService, useValue: new MockDocumentService() },
      { provide: ProjectStateService, useValue: new MockProjectStateService() },
    ],
  });

  beforeEach(() => {
    mockStyle = {};

    jest
      .spyOn(document.documentElement.style, 'setProperty')
      .mockImplementation((prop, value) => {
        mockStyle[prop] = value!;
      });

    jest
      .spyOn(document.documentElement.style, 'removeProperty')
      .mockImplementation(prop => {
        delete mockStyle[prop];
        return '';
      });

    spectator = createComponent();
    component = spectator.component;
    documentService = spectator.inject(DocumentService) as MockDocumentService;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should setup collaboration after view init', () => {
    jest.useFakeTimers();
    component.documentId = 'test:test:abc123';
    component.ngAfterViewInit();
    jest.runAllTimers();
    expect(documentService.setupCollaboration).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
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
    spectator.detectChanges();
    const spans = spectator.queryAll('.editor-status-bar > span');
    expect(spans.length).toBe(2);
    expect(spans[1].textContent?.trim()).toBe(component.syncState());
  });
});
