import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { createComponentFactory, Spectator } from '@ngneat/spectator/vitest';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { NgxEditorModule } from 'ngx-editor';
import { of } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DocumentElementEditorComponent } from './document-element-editor.component';

class MockDocumentService {
  setupCollaboration = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn();
  initializeSyncStatus = vi.fn();
  getSyncStatus = vi.fn().mockReturnValue(of(DocumentSyncState.Offline));
  getSyncStatusSignal = vi
    .fn()
    .mockReturnValue(() => DocumentSyncState.Offline);
  getWordCountSignal = vi.fn().mockReturnValue(() => 0);
}

class MockProjectStateService {
  isLoading = vi.fn().mockReturnValue(false);
  project = vi
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

    vi
      .spyOn(document.documentElement.style, 'setProperty')
      .mockImplementation((prop, value) => {
        mockStyle[prop] = value!;
      });

    vi
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
    vi.useFakeTimers();
    component.documentId = 'test:test:abc123';
    vi.runAllTimers();
    expect(documentService.setupCollaboration).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
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
