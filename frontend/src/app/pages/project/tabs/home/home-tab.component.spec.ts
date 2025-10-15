import { CommonModule } from '@angular/common';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ProjectAPIService } from '@inkweld/api/project-api.service';
import { ProjectDto, ProjectElementDto } from '@inkweld/index';
import { Mock, vi } from 'vitest';

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
    global.URL.createObjectURL = vi.fn().mockReturnValue('mock-blob-url');
  });

  let mockRouter: Partial<Router>;

  const setupMockServices = () => {
    // Initialize signals for ProjectStateService
    const projectSignal = signal(mockProject);
    const elementsSignal = signal<ProjectElementDto[]>([]);

    // Mock Router
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    // Mock services
    projectStateService = {
      project: projectSignal,
      elements: elementsSignal,
      openDocument: vi.fn(),
      publishProject: vi.fn().mockResolvedValue(undefined),
      showEditProjectDialog: vi.fn(),
      openSystemTab: vi.fn(),
    };

    recentFilesService = {
      getRecentFilesForProject: vi.fn().mockReturnValue(mockRecentFiles),
    };

    importExportService = {
      exportProjectZip: vi.fn().mockResolvedValue(undefined),
      importProjectZip: vi.fn().mockResolvedValue(undefined),
    };

    projectService = {
      getProjectCover: vi.fn().mockImplementation(() => {
        // Return a promise that never resolves by default
        // Tests will override this with specific behavior
        return new Promise(() => {});
      }),
    };

    const mockObservable = {
      pipe: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };

    projectApiService = {
      coverControllerUploadCover: vi.fn().mockReturnValue(mockObservable),
    } as any;

    dialogGateway = {
      openGenerateCoverDialog: vi
        .fn()
        .mockResolvedValue({ approved: false, imageData: null }),
      openNewElementDialog: vi.fn().mockResolvedValue(undefined),
    };

    snackBar = {
      open: vi.fn(),
    } as any;
  };

  beforeEach(async () => {
    setupMockServices();

    await TestBed.configureTestingModule({
      imports: [CommonModule, MatButtonModule, MatIconModule, HomeTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: mockRouter },
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

    vi.spyOn(component, 'onRecentDocumentClick');
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

    vi.spyOn(component, 'onRecentDocumentClick');
    (projectStateService.elements as any).set([mockElement]);

    component.onRecentDocumentKeydown(mockKeyboardEvent, document.id);

    expect(component.onRecentDocumentClick).toHaveBeenCalledWith(document.id);
  });

  it('should not react to other keys in document keydown event', () => {
    const document = mockRecentFiles[0];
    const mockKeyboardEvent = new KeyboardEvent('keydown', { key: 'A' });

    vi.spyOn(component, 'onRecentDocumentClick');

    component.onRecentDocumentKeydown(mockKeyboardEvent, document.id);

    expect(component.onRecentDocumentClick).not.toHaveBeenCalled();
  });

  it('should export project when export button is clicked', () => {
    component.onExportClick();
    expect(importExportService.exportProjectZip).toHaveBeenCalled();
  });

  it('should emit import event when import button is clicked', () => {
    vi.spyOn(component.importRequested, 'emit');
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

  it('should open new file dialog when new file button is clicked', () => {
    component.onNewFileClick();
    expect(dialogGateway.openNewElementDialog).toHaveBeenCalled();
  });

  it('should open generate cover dialog when generate cover button is clicked', async () => {
    const mockResult = {
      approved: true,
      imageData: 'data:image/png;base64,test123',
    };
    (dialogGateway.openGenerateCoverDialog as Mock).mockResolvedValue(
      mockResult
    );

    component.onGenerateCoverClick();
    await Promise.resolve();

    expect(dialogGateway.openGenerateCoverDialog).toHaveBeenCalledWith(
      mockProject
    );
  });

  it('should save cover image when dialog approves with image data', async () => {
    const mockResult = {
      approved: true,
      imageData: 'data:image/png;base64,test123',
    };
    (dialogGateway.openGenerateCoverDialog as Mock).mockResolvedValue(
      mockResult
    );
    const mockObservable = {
      pipe: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };
    (projectApiService.coverControllerUploadCover as Mock).mockReturnValue(
      mockObservable
    );

    component.onGenerateCoverClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(projectApiService.coverControllerUploadCover).toHaveBeenCalled();
  });

  it('should not save cover image when dialog is cancelled', async () => {
    const mockResult = { approved: false, imageData: null };
    (dialogGateway.openGenerateCoverDialog as Mock).mockResolvedValue(
      mockResult
    );

    component.onGenerateCoverClick();
    await Promise.resolve();

    expect(projectApiService.coverControllerUploadCover).not.toHaveBeenCalled();
  });

  it('should open project files tab', () => {
    component.openProjectFilesTab();
    expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
      'project-files'
    );
  });

  it('should open documents tab', () => {
    component.openDocumentsTab();
    expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
      'documents-list'
    );
  });

  describe('cover image', () => {
    it('should load cover image when project is set', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      (projectService.getProjectCover as Mock).mockResolvedValue(mockBlob);

      // Wait for initial effect to complete
      await fixture.whenStable();

      // Clear previous calls
      (projectService.getProjectCover as Mock).mockClear();

      // Trigger the effect by setting a new project
      (projectStateService.project as any).set({
        ...mockProject,
        username: 'newuser',
        slug: 'newproject',
      });

      // Wait for effect to run and async operations to complete
      fixture.detectChanges();
      await fixture.whenStable();

      expect(projectService.getProjectCover).toHaveBeenCalledWith(
        'newuser',
        'newproject'
      );
      expect((component as any).coverImageUrl()).toBe('mock-blob-url');
      expect((component as any).coverImageLoading()).toBe(false);
    });

    it('should handle cover image not found error', async () => {
      (projectService.getProjectCover as Mock).mockRejectedValue(
        new Error('Cover image not found')
      );

      // Wait for initial effect to complete
      await fixture.whenStable();

      // Clear previous calls
      (projectService.getProjectCover as Mock).mockClear();

      // Trigger the effect by setting a new project
      (projectStateService.project as any).set({
        ...mockProject,
        username: 'nocover',
        slug: 'project',
      });

      // Wait for effect to run and async operations to complete
      fixture.detectChanges();
      await fixture.whenStable();

      expect((component as any).coverImageUrl()).toBe(null);
      expect((component as any).coverImageLoading()).toBe(false);
      expect((component as any).showCoverPlaceholder()).toBe(true);
    });

    it('should handle other cover image errors', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (projectService.getProjectCover as Mock).mockRejectedValue(
        new Error('Network error')
      );

      // Wait for initial effect to complete
      await fixture.whenStable();

      // Clear previous calls
      (projectService.getProjectCover as Mock).mockClear();

      // Trigger the effect by setting a new project
      (projectStateService.project as any).set({
        ...mockProject,
        username: 'error',
        slug: 'project',
      });

      // Wait for effect to run and async operations to complete
      fixture.detectChanges();
      await fixture.whenStable();

      expect((component as any).coverImageUrl()).toBe(null);
      expect((component as any).coverImageLoading()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[HomeTab] Failed to load cover image:',
        expect.objectContaining({
          message: 'Network error',
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should show placeholder when no cover is loading and no URL', () => {
      (component as any).coverImageUrl.set(null);
      (component as any).coverImageLoading.set(false);

      expect((component as any).showCoverPlaceholder()).toBe(true);
    });

    it('should not show placeholder when cover is loading', () => {
      (component as any).coverImageUrl.set(null);
      (component as any).coverImageLoading.set(true);

      expect((component as any).showCoverPlaceholder()).toBe(false);
    });

    it('should not show placeholder when cover URL exists', () => {
      (component as any).coverImageUrl.set('mock-blob-url');
      (component as any).coverImageLoading.set(false);

      expect((component as any).showCoverPlaceholder()).toBe(false);
    });
  });
});
