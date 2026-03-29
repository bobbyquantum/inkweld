import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Input,
  NO_ERRORS_SCHEMA,
  Output,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { ProjectSearchService } from '@services/core/project-search.service';
import { QuickOpenService } from '@services/core/quick-open.service';
import { SettingsService } from '@services/core/settings.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { AutoSnapshotService } from '@services/project/auto-snapshot.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RecentFilesService } from '@services/project/recent-files.service';
import { MediaAutoSyncService } from '@services/sync/media-auto-sync.service';
import { type SplitGutterInteractionEvent } from 'angular-split';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentElementEditorComponent } from '../../components/document-element-editor/document-element-editor.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';
import { UserMenuComponent } from '../../components/user-menu/user-menu.component';
import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectComponent } from './project.component';
import { TabInterfaceComponent } from './tabs/tab-interface.component';

// Mock child components to avoid their dependencies
@Component({ selector: 'app-project-tree', template: '' })
class MockProjectTreeComponent {
  @Input() showCollapseButton?: boolean;
}

@Component({
  selector: 'app-user-menu',
  template: '',
})
class MockUserMenuComponent {
  @Input() miniMode?: boolean;
}

@Component({
  selector: 'app-document-element-editor',
  template: '',
})
class MockDocumentElementEditorComponent {
  @Input() documentId?: string;
  @Input() tabsDisabled?: boolean;
  @Input() zenMode?: boolean;
}

