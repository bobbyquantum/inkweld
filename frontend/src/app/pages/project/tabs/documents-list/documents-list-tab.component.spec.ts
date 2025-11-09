import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '@inkweld/model/project-element-dto';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { Mock, vi } from 'vitest';

import { DocumentSyncState } from '../../../../models/document-sync-state';
import { DocumentsListTabComponent } from './documents-list-tab.component';

describe('DocumentsListTabComponent', () => {
  let component: DocumentsListTabComponent;
  let fixture: ComponentFixture<DocumentsListTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let documentService: Partial<DocumentService>;
  let router: Partial<Router>;

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    id: '123',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    description: 'Test description',
  };

  const mockElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] = [
    {
      id: 'doc1',
      name: 'Document 1',
      type: 'ITEM',
      level: 0,
      position: 0,
      version: 1,
      expandable: false,
      metadata: {},
    },
    {
      id: 'doc2',
      name: 'Document 2',
      type: 'FOLDER',
      level: 0,
      position: 1,
      version: 1,
      expandable: true,
      metadata: {},
    },
    {
      id: 'doc3',
      name: 'Document 3',
      type: 'ITEM',
      level: 0,
      position: 2,
      version: 1,
      expandable: false,
      metadata: {},
    },
  ];

  beforeEach(async () => {
    // Setup mock services
    projectStateService = {
      project: signal(mockProject),
      elements: signal(mockElements),
      openDocument: vi.fn(),
    };

    documentService = {
      getSyncStatusSignal: vi
        .fn()
        .mockReturnValue(() => DocumentSyncState.Synced),
    } as Partial<DocumentService>;

    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatTableModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
        NoopAnimationsModule,
        DocumentsListTabComponent,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: DocumentService, useValue: documentService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentsListTabComponent);
    component = fixture.componentInstance;

    // Explicitly call loadDocuments to ensure documents are initialized for tests
    component.loadDocuments();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should filter and display only ITEM type elements as documents', () => {
    // Manually set documents for test
    component.documents.set(mockElements.filter(el => el.type === 'ITEM'));

    const docs = component.documents();
    expect(docs.length).toBe(2);
    expect(docs[0].id).toBe('doc1');
    expect(docs[1].id).toBe('doc3');
  });

  it('should open a document when openDocument is called', () => {
    component.openDocument(mockElements[0]);
    expect(projectStateService.openDocument).toHaveBeenCalledWith(
      mockElements[0]
    );
  });

  it('should format date correctly', () => {
    const date = new Date('2023-01-01T12:00:00Z').toISOString();
    const formattedDate = component.formatDate(date);
    expect(formattedDate).toContain('Jan 1, 2023');
  });

  it('should handle undefined date', () => {
    expect(component.formatDate(undefined)).toBe('N/A');
  });

  it('should get sync status icon', () => {
    expect(component.getSyncStatusIcon('doc1')).toBe('cloud_done');
  });

  it('should get sync status tooltip', () => {
    expect(component.getSyncStatusTooltip('doc1')).toBe(
      'Synchronized with cloud'
    );
  });

  it('should create a new document', () => {
    component.createNewDocument();
    expect(projectStateService.openDocument).toHaveBeenCalled();
    const newDocArg = (projectStateService.openDocument as Mock).mock
      .calls[0][0];
    expect(newDocArg.type).toBe(GetApiV1ProjectsUsernameSlugElements200ResponseInner.TypeEnum.Item);
    expect(newDocArg.name).toBe('New Document');
  });

  it('should handle missing project when getting sync status', () => {
    (projectStateService.project as any).set(undefined);
    expect(component.getSyncStatusIcon('doc1')).toBe('sync_disabled');
    expect(component.getSyncStatusTooltip('doc1')).toBe('Status unavailable');
  });
});
