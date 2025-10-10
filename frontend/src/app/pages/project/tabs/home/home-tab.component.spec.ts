import { CommonModule } from '@angular/common';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ProjectAPIService } from '@inkweld/api/project-api.service';
import { ProjectDto, ProjectElementDto } from '@inkweld/index';

import { DialogGatewayService } from '../../../../services/dialog-gateway.service';
import { ProjectService } from '../../../../services/project.service';
import { ProjectImportExportService } from '../../../../services/project-import-export.service';
import { ProjectStateService } from '../../../../services/project-state.service';
import { RecentFilesService } from '../../../../services/recent-files.service';
import { HomeTabComponent } from './home-tab.component';
describe('HomeTabComponent', () => {
  let component: HomeTabComponent;
  let fixture: ComponentFixture<HomeTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let projectService: Partial<ProjectService>;
  let projectApiService: Partial<ProjectAPIService>;
  let recentFilesService: Partial<RecentFilesService>;
  let importExportService: Partial<ProjectImportExportService>;
  let dialogGateway: Partial<DialogGatewayService>;
  let snackBar: Partial<MatSnackBar>;

  const mockProject = {
    id: '1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: 'Test project description',
  } as ProjectDto;

  const mockRecentFiles = [
    {
      id: 'doc1',
      name: 'Recent Document 1',
      type: 'ITEM',
    },
    {
      id: 'doc2',
      name: 'Recent Document 2',
      type: 'IMAGE',
    },
  ];

  // Mock URL.createObjectURL which isn't available in Jest environment
  beforeAll(() => {
    // Only mock if not already defined
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = jest.fn().mockReturnValue('mock-blob-url');
    }
  });

  const setupMockServices = () => {
    // Initialize signals for ProjectStateService
    const projectSignal = signal(mockProject);
    const elementsSignal = signal<ProjectElementDto[]>([]);

    // Mock services
    projectStateService = {
      project: projectSignal,
      elements: elementsSignal,
      openDocument: jest.fn(),
      publishProject: jest.fn().mockResolvedValue(undefined),
      showEditProjectDialog: jest.fn(),
    };

    recentFilesService = {
      getRecentFilesForProject: jest.fn().mockReturnValue(mockRecentFiles),
    };

    importExportService = {
      exportProjectZip: jest.fn().mockResolvedValue(undefined),
      importProjectZip: jest.fn().mockResolvedValue(undefined),
    };

    projectService = {
      getProjectCover: jest
        .fn()
        .mockRejectedValue(new Error('Cover image not found')),
    };

    projectApiService = {
      coverControllerUploadCover: jest.fn(),
    } as any;

    dialogGateway = {
      openGenerateCoverDialog: jest.fn(),
      openNewElementDialog: jest.fn(),
    };

    snackBar = {
      open: jest.fn(),
    } as any;
  };

  beforeEach(async () => {
    setupMockServices();

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        RouterModule,
        RouterTestingModule,
        HomeTabComponent,
      ],
      providers: [
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: ProjectService, useValue: projectService },
        { provide: ProjectAPIService, useValue: projectApiService },
        { provide: RecentFilesService, useValue: recentFilesService },
        { provide: ProjectImportExportService, useValue: importExportService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeTabComponent);
    component = fixture.componentInstance;

    // Wait for the effect to settle before detecting changes
    await Promise.resolve();

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display project title and description', () => {
    const titleElement = fixture.nativeElement.querySelector('h2');
    const descriptionElement = fixture.nativeElement.querySelector('p');

    expect(titleElement.textContent).toBe(mockProject.title);
    expect(descriptionElement.textContent).toBe(mockProject.description);
  });

  it('should handle recent document click', () => {
    const document = mockRecentFiles[0];
    const mockElement = {
      id: 'doc1',
      name: 'Recent Document 1',
      type: 'ITEM',
      level: 0,
      position: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as ProjectElementDto;

    // Setup elements to include the document for lookup
    (projectStateService.elements as any).set([mockElement]);

    component.onRecentDocumentClick(document.id);

    expect(projectStateService.openDocument).toHaveBeenCalledWith(mockElement);
  });

  it('should handle recent document keydown event (Enter key)', () => {
    const document = mockRecentFiles[0];
    const mockKeyboardEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    const mockElement = {
      id: 'doc1',
      name: 'Recent Document 1',
      type: 'ITEM',
      level: 0,
      position: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as ProjectElementDto;

    jest.spyOn(component, 'onRecentDocumentClick');
    (projectStateService.elements as any).set([mockElement]);

    component.onRecentDocumentKeydown(mockKeyboardEvent, document.id);

    expect(component.onRecentDocumentClick).toHaveBeenCalledWith(document.id);
  });

  it('should handle recent document keydown event (Space key)', () => {
    const document = mockRecentFiles[0];
    const mockKeyboardEvent = new KeyboardEvent('keydown', { key: ' ' });
    const mockElement = {
      id: 'doc1',
      name: 'Recent Document 1',
      type: 'ITEM',
      level: 0,
      position: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as ProjectElementDto;

    jest.spyOn(component, 'onRecentDocumentClick');
    (projectStateService.elements as any).set([mockElement]);

    component.onRecentDocumentKeydown(mockKeyboardEvent, document.id);

    expect(component.onRecentDocumentClick).toHaveBeenCalledWith(document.id);
  });

  it('should not react to other keys in document keydown event', () => {
    const document = mockRecentFiles[0];
    const mockKeyboardEvent = new KeyboardEvent('keydown', { key: 'A' });

    jest.spyOn(component, 'onRecentDocumentClick');

    component.onRecentDocumentKeydown(mockKeyboardEvent, document.id);

    expect(component.onRecentDocumentClick).not.toHaveBeenCalled();
  });

  it('should export project when export button is clicked', () => {
    component.onExportClick();
    expect(importExportService.exportProjectZip).toHaveBeenCalled();
  });

  it('should emit import event when import button is clicked', () => {
    jest.spyOn(component.importRequested, 'emit');
    component.onImportClick();
    expect(component.importRequested.emit).toHaveBeenCalled();
  });

  it('should publish project when publish button is clicked', () => {
    component.onPublishClick();
    expect(projectStateService.publishProject).toHaveBeenCalledWith(
      mockProject
    );
  });

  it('should display recent files when available', () => {
    const recentFilesList =
      fixture.nativeElement.querySelector('.recent-files-list');
    const recentFileItems =
      fixture.nativeElement.querySelectorAll('.recent-file-item');

    expect(recentFilesList).toBeTruthy();
    expect(recentFileItems.length).toBe(2);
  });

  it('should display different icons based on document type', () => {
    const recentFileItems = fixture.nativeElement.querySelectorAll(
      '.recent-file-item mat-icon'
    );

    // First item is a document (ITEM)
    expect(recentFileItems[0].textContent.trim()).toBe('description');

    // Second item is an image
    expect(recentFileItems[1].textContent.trim()).toBe('image');
  });
});