@Component({ selector: 'app-tab-interface', template: '' })
class MockTabInterfaceComponent {
  @Output() importRequested = new EventEmitter<void>();
}

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let documentService: Partial<DocumentService>;
  let recentFilesService: Partial<RecentFilesService>;
  let breakpointObserver: Partial<BreakpointObserver>;
  let snackBar: Partial<MatSnackBar>;
  let router: Partial<Router>;
  let exportService: Partial<ProjectExportService>;
  let projectService: Partial<UnifiedProjectService>;
  let dialogGateway: Partial<DialogGatewayService>;
  let settingsService: Partial<SettingsService>;
  let quickOpenService: {
    initialize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let projectSearchService: {
    initialize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
  };
  let paramsSubject: BehaviorSubject<Record<string, string>>;

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  const mockElement: Element = {
    id: 'elem-1',
    name: 'Test Document',
    type: ElementType.Item,
    parentId: null,
    level: 0,
    order: 0,
    expandable: false,
    version: 0,
    metadata: {},
  };

  const mockFolderElement: Element = {
    id: 'folder-1',
    name: 'Test Folder',
    type: ElementType.Folder,
    parentId: null,
    level: 0,
    order: 0,
    expandable: true,
    version: 0,
    metadata: {},
  };

  // Signals for tracking state
  const projectSignal = signal<Project | undefined>(mockProject);
  const elementsSignal = signal<Element[]>([]);
  const openTabsSignal = signal<any[]>([]);
  const selectedTabIndexSignal = signal(0);
  const isLoadingSignal = signal(false);
  const errorSignal = signal<string | undefined>(undefined);
  const openDocumentsSignal = signal<Element[]>([]);
  const visibleElementsSignal = signal<any[]>([]);
  const syncStateSignal = signal<DocumentSyncState>(DocumentSyncState.Synced);
  let routerUrl = '/testuser/test-project';

  beforeEach(async () => {
    // Reset signals
    projectSignal.set(mockProject);
    elementsSignal.set([]);
    openTabsSignal.set([]);
    selectedTabIndexSignal.set(0);
    isLoadingSignal.set(false);
    errorSignal.set(undefined);
    openDocumentsSignal.set([]);
    visibleElementsSignal.set([]);
    syncStateSignal.set(DocumentSyncState.Synced);
    routerUrl = '/testuser/test-project';

    paramsSubject = new BehaviorSubject<Record<string, string>>({
      username: 'testuser',
      slug: 'test-project',
    });

    projectStateService = {
      project: projectSignal,
      elements: elementsSignal,
      openTabs: openTabsSignal,
      selectedTabIndex: selectedTabIndexSignal,
      isLoading: isLoadingSignal,
      error: errorSignal,
      openDocuments: openDocumentsSignal,
      visibleElements: visibleElementsSignal,
      getSyncState: syncStateSignal,
      loadProject: vi.fn().mockResolvedValue(undefined),
      selectTab: vi.fn().mockImplementation((index: number) => {
        selectedTabIndexSignal.set(index);
      }),
      closeTab: vi.fn(),
      openDocument: vi.fn(),
      openSystemTab: vi.fn().mockReturnValue({ index: 1, wasCreated: true }),
      getPublishPlans: vi.fn().mockReturnValue([]),
      createPublishPlan: vi.fn(),
      openPublishPlan: vi.fn(),
      showEditProjectDialog: vi.fn(),
      showNewElementDialog: vi.fn(),
    };

    documentService = {
      getSyncStatusSignal: vi
        .fn()
        .mockReturnValue(signal(DocumentSyncState.Synced)),
      hasUnsyncedChanges: vi.fn().mockReturnValue(false),
      getActiveConnections: vi.fn().mockReturnValue([]),
    };

    recentFilesService = {
      getRecentFilesForProject: vi.fn().mockReturnValue([]),
    };

    breakpointObserver = {
      observe: vi
        .fn()
        .mockReturnValue(
          of({ matches: false, breakpoints: {} } as BreakpointState)
        ),
    };

    snackBar = {
      open: vi.fn().mockReturnValue({
        onAction: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
      }),
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true),
      get url() {
        return routerUrl;
      },
    };

    exportService = {
      exportProject: vi.fn().mockResolvedValue(undefined),
    };

    projectService = {
      deleteProject: vi.fn().mockResolvedValue(undefined),
    };

    dialogGateway = {
      openConfirmationDialog: vi.fn().mockResolvedValue(false),
      openEditProjectDialog: vi.fn().mockResolvedValue(null),
      openImportProjectDialog: vi.fn().mockResolvedValue({ success: false }),
    };

    settingsService = {
      getSetting: vi.fn().mockReturnValue(true),
    };
    quickOpenService = {
      initialize: vi.fn(),
      destroy: vi.fn(),
    };
    projectSearchService = {
      initialize: vi.fn(),
      destroy: vi.fn(),
      open: vi.fn(),
    };

    const autoSnapshotService = {
      createAutoSnapshots: vi.fn().mockResolvedValue(undefined),
      clearDirtyState: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [ProjectComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: DocumentService, useValue: documentService },
        { provide: RecentFilesService, useValue: recentFilesService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: MatSnackBar, useValue: snackBar },
        {
          provide: ActivatedRoute,
          useValue: { params: paramsSubject.asObservable() },
        },
        { provide: Router, useValue: router },
        { provide: Title, useValue: { setTitle: vi.fn() } },
        { provide: ProjectExportService, useValue: exportService },
        { provide: UnifiedProjectService, useValue: projectService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: SettingsService, useValue: settingsService },
        { provide: QuickOpenService, useValue: quickOpenService },
        { provide: ProjectSearchService, useValue: projectSearchService },
        {
          provide: StorageContextService,
          useValue: { isLocalMode: signal(false) },
        },
        { provide: AutoSnapshotService, useValue: autoSnapshotService },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        {
          provide: MediaAutoSyncService,
          useValue: {
            startAutoSync: vi.fn().mockResolvedValue(undefined),
            stopAutoSync: vi.fn(),
            triggerSyncAfterUpload: vi.fn().mockResolvedValue(undefined),
            isActive: signal(false),
            lastSyncTime: signal(null),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(ProjectComponent, {
        remove: {
          imports: [
            ProjectTreeComponent,
            UserMenuComponent,
            DocumentElementEditorComponent,
            TabInterfaceComponent,
          ],
        },
        add: {
          imports: [
            MockProjectTreeComponent,
            MockUserMenuComponent,
            MockDocumentElementEditorComponent,
            MockTabInterfaceComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should load project on init with route params', () => {
      component.ngOnInit();
      expect(projectStateService.loadProject).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });

    it('should select home tab (0) on init', () => {
      component.ngOnInit();
      expect(projectStateService.selectTab).toHaveBeenCalledWith(0);
    });

    it('should initialize quick open and project search on init', () => {
      const quickOpenCalls = quickOpenService.initialize.mock.calls.length;
      const projectSearchCalls =
        projectSearchService.initialize.mock.calls.length;

      component.ngOnInit();

      expect(quickOpenService.initialize).toHaveBeenCalledTimes(
        quickOpenCalls + 1
      );
      expect(projectSearchService.initialize).toHaveBeenCalledTimes(
        projectSearchCalls + 1
      );
    });
  });

  describe('sidebar toggling', () => {
    it('should toggle sidebar visibility for desktop', () => {
      component['isMobile'].set(false);
      expect(component['showSidebar']()).toBe(true);

      component.toggleSidebar();
      expect(component['showSidebar']()).toBe(false);

      component.toggleSidebar();
      expect(component['showSidebar']()).toBe(true);
    });
  });

  describe('document opening', () => {
    it('should open document via projectState', () => {
      component.onDocumentOpened(mockElement);
      expect(projectStateService.openDocument).toHaveBeenCalledWith(
        mockElement
      );
    });

    it('should navigate to document route when opening document', () => {
      component.onDocumentOpened(mockElement);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'testuser',
        'test-project',
        'document',
        mockElement.id,
      ]);
    });

    it('should navigate to folder route when opening folder', () => {
      component.onDocumentOpened(mockFolderElement);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'testuser',
        'test-project',
        'folder',
        mockFolderElement.id,
      ]);
    });
  });

  describe('tab management', () => {
    it('should close tab at specified index', () => {
      // Need at least 2 tabs for closeTab to be allowed
      openTabsSignal.set([
        { type: 'home', label: 'Home' },
        { type: 'document', label: 'Doc 1', element: { id: 'doc1' } },
      ]);
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      component.closeTab(1, mockEvent as unknown as MouseEvent);
      expect(projectStateService.closeTab).toHaveBeenCalledWith(1);
    });

    it('should not close the last tab', () => {
      // When there's only one tab, closeTab should not be called
      openTabsSignal.set([{ type: 'home', label: 'Home' }]);
      component.closeTab(0);
      expect(projectStateService.closeTab).not.toHaveBeenCalled();
    });

    it('should set selected tab index', () => {
      component.setSelectedTabIndex(2);
      expect(projectStateService.selectTab).toHaveBeenCalledWith(2);
    });
  });

  describe('navigation', () => {
    it('should exit project and navigate home', () => {
      component.exitProject();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should navigate to home tab via goHome', () => {
      component.goHome();
      expect(projectStateService.selectTab).toHaveBeenCalledWith(0);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'testuser',
        'test-project',
      ]);
    });

    it('should open the project search dialog', () => {
      component.openProjectSearch();

      expect(projectSearchService.open).toHaveBeenCalledTimes(1);
    });
  });

  describe('system tabs', () => {
    it('should show document list', () => {
      component.onShowDocumentList();
      expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
        'documents-list'
      );
      expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'testuser',
        'test-project',
        'documents-list',
      ]);
    });

    it('should show media library', () => {
      component.onShowMediaLibrary();
      expect(projectStateService.openSystemTab).toHaveBeenCalledWith('media');
      expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'testuser',
        'test-project',
        'media',
      ]);
    });

    it('should show project settings', () => {
      component.onShowSettings();
      expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
        'settings'
      );
      expect(projectStateService.selectTab).toHaveBeenCalledWith(1);
      expect(router.navigate).toHaveBeenCalledWith([
        '/',
        'testuser',
        'test-project',
        'settings',
      ]);
    });
  });

  describe('publish project', () => {
    it('should open publish plan when onPublishClick is called', () => {
      component.onPublishClick();

      // Should create a new publish plan since none exist
      expect(projectStateService.createPublishPlan).toHaveBeenCalled();
      expect(projectStateService.openPublishPlan).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalled();
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
      expect(router.navigate).toHaveBeenCalled();
    });
  });

  describe('edit project dialog', () => {
    it('should open edit project dialog', () => {
      component.openEditDialog();
      expect(dialogGateway.openEditProjectDialog).toHaveBeenCalledWith(
        mockProject
      );
    });
  });

  describe('zen mode', () => {
    it('should start with zen mode disabled', () => {
      expect(component['isZenMode']()).toBe(false);
    });

    it('should not enable zen mode when on home tab', () => {
      selectedTabIndexSignal.set(0);
      component.toggleZenMode();
      expect(component['isZenMode']()).toBe(false);
    });

    it('should return false for canEnableZenMode when on home tab', () => {
      selectedTabIndexSignal.set(0);
      expect(component.canEnableZenMode()).toBe(false);
    });

    it('should return false for canEnableZenMode when no tabs are open', () => {
      selectedTabIndexSignal.set(1);
      openTabsSignal.set([]);
      expect(component.canEnableZenMode()).toBe(false);
    });

    it('should return true for canEnableZenMode with document tab selected', () => {
      selectedTabIndexSignal.set(1);
      openTabsSignal.set([
        {
          type: 'document',
          element: mockElement,
          id: mockElement.id,
          name: 'Test',
        },
      ]);
      expect(component.canEnableZenMode()).toBe(true);
    });
  });

  describe('getCurrentDocumentId', () => {
    it('should return null when URL does not contain /document/', () => {
      routerUrl = '/testuser/test-project';
      expect(component.getCurrentDocumentId()).toBeNull();
    });

    it('should return null when on home tab', () => {
      routerUrl = '/testuser/test-project/document/elem-1';
      selectedTabIndexSignal.set(0);
      expect(component.getCurrentDocumentId()).toBeNull();
    });

    it('should return document ID for document tab', () => {
      routerUrl = '/testuser/test-project/document/elem-1';
      selectedTabIndexSignal.set(1);
      openTabsSignal.set([
        {
          type: 'document',
          element: mockElement,
          id: mockElement.id,
          name: 'Test',
        },
      ]);
      expect(component.getCurrentDocumentId()).toBe(
        'testuser:test-project:elem-1'
      );
    });
  });

  describe('gutter size', () => {
    it('should return 0 for mobile', () => {
      component['isMobile'].set(true);
      expect(component.getGutterSize()).toBe(0);
    });

    it('should return 4 for desktop', () => {
      component['isMobile'].set(false);
      expect(component.getGutterSize()).toBe(4);
    });
  });

  describe('split drag end', () => {
    it('should update split size on drag end', () => {
      component['isMobile'].set(false);

      const mockEvent: SplitGutterInteractionEvent = {
        sizes: [30, 70],
        gutterNum: 1,
      };
      component.onSplitDragEnd(mockEvent);

      expect(component['splitSize']).toBe(30);
      expect(localStorage.getItem('splitSize')).toBe('30');
    });

    it('should not update split size on mobile', () => {
      // Clear any previous value
      localStorage.removeItem('splitSize');
      component['isMobile'].set(true);

      const mockEvent: SplitGutterInteractionEvent = {
        sizes: [30, 70],
        gutterNum: 1,
      };
      component.onSplitDragEnd(mockEvent);

      expect(localStorage.getItem('splitSize')).toBeNull();
    });

    it('should not persist NaN split size', () => {
      component['isMobile'].set(false);
      localStorage.setItem('splitSize', '25');
      component['splitSize'] = 25;

      const mockEvent: SplitGutterInteractionEvent = {
        sizes: ['not-a-number' as unknown as number, 70],
        gutterNum: 1,
      };
      component.onSplitDragEnd(mockEvent);

      // Should retain previous value
      expect(component['splitSize']).toBe(25);
      expect(localStorage.getItem('splitSize')).toBe('25');
    });

    it('should not persist Infinity split size', () => {
      component['isMobile'].set(false);
      localStorage.setItem('splitSize', '25');
      component['splitSize'] = 25;

      const mockEvent: SplitGutterInteractionEvent = {
        sizes: [Infinity, 70],
        gutterNum: 1,
      };
      component.onSplitDragEnd(mockEvent);

      // Should retain previous value
      expect(component['splitSize']).toBe(25);
      expect(localStorage.getItem('splitSize')).toBe('25');
    });

    it('should ignore invalid stored splitSize on construction', () => {
      // Set an invalid value BEFORE creating a new component instance
      localStorage.setItem('splitSize', 'not-a-number');

      const freshFixture = TestBed.createComponent(ProjectComponent);
      const freshComponent = freshFixture.componentInstance;

      // Should keep the default value of 25 since 'not-a-number' is not finite
      expect(freshComponent['splitSize']).toBe(25);

      localStorage.removeItem('splitSize');
      freshFixture.destroy();
    });
  });

  describe('settings', () => {
    it('should return useTabsDesktop setting', () => {
      (settingsService.getSetting as ReturnType<typeof vi.fn>).mockReturnValue(
        true
      );
      expect(component.useTabsDesktop()).toBe(true);

      (settingsService.getSetting as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      );
      expect(component.useTabsDesktop()).toBe(false);
    });
  });

  describe('file import', () => {
    it('should open import dialog on import clicked', () => {
      (
        dialogGateway.openImportProjectDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ success: true, slug: 'imported-project' });

      component.onImportClicked();
      expect(dialogGateway.openImportProjectDialog).toHaveBeenCalledWith(
        'testuser'
      );
    });

    it('should show snackbar on successful import', async () => {
      (
        dialogGateway.openImportProjectDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ success: true, slug: 'imported-project' });

      component.onImportClicked();
      // Wait for the promise to resolve
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(snackBar.open).toHaveBeenCalledWith(
        'Project imported successfully!',
        'View',
        { duration: 5000 }
      );
    });
  });

  describe('file export', () => {
    it('should show a success snackbar when export completes', async () => {
      await component.onExportClicked();

      expect(exportService.exportProject).toHaveBeenCalledTimes(1);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Project exported successfully',
        'Close',
        { duration: 3000 }
      );
    });

    it('should show an error snackbar when export fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (
        exportService.exportProject as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('export failed'));

      await component.onExportClicked();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Export failed:',
        expect.any(Error)
      );
      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to export project',
        'Close',
        { duration: 5000 }
      );
      consoleSpy.mockRestore();
    });
  });

  describe('recent document', () => {
    it('should open recent document when clicked', () => {
      elementsSignal.set([mockElement]);

      component.onRecentDocumentClick(mockElement.id);
      expect(projectStateService.openDocument).toHaveBeenCalledWith(
        mockElement
      );
    });

    it('should not open document when not found', () => {
      elementsSignal.set([]);

      component.onRecentDocumentClick('non-existent');
      expect(projectStateService.openDocument).not.toHaveBeenCalled();
    });

    it('should handle keyboard navigation for recent documents', () => {
      elementsSignal.set([mockElement]);

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onRecentDocumentKeydown(enterEvent, mockElement.id);
      expect(projectStateService.openDocument).toHaveBeenCalledWith(
        mockElement
      );
    });

    it('should ignore unrelated keys for recent documents', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });

      component.onRecentDocumentKeydown(event, mockElement.id);

      expect(projectStateService.openDocument).not.toHaveBeenCalled();
    });
  });

  describe('delete project', () => {
    it('should open confirmation dialog on delete', async () => {
      (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      component.onDeleteProjectClick();
      await fixture.whenStable();

      expect(dialogGateway.openConfirmationDialog).toHaveBeenCalledWith({
        title: 'Delete Project',
        message: expect.stringContaining('test-project'),
        confirmText: 'Delete',
        cancelText: 'Cancel',
        requireConfirmationText: 'test-project',
      });
    });

    it('should delete project when confirmed', async () => {
      (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true);

      component.onDeleteProjectClick();
      await fixture.whenStable();

      // Allow promises to settle
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(projectService.deleteProject).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });

    it('should not delete project when cancelled', async () => {
      (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      component.onDeleteProjectClick();
      await fixture.whenStable();

      expect(projectService.deleteProject).not.toHaveBeenCalled();
    });
  });

  describe('beforeunload handler', () => {
    it('should not prevent navigation when no unsaved changes', () => {
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });

      const result = component.onBeforeUnload(event);
      expect(result).toBe(true);
    });

    it('should block navigation when unsaved changes exist', () => {
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      (
        component as unknown as { hasUnsavedChanges: boolean }
      ).hasUnsavedChanges = true;

      const result = component.onBeforeUnload(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(result).toBe('');
    });
  });

  describe('canDeactivate guard', () => {
    it('should return true when no unsaved changes', async () => {
      const result = await component.canDeactivate();
      expect(result).toBe(true);
    });

    it('should ask for confirmation when unsynced changes exist', async () => {
      (
        component as unknown as { hasUnsavedChanges: boolean }
      ).hasUnsavedChanges = true;
      (
        dialogGateway.openConfirmationDialog as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);

      await expect(component.canDeactivate()).resolves.toBe(false);
      expect(dialogGateway.openConfirmationDialog).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should clean up subscriptions on destroy', () => {
      const destroySpy = vi.spyOn(component['destroy$'], 'next');
      const completeSpy = vi.spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('isLoading', () => {
    it('should return loading state from projectState', () => {
      isLoadingSignal.set(true);
      expect(component.isLoading()).toBe(true);

      isLoadingSignal.set(false);
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('sync recovery', () => {
    it('should retry sync by reloading the current project', async () => {
      await component.onRetrySyncConnection();

      expect(projectStateService.loadProject).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(snackBar.open).toHaveBeenCalledWith('Reconnecting...', undefined, {
        duration: 2000,
      });
    });

    it('should surface a reconnect failure', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (
        projectStateService.loadProject as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('reconnect failed'));

      await component.onRetrySyncConnection();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to reconnect:',
        expect.any(Error)
      );
      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to reconnect to server',
        'Close',
        { duration: 5000 }
      );
      consoleSpy.mockRestore();
    });
  });

  describe('miscellaneous actions', () => {
    it('should open the new document dialog at the root level', () => {
      component.onCreateNewDocument();

      expect(projectStateService.showNewElementDialog).toHaveBeenCalledWith(
        undefined
      );
    });

    it('should detect the selected system tab', () => {
      openTabsSignal.set([
        { type: 'system', systemType: 'documents-list' },
        { type: 'system', systemType: 'settings' },
      ]);
      selectedTabIndexSignal.set(1);

      expect(component.isSystemTabSelected('settings')).toBe(true);
      expect(component.isSystemTabSelected('media')).toBe(false);
    });
  });
});
