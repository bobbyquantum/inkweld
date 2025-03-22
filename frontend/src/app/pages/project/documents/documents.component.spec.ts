import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { DocumentAPIService } from '../../../../api-client/api/document-api.service';
import { DocumentSyncState } from '../../../models/document-sync-state';
import { DocumentService } from '../../../services/document.service';
import { DocumentsComponent } from './documents.component';

describe('DocumentsComponent', () => {
  let component: DocumentsComponent;
  let fixture: ComponentFixture<DocumentsComponent>;

  // Sample test data
  const testDocuments = [
    {
      id: 'doc1',
      name: 'Test Document 1',
      ownerId: 'user1',
      username: 'testuser',
      projectSlug: 'test-project',
      lastModified: new Date().toISOString(),
    },
    {
      id: 'doc2',
      name: 'Test Document 2',
      ownerId: 'user1',
      username: 'testuser',
      projectSlug: 'test-project',
      lastModified: new Date().toISOString(),
    },
  ];

  // Mock services
  const activatedRouteMock = {
    params: of({ username: 'testuser', slug: 'test-project' }),
  };

  const documentAPIServiceMock = {
    documentControllerListDocuments: jest
      .fn()
      .mockReturnValue(of(testDocuments)),
  };

  const documentServiceMock = {
    getSyncStatus: jest.fn().mockReturnValue(of(DocumentSyncState.Synced)),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DocumentsComponent,
        NoopAnimationsModule,
        HttpClientTestingModule,
      ],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRouteMock },
        { provide: DocumentAPIService, useValue: documentAPIServiceMock },
        { provide: DocumentService, useValue: documentServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load documents on init', () => {
    expect(
      documentAPIServiceMock.documentControllerListDocuments
    ).toHaveBeenCalledWith('testuser', 'test-project');
    expect(component.documents.length).toBe(2);
  });

  it('should format date correctly', () => {
    const testDate = '2025-03-22T12:00:00Z';
    const formattedDate = component.formatDate(testDate);
    expect(formattedDate).toBeDefined();
  });

  it('should get sync status icon', () => {
    const icon = component.getSyncStatusIcon('doc1');
    expect(icon).toBe('cloud_done'); // For synced state
  });
});
