import { CommonModule } from '@angular/common';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ImagesService } from '@inkweld/api/images.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { createDefaultPublishPlan } from '@models/publish-plan';
import { afterAll, vi } from 'vitest';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { DialogGatewayService } from '../../../../services/core/dialog-gateway.service';
import { ProjectService } from '../../../../services/project/project.service';
import { ProjectExportService } from '../../../../services/project/project-export.service';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { RecentFilesService } from '../../../../services/project/recent-files.service';
import { HomeTabComponent } from './home-tab.component';

/* Convenience aliases for mocks */
type ProjectsApiMock = DeepMockProxy<ProjectsService>;
type ImagesApiMock = DeepMockProxy<ImagesService>;
describe('HomeTabComponent', () => {
  let component: HomeTabComponent;
  let fixture: ComponentFixture<HomeTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let projectService: Partial<ProjectService>;
  let recentFilesService: Partial<RecentFilesService>;
  let exportService: Partial<ProjectExportService>;
  let dialogGateway: Partial<DialogGatewayService>;
  let snackBar: Partial<MatSnackBar>;

  const mockProject = {
    id: '1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: 'Test project description',
  } as Project;

  const mockRecentFiles = [
    {
      id: 'doc1',
      name: 'Recent Document 1',
      type: ElementType.Item,
    },
    {
      id: 'doc2',
      name: 'Recent Document 2',
      type: 'IMAGE',
    },
  ];

  // Mock URL.createObjectURL which isn't available in Jest environment
  const savedCreateObjectURL = globalThis.URL.createObjectURL;
  beforeAll(() => {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('mock-blob-url');
  });

  afterAll(() => {
    globalThis.URL.createObjectURL = savedCreateObjectURL;
  });

  let mockRouter: Partial<Router>;

  let projectsApi: ProjectsApiMock;
  let imagesApi: ImagesApiMock;
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard'
  );

  const setupMockServices = () => {
    // Initialize signals for ProjectStateService
    const projectSignal = signal(mockProject);
    const elementsSignal = signal<Element[]>([]);
    const publishPlansSignal = signal<any[]>([]);
    const coverMediaIdSignal = signal<string | undefined>(undefined);
    const canWriteSignal = signal<boolean>(true);

    // Mock Router
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    // Mock services
    projectStateService = {
      project: projectSignal,
      elements: elementsSignal,
      publishPlans: publishPlansSignal,
      coverMediaId: coverMediaIdSignal,
      canWrite: canWriteSignal,
      openDocument: vi.fn(),
      showEditProjectDialog: vi.fn(),
      openSystemTab: vi.fn().mockReturnValue({ index: 1, wasCreated: true }),
      selectTab: vi.fn(),
      getPublishPlans: vi.fn().mockReturnValue([]),
      createPublishPlan: vi.fn(),
      openPublishPlan: vi.fn(),
      deletePublishPlan: vi.fn(),
      updateProject: vi.fn(),
    };

    recentFilesService = {
      getRecentFilesForProject: vi.fn().mockReturnValue(mockRecentFiles),
    };

    exportService = {
      exportProject: vi.fn().mockResolvedValue(undefined),
    };

    projectService = {
      getProjectCover: vi.fn().mockImplementation(() => {
        // Return a promise that never resolves by default
        // Tests will override this with specific behavior
        return new Promise(() => {});
      }),
      uploadProjectCover: vi.fn().mockResolvedValue(undefined),
      getProjectByUsernameAndSlug: vi.fn().mockResolvedValue(mockProject),
    };

    // Use mockDeep for API services
    projectsApi = mockDeep<ProjectsService>();
    imagesApi = mockDeep<ImagesService>();
    // No need to set default return value - mockDeep handles it

    dialogGateway = {
      openGenerateCoverDialog: vi
        .fn()
        .mockResolvedValue({ approved: false, imageData: null }),
      openNewElementDialog: vi.fn().mockResolvedValue(undefined),
      openImportProjectDialog: vi.fn().mockResolvedValue(undefined),
      openConfirmationDialog: vi.fn().mockResolvedValue(false),
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
        { provide: ProjectsService, useValue: projectsApi },
        { provide: ImagesService, useValue: imagesApi },
        { provide: RecentFilesService, useValue: recentFilesService },
        { provide: ProjectExportService, useValue: exportService },
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

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    if (originalClipboardDescriptor) {
      Object.defineProperty(
        navigator,
        'clipboard',
        originalClipboardDescriptor
      );
    }
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
      type: ElementType.Item,
      level: 0,
      order: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as Element;

    // Setup elements to include the document for lookup
    (projectStateService.elements as any).set([mockElement]);

    component.onRecentDocumentClick(document.id);

    expect(projectStateService.openDocument).toHaveBeenCalledWith(mockElement);
  });

  it('should navigate to a folder route for recent folders', () => {
    const folderElement = {
      id: 'folder-1',
      name: 'Recent Folder',
      type: ElementType.Folder,
      level: 0,
      order: 0,
      expandable: true,
      version: 1,
      metadata: {},
    } as Element;

    (projectStateService.elements as any).set([folderElement]);

    component.onRecentDocumentClick(folderElement.id);

    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/',
      mockProject.username,
      mockProject.slug,
      'folder',
      folderElement.id,
    ]);
  });

  it('should ignore recent document clicks when the element is missing', () => {
    component.onRecentDocumentClick('missing-doc');

    expect(projectStateService.openDocument).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should not navigate for recent document clicks when no project is loaded', () => {
    const mockElement = {
      id: 'doc1',
      name: 'Recent Document 1',
      type: ElementType.Item,
      level: 0,
      order: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as Element;

    (projectStateService.project as any).set(undefined);
    (projectStateService.elements as any).set([mockElement]);

    component.onRecentDocumentClick(mockElement.id);

    expect(projectStateService.openDocument).toHaveBeenCalledWith(mockElement);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should export project when export button is clicked', () => {
    component.onExportClick();
    expect(exportService.exportProject).toHaveBeenCalled();
  });

  it('should not export project when no project is loaded', () => {
    (projectStateService.project as any).set(undefined);

    component.onExportClick();

    expect(exportService.exportProject).not.toHaveBeenCalled();
  });

  it('should open import dialog when import button is clicked', () => {
    component.onImportClick();
    expect(dialogGateway.openImportProjectDialog).toHaveBeenCalledWith(
      mockProject.username
    );
  });

  it('should open publish plan when publish button is clicked', () => {
    // No plans exist initially, so a new one should be created
    (projectStateService as any).getPublishPlans = vi.fn().mockReturnValue([]);

    component.onPublishClick();

    // Should create a new publish plan since none exist
    expect(projectStateService.createPublishPlan).toHaveBeenCalled();
    expect(projectStateService.openPublishPlan).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('should open existing publish plan when one exists', () => {
    const existingPlan = { id: 'plan-1', name: 'Test Plan' };
    (projectStateService as any).getPublishPlans = vi
      .fn()
      .mockReturnValue([existingPlan]);

    component.onPublishClick();

    // Should open existing plan, not create a new one
    expect(projectStateService.createPublishPlan).not.toHaveBeenCalled();
    expect(projectStateService.openPublishPlan).toHaveBeenCalledWith(
      existingPlan
    );
    expect(mockRouter.navigate).toHaveBeenCalled();
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

  it('should not open the new file dialog when no project is loaded', () => {
    (projectStateService.project as any).set(undefined);

    component.onNewFileClick();

    expect(dialogGateway.openNewElementDialog).not.toHaveBeenCalled();
  });

  it('should open generate cover dialog when generate cover button is clicked', async () => {
    const mockResult = {
      approved: true,
      saved: true,
      imageData: 'data:image/png;base64,test123',
    };
    (dialogGateway.openGenerateCoverDialog as any).mockResolvedValue(
      mockResult
    );

    component.onGenerateCoverClick();
    await Promise.resolve();

    expect(dialogGateway.openGenerateCoverDialog).toHaveBeenCalledWith(
      mockProject
    );
  });

  it('should not open generate cover dialog when no project is loaded', () => {
    (projectStateService.project as any).set(undefined);

    component.onGenerateCoverClick();

    expect(dialogGateway.openGenerateCoverDialog).not.toHaveBeenCalled();
  });

  it('should save cover image when dialog approves with image data', async () => {
    const mockResult = {
      saved: true,
      imageData: 'data:image/png;base64,test123',
    };
    (dialogGateway.openGenerateCoverDialog as any).mockResolvedValue(
      mockResult
    );

    component.onGenerateCoverClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(projectService.uploadProjectCover).toHaveBeenCalled();
  });

  it('should refresh project state after saving a generated cover image', async () => {
    const updatedProject = { ...mockProject, coverImage: 'cover.png' };
    const mockResult = {
      saved: true,
      imageData: 'data:image/png;base64,dGVzdA==',
    };

    (dialogGateway.openGenerateCoverDialog as any).mockResolvedValue(
      mockResult
    );
    (projectService.getProjectByUsernameAndSlug as any).mockResolvedValue(
      updatedProject
    );

    component.onGenerateCoverClick();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(projectService.uploadProjectCover).toHaveBeenCalledWith(
      mockProject.username,
      mockProject.slug,
      expect.any(Blob)
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Cover image saved successfully',
      'Close',
      { duration: 3000 }
    );
    expect(projectService.getProjectByUsernameAndSlug).toHaveBeenCalledWith(
      mockProject.username,
      mockProject.slug
    );
    expect(projectStateService.updateProject).toHaveBeenCalledWith(
      updatedProject
    );
  });

  it('should report a refresh failure after saving a generated cover image', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const refreshError = new Error('refresh failed');
    const mockResult = {
      saved: true,
      imageData: 'data:image/png;base64,dGVzdA==',
    };

    (dialogGateway.openGenerateCoverDialog as any).mockResolvedValue(
      mockResult
    );
    (projectService.getProjectByUsernameAndSlug as any).mockRejectedValue(
      refreshError
    );

    component.onGenerateCoverClick();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to refresh project after cover upload:',
      refreshError
    );
  });

  it('should report a generated cover image upload failure', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const uploadError = new Error('upload failed');
    const mockResult = {
      saved: true,
      imageData: 'data:image/png;base64,dGVzdA==',
    };

    (dialogGateway.openGenerateCoverDialog as any).mockResolvedValue(
      mockResult
    );
    (projectService.uploadProjectCover as any).mockRejectedValue(uploadError);

    component.onGenerateCoverClick();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error uploading cover image:',
      uploadError
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to save cover image',
      'Close',
      { duration: 5000 }
    );
  });

  it('should not save cover image when dialog is cancelled', async () => {
    const mockResult = { saved: false };
    (dialogGateway.openGenerateCoverDialog as any).mockResolvedValue(
      mockResult
    );

    component.onGenerateCoverClick();
    await Promise.resolve();

    expect(imagesApi.uploadProjectCover).not.toHaveBeenCalled();
  });

  it('should open documents tab', () => {
    component.openDocumentsTab();
    expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
      'documents-list'
    );
    expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
  });

  it('should open media tab', () => {
    component.openMediaTab();
    expect(projectStateService.openSystemTab).toHaveBeenCalledWith('media');
    expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
  });

  it('should open templates tab', () => {
    component.openTemplatesTab();

    expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
      'templates-list'
    );
    expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/',
      mockProject.username,
      mockProject.slug,
      'templates-list',
    ]);
  });

  it('should open settings tab', () => {
    component.openSettingsTab();

    expect(projectStateService.openSystemTab).toHaveBeenCalledWith('settings');
    expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/',
      mockProject.username,
      mockProject.slug,
      'settings',
    ]);
  });

  it('should create and open a publish plan from the home tab', () => {
    const expectedPlan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );

    component.createPublishPlan();

    expect(projectStateService.createPublishPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expectedPlan.name,
        metadata: expect.objectContaining({
          author: expectedPlan.metadata.author,
        }),
      })
    );
    expect(projectStateService.openPublishPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expectedPlan.name,
        metadata: expect.objectContaining({
          author: expectedPlan.metadata.author,
        }),
      })
    );
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/',
      mockProject.username,
      mockProject.slug,
      'publish-plan',
      expect.any(String),
    ]);
  });

  it('should not create a publish plan when no project is loaded', () => {
    (projectStateService.project as any).set(undefined);

    component.createPublishPlan();

    expect(projectStateService.createPublishPlan).not.toHaveBeenCalled();
    expect(projectStateService.openPublishPlan).not.toHaveBeenCalled();
  });

  it('should open a publish plan directly', () => {
    const plan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );

    component.openPublishPlan(plan);

    expect(projectStateService.openPublishPlan).toHaveBeenCalledWith(plan);
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/',
      mockProject.username,
      mockProject.slug,
      'publish-plan',
      plan.id,
    ]);
  });

  it('should ignore publish-plan open requests when no project is loaded', () => {
    const plan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );
    (projectStateService.project as any).set(undefined);

    component.openPublishPlan(plan);

    expect(projectStateService.openPublishPlan).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should delete a publish plan after confirmation', async () => {
    const plan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );
    const event = new Event('click');
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    (dialogGateway.openConfirmationDialog as any).mockResolvedValue(true);

    await component.deletePublishPlan(event, plan);

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(projectStateService.deletePublishPlan).toHaveBeenCalledWith(plan.id);
    expect(snackBar.open).toHaveBeenCalledWith(
      `Deleted "${plan.name}"`,
      'Close',
      {
        duration: 3000,
      }
    );
  });

  it('should not delete a publish plan when confirmation is rejected', async () => {
    const plan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );
    const event = new Event('click');
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

    await component.deletePublishPlan(event, plan);

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(projectStateService.deletePublishPlan).not.toHaveBeenCalled();
  });

  it('should delete publish plans from keyboard activation', () => {
    const plan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );
    const event = new KeyboardEvent('keydown', { key: ' ' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    const deleteSpy = vi
      .spyOn(component, 'deletePublishPlan')
      .mockResolvedValue(undefined);

    component.onDeletePublishPlanKeydown(event, plan);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith(event, plan);
  });

  it('should ignore unrelated delete publish-plan keyboard events', () => {
    const plan = createDefaultPublishPlan(
      mockProject.title,
      mockProject.username
    );
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    const deleteSpy = vi
      .spyOn(component, 'deletePublishPlan')
      .mockResolvedValue(undefined);

    component.onDeletePublishPlanKeydown(event, plan);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  describe.skip('cover image', () => {
    it('should load cover image when project is set', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      (projectService.getProjectCover as any).mockResolvedValue(mockBlob);

      // Wait for initial effect to complete
      await fixture.whenStable();

      // Clear previous calls
      (projectService.getProjectCover as any).mockClear();

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
      (projectService.getProjectCover as any).mockRejectedValue(
        new Error('Cover image not found')
      );

      // Wait for initial effect to complete
      await fixture.whenStable();

      // Clear previous calls
      (projectService.getProjectCover as any).mockClear();

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
      (projectService.getProjectCover as any).mockRejectedValue(
        new Error('Network error')
      );

      // Wait for initial effect to complete
      await fixture.whenStable();

      // Clear previous calls
      (projectService.getProjectCover as any).mockClear();

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
