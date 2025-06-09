import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpClient, HttpHandler } from '@angular/common/http';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSidenav } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ProjectDto, ProjectElementDto } from '@inkweld/index';
import {
  createRoutingFactory,
  Spectator,
  SpyObject,
} from '@ngneat/spectator/vitest';
import { SplitGutterInteractionEvent } from 'angular-split';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { BehaviorSubject, of } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { DocumentService } from '../../services/document.service';
import { ProjectService } from '../../services/project.service';
import { ProjectImportExportService } from '../../services/project-import-export.service';
import {
  AppTab,
  ProjectStateService,
} from '../../services/project-state.service';
import { RecentFilesService } from '../../services/recent-files.service';
import { SettingsService } from '../../services/settings.service';
import { ProjectComponent } from './project.component';

// Create mock components for Angular Split
/* eslint-disable @angular-eslint/component-selector */
@Component({
  selector: 'as-split',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class MockSplitComponent {
  @Input() direction: string = '';
  @Input() gutterSize: number = 0;
  @Input() unit: string = '';
  @Input() useTransition: boolean = false;
}

@Component({
  selector: 'as-split-area',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class MockSplitAreaComponent {
  @Input() size: number = 0;
  @Input() minSize: number = 0;
  @Input() maxSize: number = 0;
}

@Component({
  selector: 'app-tab-interface',
  standalone: true,
  template: '',
})
class MockTabInterfaceComponent {
  @Input() tabs: any;
  @Input() selectedIndex!: number;
  @Output() tabChange = new EventEmitter<number>();
}

// Define types for mocks
type ProjectStateMock = DeepMockProxy<ProjectStateService> &
  SpyObject<ProjectStateService>;
type DocumentServiceMock = DeepMockProxy<DocumentService> &
  SpyObject<DocumentService>;
type RecentFilesServiceMock = DeepMockProxy<RecentFilesService> &
  SpyObject<RecentFilesService>;
type DialogGatewayServiceMock = DeepMockProxy<DialogGatewayService> &
  SpyObject<DialogGatewayService>;
type ProjectServiceMock = DeepMockProxy<ProjectService> &
  SpyObject<ProjectService>;
type SettingsServiceMock = DeepMockProxy<SettingsService> &
  SpyObject<SettingsService>;
type ImportExportServiceMock = DeepMockProxy<ProjectImportExportService> &
  SpyObject<ProjectImportExportService>;

describe('ProjectComponent', () => {
  let spectator: Spectator<ProjectComponent>;
  let component: ProjectComponent;
  let projectStateService: ProjectStateMock;
  let documentService: DocumentServiceMock;
  let recentFilesService: RecentFilesServiceMock;
  let dialogGatewayService: DialogGatewayServiceMock;
  let projectService: ProjectServiceMock;
  let settingsService: SettingsServiceMock;
  let importExportService: ImportExportServiceMock;
  let routeParams: BehaviorSubject<{ username: string; slug: string }>;
  let breakpointSubject: BehaviorSubject<{ matches: boolean }>;
  let snackBarMock: SpyObject<MatSnackBar>;
  let titleServiceMock: SpyObject<Title>;
  let breakpointObserverMock: SpyObject<BreakpointObserver>;
  let dialogMock: SpyObject<MatDialog>;
  let httpClientMock: SpyObject<HttpClient>;

  const mockElements: ProjectElementDto[] = [
    {
      id: '1',
      name: 'Element 1',
      type: 'ITEM',
      level: 0,
      position: 0,
      version: 1,
      expandable: false,
      metadata: {},
    },
    {
      id: '2',
      name: 'Element 2',
      type: 'ITEM',
      level: 0,
      position: 1,
      version: 1,
      expandable: false,
      metadata: {},
    },
    {
      id: '3',
      name: 'Folder Element',
      type: 'FOLDER',
      level: 0,
      position: 2,
      version: 1,
      expandable: true,
      metadata: { viewMode: 'grid' },
    },
  ];

  const mockProject: ProjectDto = {
    id: 'test123',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  const mockTabs: AppTab[] = [
    {
      id: 'home',
      type: 'system',
      name: 'Home',
      systemType: 'home',
    },
    {
      id: '1',
      type: 'document',
      name: 'Element 1',
      element: mockElements[0],
    },
  ];

  const createComponent = createRoutingFactory({
    component: ProjectComponent,
    imports: [
      MockSplitComponent,
      MockSplitAreaComponent,
      MockTabInterfaceComponent,
    ],
    providers: [], // Will be overridden with mocks
    routes: [{ path: 'project/:username/:slug', component: ProjectComponent }],
    shallow: true, // Use shallow rendering for better isolation
  });

  beforeEach(() => {
    // Set up Jest timers
    vi.useFakeTimers();

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn().mockImplementation(key => {
          if (key === 'splitSize') return '25';
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
    });

    // Document Fullscreen API mock
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      value: null,
    });
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = vi
      .fn()
      .mockResolvedValue(undefined);

    // Setup mock params for route
    routeParams = new BehaviorSubject<{ username: string; slug: string }>({
      username: 'testuser',
      slug: 'test-project',
    });

    breakpointSubject = new BehaviorSubject<{ matches: boolean }>({
      matches: false, // Default to desktop view
    });

    // Create deep mocks
    projectStateService = mockDeep<ProjectStateService>();
    documentService = mockDeep<DocumentService>();
    recentFilesService = mockDeep<RecentFilesService>();
    dialogGatewayService = mockDeep<DialogGatewayService>();
    projectService = mockDeep<ProjectService>();
    settingsService = mockDeep<SettingsService>();
    importExportService = mockDeep<ProjectImportExportService>();

    // Mock HttpClient
    httpClientMock = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as SpyObject<HttpClient>;

    // Setup signal mocks
    projectStateService.project.mockReturnValue(mockProject);
    projectStateService.elements.mockReturnValue(mockElements);
    projectStateService.visibleElements.mockReturnValue(mockElements);
    projectStateService.openDocuments.mockReturnValue([mockElements[0]]);
    projectStateService.selectedTabIndex.mockReturnValue(0);
    projectStateService.openTabs.mockReturnValue(mockTabs);
    projectStateService.error.mockReturnValue(undefined);
    projectStateService.isLoading.mockReturnValue(false);

    snackBarMock = {
      open: vi.fn(),
    } as unknown as SpyObject<MatSnackBar>;

    titleServiceMock = {
      setTitle: vi.fn(),
    } as unknown as SpyObject<Title>;

    breakpointObserverMock = {
      observe: vi.fn().mockReturnValue(breakpointSubject),
    } as unknown as SpyObject<BreakpointObserver>;

    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(null)),
      }),
    } as unknown as SpyObject<MatDialog>;

    // Setup document service
    documentService.getSyncStatus.mockReturnValue(of(DocumentSyncState.Synced));
    documentService.hasUnsyncedChanges.mockReturnValue(false);

    // Setup service behavior
    dialogGatewayService.openConfirmationDialog.mockResolvedValue(true);
    projectService.deleteProject.mockResolvedValue(undefined);

    // Fix for TypeScript error with getSetting
    settingsService.getSetting.mockImplementation(
      <T>(key: string, defaultValue: T): T => {
        if (key === 'useTabsDesktop') return defaultValue;
        if (key === 'zenModeFullscreen') return defaultValue;
        return defaultValue;
      }
    );

    // Create the component with our mocks

    spectator = createComponent({
      providers: [
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: DocumentService, useValue: documentService },
        { provide: RecentFilesService, useValue: recentFilesService },
        { provide: DialogGatewayService, useValue: dialogGatewayService },
        { provide: ProjectService, useValue: projectService },
        { provide: SettingsService, useValue: settingsService },
        { provide: ProjectImportExportService, useValue: importExportService },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: Title, useValue: titleServiceMock },
        { provide: BreakpointObserver, useValue: breakpointObserverMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: HttpClient, useValue: httpClientMock },
        { provide: HttpHandler, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
    });

    component = spectator.component;

    // Set up component ViewChild elements which are not available in shallow rendering
    component.sidenav = {
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
    } as unknown as MatSidenav;

    component.fileInput = {
      nativeElement: document.createElement('input'),
    } as ElementRef<HTMLInputElement>;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    routeParams.complete();
    breakpointSubject.complete();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize component values', () => {
      expect(component.isMobile()).toBe(false);
      expect(component.isZenMode()).toBe(false);
      expect(component.showSidebar()).toBe(true);
      expect(component.isDeleting()).toBe(false);
    });

    it('should setup breakpoint observer', () => {
      component.ngOnInit();

      // Verify breakpoint observer was setup
      expect(breakpointObserverMock.observe).toHaveBeenCalled();

      // Verify behavior when breakpoint changes
      breakpointSubject.next({ matches: true });
      expect(component.isMobile()).toBe(true);

      breakpointSubject.next({ matches: false });
      expect(component.isMobile()).toBe(false);
    });

    it('should set title on init', () => {
      component.ngOnInit();
      expect(titleServiceMock.setTitle).toHaveBeenCalledWith('Test Project');
    });

    it('should add fullscreen listener on init', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      component.ngOnInit();
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
    });
  });

  describe('Navigation and UI Controls', () => {
    it('should toggle sidenav', () => {
      void component.toggleSidenav();
      expect(component.sidenav.toggle).toHaveBeenCalled();
    });

    it('should toggle sidebar', () => {
      const initialValue = component.showSidebar();
      component.toggleSidebar();
      expect(component.showSidebar()).toBe(!initialValue);
    });

    it('should handle split drag end event', () => {
      const mockEvent = {
        gutterNum: 1,
        sizes: [30, 70],
      } as SplitGutterInteractionEvent;

      const localStorageSpy = vi.spyOn(localStorage, 'setItem');

      component.onSplitDragEnd(mockEvent);
      expect(localStorageSpy).toHaveBeenCalledWith('splitSize', '30');
    });

    it('should set selected tab index', () => {
      component.setSelectedTabIndex(2);
      expect(projectStateService.selectedTabIndex.set).toHaveBeenCalledWith(2);
    });

    it('should get gutter size based on mobile status', () => {
      vi.spyOn(component, 'isMobile').mockReturnValue(false);
      expect(component.getGutterSize()).toBe(8);

      vi.spyOn(component, 'isMobile').mockReturnValue(true);
      expect(component.getGutterSize()).toBe(0);
    });
  });

  describe('Zen Mode', () => {
    it('should toggle zen mode', () => {
      // Mock canEnableZenMode to return true
      vi.spyOn(component, 'canEnableZenMode').mockReturnValue(true);

      // Toggle on
      component.toggleZenMode();
      expect(component.isZenMode()).toBe(true);
      expect(document.documentElement.requestFullscreen).toHaveBeenCalled();

      // Toggle off
      component.toggleZenMode();
      expect(component.isZenMode()).toBe(false);
    });
  });

  describe('Document Handling', () => {
    it('should open recent document on click', () => {
      projectStateService.elements.mockReturnValue(mockElements);
      component.onRecentDocumentClick('2');
      expect(projectStateService.openDocument).toHaveBeenCalledWith(
        mockElements[1]
      );
    });

    it('should handle key down events on recent documents', () => {
      vi.spyOn(component, 'onRecentDocumentClick');

      // Enter key should call onRecentDocumentClick
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onRecentDocumentKeydown(enterEvent, '1');
      expect(component.onRecentDocumentClick).toHaveBeenCalledWith('1');

      // Space key should call onRecentDocumentClick
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      component.onRecentDocumentKeydown(spaceEvent, '2');
      expect(component.onRecentDocumentClick).toHaveBeenCalledWith('2');

      // Other keys should not trigger action
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      (component.onRecentDocumentClick as vi.Mock).mockClear();
      component.onRecentDocumentKeydown(escEvent, '3');
      expect(component.onRecentDocumentClick).not.toHaveBeenCalled();
    });

    it('should handle document opened event', () => {
      // Test on desktop
      vi.spyOn(component, 'isMobile').mockReturnValue(false);
      const sidenav = { close: vi.fn() } as unknown as MatSidenav;
      component.sidenav = sidenav;

      component.onDocumentOpened(mockElements[0]);
      expect(projectStateService.openDocument).toHaveBeenCalledWith(
        mockElements[0]
      );
      expect(sidenav.close).not.toHaveBeenCalled();

      // Test on mobile - should close sidenav
      vi.spyOn(component, 'isMobile').mockReturnValue(true);
      component.onDocumentOpened(mockElements[1]);
      expect(projectStateService.openDocument).toHaveBeenCalledWith(
        mockElements[1]
      );
      expect(sidenav.close).toHaveBeenCalled();
    });

    it('should close tab', () => {
      component.closeTab(2);
      expect(projectStateService.closeTab).toHaveBeenCalledWith(1);
    });
  });

  describe('Project Management', () => {
    it('should open edit dialog', () => {
      component.openEditDialog();
      expect(dialogGatewayService.openEditProjectDialog).toHaveBeenCalledWith(
        mockProject
      );
    });

    it('should cancel project deletion when dialog is cancelled', () => {
      dialogGatewayService.openConfirmationDialog.mockResolvedValue(false);

      void component.onDeleteProjectClick();

      // Run timers to allow promises to resolve
      vi.runAllTimers();

      expect(projectService.deleteProject).not.toHaveBeenCalled();
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should clean up on destroy', () => {
      const removeEventListenerSpy = vi.spyOn(
        document,
        'removeEventListener'
      );

      component.ngOnDestroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
    });
  });

  describe('Tab interface settings', () => {
    it('should check if desktop tabs are enabled', () => {
      // Override mock to return specific values for this test
      settingsService.getSetting.mockImplementation(
        <T>(key: string, defaultValue: T): T => {
          if (key === 'useTabsDesktop') {
            return true as unknown as T;
          }
          return defaultValue;
        }
      );

      expect(component.useTabsDesktop()).toBe(true);

      // Change the mock for the second call
      settingsService.getSetting.mockImplementation(
        <T>(key: string, defaultValue: T): T => {
          if (key === 'useTabsDesktop') {
            return false as unknown as T;
          }
          return defaultValue;
        }
      );

      expect(component.useTabsDesktop()).toBe(false);
    });
  });
});
