import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import {
  ActivatedRoute,
  convertToParamMap,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router';
import { ElementType } from '@inkweld/index';
import { type Element, type Project } from '@inkweld/index';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { DocumentSyncState } from '../../../models/document-sync-state';
import { DialogGatewayService } from '../../../services/core/dialog-gateway.service';
import { DocumentService } from '../../../services/project/document.service';
import {
  type AppTab,
  ProjectStateService,
} from '../../../services/project/project-state.service';
import { TabInterfaceComponent } from './tab-interface.component';

describe('TabInterfaceComponent', () => {
  let component: TabInterfaceComponent;
  let fixture: ComponentFixture<TabInterfaceComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let documentService: Partial<DocumentService>;
  let dialogGatewayService: Partial<DialogGatewayService>;
  let router: Partial<Router>;
  let activatedRoute: Partial<ActivatedRoute>;
  let dialog: Partial<MatDialog>;
  let routerEvents: Subject<NavigationEnd>;

  // Mock data
  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
  } as Project;

  const mockDocuments: Element[] = [
    {
      id: 'doc1',
      name: 'Document 1',
      type: ElementType.Item,
      level: 0,
      order: 0,
      version: 1,
      expandable: false,
      metadata: {},
      parentId: null,
    },
    {
      id: 'doc2',
      name: 'Document 2',
      type: ElementType.Folder,
      level: 0,
      order: 1,
      version: 1,
      expandable: true,
      metadata: {},
      parentId: null,
    },
  ];

  const mockTabs: AppTab[] = [
    {
      id: 'doc1',
      name: 'Document 1',
      type: 'document',
      element: mockDocuments[0],
    },
    {
      id: 'doc2',
      name: 'Document 2',
      type: 'folder',
      element: mockDocuments[1],
    },
    {
      id: 'system-documents-list',
      name: 'Documents',
      type: 'system',
      systemType: 'documents-list',
    },
  ];

  const setupMockServices = () => {
    // Initialize signals
    const projectSignal = signal(mockProject);
    const openDocumentsSignal = signal<Element[]>([...mockDocuments]);
    const openTabsSignal = signal<AppTab[]>([...mockTabs]);
    const selectedTabIndexSignal = signal<number>(0);
    const isLoadingSignal = signal<boolean>(false);
    const elementsSignal = signal<Element[]>([...mockDocuments]);

    // Mock project state service
    projectStateService = {
      project: projectSignal,
      openDocuments: openDocumentsSignal,
      openTabs: openTabsSignal,
      selectedTabIndex: selectedTabIndexSignal,
      isLoading: isLoadingSignal,
      elements: elementsSignal,
      openDocument: vi.fn(),
      closeDocument: vi.fn(),
      closeTab: vi.fn(),
      renameNode: vi.fn(),
      openSystemTab: vi.fn(),
      openHomeTab: vi.fn(),
      reorderTabs: vi.fn(),
      selectTab: vi.fn((index: number) => selectedTabIndexSignal.set(index)),
    };

    // Mock document service
    documentService = {
      initializeSyncStatus: vi.fn(),
      getSyncStatusSignal: vi
        .fn()
        .mockReturnValue(() => DocumentSyncState.Synced), // Default mock
    };

    // Mock dialog gateway service
    dialogGatewayService = {
      openRenameDialog: vi.fn().mockResolvedValue('New Name'),
    };

    // Mock router
    routerEvents = new Subject<NavigationEnd>();
    router = {
      navigate: vi.fn().mockResolvedValue(true),
      events: routerEvents.asObservable(),
      url: '/testuser/test-project',
    };

    // Mock activated route with childRoutes for tab ID extraction
    activatedRoute = {
      root: {
        firstChild: {
          firstChild: {
            outlet: 'primary',
            snapshot: {
              paramMap: convertToParamMap({ tabId: null }),
            },
          },
        },
      },
      paramMap: of(convertToParamMap({})),
    } as unknown as ActivatedRoute;

    // Mock dialog
    dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };
  };

  beforeEach(async () => {
    setupMockServices();

    await TestBed.configureTestingModule({
      declarations: [],
      imports: [
        TabInterfaceComponent,
        MatTabsModule,
        MatIconModule,
        MatButtonModule,
        RouterModule,
        MatMenuModule,
        CommonModule,
        CdkContextMenuTrigger,
        CdkMenu,
        CdkMenuItem,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: DocumentService, useValue: documentService },
        { provide: DialogGatewayService, useValue: dialogGatewayService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: activatedRoute },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TabInterfaceComponent);
    component = fixture.componentInstance;

    // Override the initialSyncDone to avoid the effect that might update the index
    (component as any).initialSyncDone = true;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with the correct tab index', () => {
    // The component should initialize with index 0 which is the home tab
    expect(component.currentTabIndex).toBe(0);
  });

  it('should change tab when onTabChange is called', () => {
    const selectTabSpy = vi.spyOn(projectStateService as any, 'selectTab');
    component.onTabChange(1);
    expect(selectTabSpy).toHaveBeenCalledWith(1);
  });

  it('should close a tab when closeTab is called', () => {
    component.closeTab(1);
    expect(projectStateService.closeTab).toHaveBeenCalledWith(1); // Direct index, no offset
  });

  it('should navigate to previous tab when current tab is closed', () => {
    // Set current tab to 1 (second tab)
    (projectStateService.selectedTabIndex as any).set(1);
    fixture.detectChanges();

    // Mock tab change method
    vi.spyOn(component, 'onTabChange');

    // Close the current tab
    component.closeTab(1);

    // Should navigate to tab 0
    expect(component.onTabChange).toHaveBeenCalledWith(0);
    expect(projectStateService.closeTab).toHaveBeenCalledWith(1); // Direct index
  });

  it('should not close the last remaining tab', () => {
    // Set up with only one tab
    (projectStateService.openTabs as any).set([mockTabs[0]]);
    fixture.detectChanges();

    component.closeTab(0);
    expect(projectStateService.closeTab).not.toHaveBeenCalled();
  });

  it('should handle click event when closing a tab', () => {
    const mockEvent = new MouseEvent('click');
    vi.spyOn(mockEvent, 'preventDefault');
    vi.spyOn(mockEvent, 'stopPropagation');

    component.closeTab(1, mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });

  it('should open a document', () => {
    const document = mockDocuments[0];
    component.openDocument(document);

    expect(documentService.initializeSyncStatus).toHaveBeenCalledWith(
      `${mockProject.username}:${mockProject.slug}:${document.id}`
    );
    expect(projectStateService.openDocument).toHaveBeenCalledWith(document);
  });

  it('should open the tab context menu', () => {
    const tabIndex = 1;
    const tab = mockTabs[0];

    component.onTabContextMenu(tabIndex, tab);

    expect(component.contextTabIndex).toBe(tabIndex);
    expect(component.contextTab).toBe(tab);
  });

  it('should close the tab context menu', () => {
    component.contextTabIndex = 1;
    component.contextTab = mockTabs[0];

    component.onContextMenuClose();

    expect(component.contextTabIndex).toBeNull();
    expect(component.contextTab).toBeNull();
  });

  it('should rename a tab element', async () => {
    const tab = mockTabs[0];
    const newName = 'New Document Name';
    (dialogGatewayService.openRenameDialog as Mock).mockResolvedValue(newName);

    await component.onRenameTabElement(tab);

    expect(dialogGatewayService.openRenameDialog).toHaveBeenCalledWith({
      currentName: tab.name,
      title: 'Rename Document',
    });
    expect(projectStateService.renameNode).toHaveBeenCalledWith(
      tab.element,
      newName
    );
  });

  it('should emit importRequested when onImportRequested is called', () => {
    vi.spyOn(component.importRequested, 'emit');
    component.onImportRequested();
    expect(component.importRequested.emit).toHaveBeenCalled();
  });

  it('should open a system tab', () => {
    component.openSystemTab('documents-list');
    expect(projectStateService.openSystemTab).toHaveBeenCalledWith(
      'documents-list'
    );
  });

  it('should update selected tab from URL', () => {
    const mockRoute = {
      root: {
        firstChild: {
          firstChild: {
            outlet: 'primary',
            snapshot: {
              paramMap: {
                has: () => true,
                get: () => 'doc2',
              },
            },
          },
        },
      },
    };

    (component as any)['route'] = mockRoute as any;

    // Mock selectTab method
    const selectTabSpy = vi.spyOn(projectStateService as any, 'selectTab');

    component.updateSelectedTabFromUrl();

    // Should set tab index to document index + 1 (for home tab)
    expect(selectTabSpy).toHaveBeenCalled();
  });

  it('should open publish-plan tab by ID when URL matches /publish-plan/:id', () => {
    const planId = 'plan-abc-123';
    const publishPlanTab: AppTab = {
      id: `publish-plan-${planId}`,
      name: 'My Plan',
      type: 'publishPlan',
      publishPlan: { id: planId, name: 'My Plan' } as any,
    };

    (projectStateService.openTabs as any).set([
      { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
      publishPlanTab,
    ]);

    (router as any).url = `/testuser/test-project/publish-plan/${planId}`;

    const selectTabSpy = vi.spyOn(projectStateService as any, 'selectTab');
    component.updateSelectedTabFromUrl();

    expect(selectTabSpy).toHaveBeenCalledWith(1);
  });

  it('should use publish-plan- prefix (not publishPlan-) when extracting plan ID from tab.id', () => {
    const planId = 'plan-xyz';
    // Tab has no publishPlan object, falls back to tab.id.replaceAll('publish-plan-', '')
    const publishPlanTab: AppTab = {
      id: `publish-plan-${planId}`,
      name: 'My Plan',
      type: 'publishPlan',
      publishPlan: undefined,
    };

    (projectStateService.openTabs as any).set([
      { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
      publishPlanTab,
    ]);

    (router as any).url = `/testuser/test-project/publish-plan/${planId}`;

    const selectTabSpy = vi.spyOn(projectStateService as any, 'selectTab');
    component.updateSelectedTabFromUrl();

    expect(selectTabSpy).toHaveBeenCalledWith(1);
  });

  it('should open home tab when URL has no tabId and no home tab exists', () => {
    const mockRoute = {
      root: {
        firstChild: {
          firstChild: {
            outlet: 'primary',
            snapshot: {
              paramMap: {
                has: () => false,
                get: () => null,
              },
            },
          },
        },
      },
    };

    (component as any)['route'] = mockRoute as any;

    // Set up with no home tab
    (projectStateService.openTabs as any).set([mockTabs[0]]); // Just a regular doc

    component.updateSelectedTabFromUrl();

    // Should call openHomeTab since there's no home tab
    expect(projectStateService.openHomeTab).toHaveBeenCalled();
  });

  it('should handle router navigation events', () => {
    vi.spyOn(component, 'updateSelectedTabFromUrl');

    // Set initialSyncDone to true to allow the navigation event handler to run
    component['initialSyncDone'] = true;

    // Create a navigation end event
    const navigationEndEvent = new NavigationEnd(1, 'test', 'test');
    routerEvents.next(navigationEndEvent);

    expect(component.updateSelectedTabFromUrl).toHaveBeenCalled();
  });

  it('should clean up subscriptions on destroy', () => {
    const mockSubscription = {
      unsubscribe: vi.fn(),
    };
    component['routerSubscription'] = mockSubscription as any;

    const destroyNextSpy = vi.spyOn(component['destroy$'] as any, 'next');
    const destroyCompleteSpy = vi.spyOn(
      component['destroy$'] as any,
      'complete'
    );

    component.ngOnDestroy();

    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(destroyNextSpy).toHaveBeenCalled();
    expect(destroyCompleteSpy).toHaveBeenCalled();
  });

  describe('scrollToActiveTab', () => {
    it('should scroll left when active tab is out of view on the left', () => {
      const scrollBySpy = vi.fn();
      const mockTabButtons = [
        { getBoundingClientRect: () => ({ left: 50, right: 150 }) },
        { getBoundingClientRect: () => ({ left: 160, right: 260 }) },
      ];
      component.tabNavBar = {
        nativeElement: {
          scrollBy: scrollBySpy,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelectorAll: () => mockTabButtons,
        },
      } as unknown as typeof component.tabNavBar;

      (projectStateService.selectedTabIndex as any).set(0);

      component.scrollToActiveTab();

      // Tab left (50) < container left (100), should scroll left
      expect(scrollBySpy).toHaveBeenCalledWith({
        left: expect.any(Number),
        behavior: 'smooth',
      });
      expect(scrollBySpy.mock.calls[0][0].left).toBeLessThan(0);
    });

    it('should scroll right when active tab is out of view on the right', () => {
      const scrollBySpy = vi.fn();
      const mockTabButtons = [
        { getBoundingClientRect: () => ({ left: 110, right: 200 }) },
        { getBoundingClientRect: () => ({ left: 350, right: 450 }) },
      ];
      component.tabNavBar = {
        nativeElement: {
          scrollBy: scrollBySpy,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelectorAll: () => mockTabButtons,
        },
      } as unknown as typeof component.tabNavBar;

      (projectStateService.selectedTabIndex as any).set(1);

      component.scrollToActiveTab();

      // Tab right (450) > container right (400), should scroll right
      expect(scrollBySpy).toHaveBeenCalledWith({
        left: expect.any(Number),
        behavior: 'smooth',
      });
      expect(scrollBySpy.mock.calls[0][0].left).toBeGreaterThan(0);
    });

    it('should not scroll when active tab is already visible', () => {
      const scrollBySpy = vi.fn();
      const mockTabButtons = [
        { getBoundingClientRect: () => ({ left: 150, right: 250 }) },
        { getBoundingClientRect: () => ({ left: 260, right: 360 }) },
      ];
      component.tabNavBar = {
        nativeElement: {
          scrollBy: scrollBySpy,
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelectorAll: () => mockTabButtons,
        },
      } as unknown as typeof component.tabNavBar;

      (projectStateService.selectedTabIndex as any).set(0);

      component.scrollToActiveTab();

      // Tab is within view, should not scroll
      expect(scrollBySpy).not.toHaveBeenCalled();
    });

    it('should handle missing tabNavBar gracefully', () => {
      // @ts-expect-error Testing undefined case
      component.tabNavBar = undefined;

      expect(() => component.scrollToActiveTab()).not.toThrow();
    });

    it('should handle missing active tab button gracefully', () => {
      component.tabNavBar = {
        nativeElement: {
          scrollBy: vi.fn(),
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelectorAll: () => [], // No tab buttons
        },
      } as unknown as typeof component.tabNavBar;

      expect(() => component.scrollToActiveTab()).not.toThrow();
    });

    it('should handle out of bounds tab index gracefully', () => {
      component.tabNavBar = {
        nativeElement: {
          scrollBy: vi.fn(),
          getBoundingClientRect: () => ({ left: 100, right: 400 }),
          querySelectorAll: () => [
            { getBoundingClientRect: () => ({ left: 150, right: 250 }) },
          ],
        },
      } as unknown as typeof component.tabNavBar;

      (projectStateService.selectedTabIndex as any).set(5); // Out of bounds

      expect(() => component.scrollToActiveTab()).not.toThrow();
    });
  });

  describe('getTabIcon', () => {
    it('should return home icon for home system tab', () => {
      const tab: AppTab = {
        id: 'home',
        name: 'Home',
        type: 'system',
        systemType: 'home',
      };
      expect(component.getTabIcon(tab)).toBe('home');
    });

    it('should return list icon for documents-list system tab', () => {
      const tab: AppTab = {
        id: 's',
        name: 'Docs',
        type: 'system',
        systemType: 'documents-list',
      };
      expect(component.getTabIcon(tab)).toBe('list');
    });

    it('should return perm_media icon for media system tab', () => {
      const tab: AppTab = {
        id: 's',
        name: 'Media',
        type: 'system',
        systemType: 'media',
      };
      expect(component.getTabIcon(tab)).toBe('perm_media');
    });

    it('should return description icon for templates-list system tab', () => {
      const tab: AppTab = {
        id: 's',
        name: 'Tpl',
        type: 'system',
        systemType: 'templates-list',
      };
      expect(component.getTabIcon(tab)).toBe('description');
    });

    it('should return settings icon for settings system tab', () => {
      const tab: AppTab = {
        id: 's',
        name: 'Settings',
        type: 'system',
        systemType: 'settings',
      };
      expect(component.getTabIcon(tab)).toBe('settings');
    });

    it('should return article as fallback for unknown system tab type', () => {
      const tab: AppTab = {
        id: 's',
        name: 'X',
        type: 'system',
        systemType: 'relationships-list',
      };
      expect(component.getTabIcon(tab)).toBe('article');
    });

    it('should return publish icon for publishPlan tab', () => {
      const tab: AppTab = { id: 'pp1', name: 'Plan', type: 'publishPlan' };
      expect(component.getTabIcon(tab)).toBe('publish');
    });

    it('should return folder icon for folder tab', () => {
      const tab: AppTab = {
        id: 'f1',
        name: 'Folder',
        type: 'folder',
        element: mockDocuments[1],
      };
      expect(component.getTabIcon(tab)).toBe('folder');
    });

    it('should return hub icon for relationship-chart tab', () => {
      const tab: AppTab = {
        id: 'rc1',
        name: 'Chart',
        type: 'relationship-chart',
      };
      expect(component.getTabIcon(tab)).toBe('hub');
    });

    it('should return dashboard icon for canvas tab', () => {
      const tab: AppTab = { id: 'c1', name: 'Canvas', type: 'canvas' };
      expect(component.getTabIcon(tab)).toBe('dashboard');
    });

    it('should return category for worldbuilding tab with no schema', () => {
      const tab: AppTab = {
        id: 'wb1',
        name: 'WB',
        type: 'worldbuilding',
        element: mockDocuments[0],
      };
      expect(component.getTabIcon(tab)).toBe('category');
    });

    it('should return insert_drive_file for document tab', () => {
      const tab: AppTab = {
        id: 'doc1',
        name: 'Doc',
        type: 'document',
        element: mockDocuments[0],
      };
      expect(component.getTabIcon(tab)).toBe('insert_drive_file');
    });
  });

  describe('context menu', () => {
    it('should set contextTabIndex and contextTab on onTabContextMenu', () => {
      component.onTabContextMenu(1, mockTabs[1]);
      expect(component.contextTabIndex).toBe(1);
      expect(component.contextTab).toBe(mockTabs[1]);
    });

    it('should clear context state on onContextMenuClose', () => {
      component.onTabContextMenu(1, mockTabs[1]);
      component.onContextMenuClose();
      expect(component.contextTabIndex).toBeNull();
      expect(component.contextTab).toBeNull();
    });

    it('hasTabsToRight returns false when contextTabIndex is null', () => {
      component.contextTabIndex = null;
      expect(component.hasTabsToRight()).toBe(false);
    });

    it('hasTabsToRight returns true when there are tabs to the right', () => {
      component.contextTabIndex = 0;
      expect(component.hasTabsToRight()).toBe(true);
    });

    it('hasTabsToRight returns false when context tab is the last one', () => {
      component.contextTabIndex = mockTabs.length - 1;
      expect(component.hasTabsToRight()).toBe(false);
    });

    it('hasOtherTabs returns false when only 2 tabs exist', () => {
      (projectStateService.openTabs as any).set([mockTabs[0], mockTabs[1]]);
      expect(component.hasOtherTabs()).toBe(false);
    });

    it('hasOtherTabs returns true when more than 2 tabs exist', () => {
      expect(component.hasOtherTabs()).toBe(true); // mockTabs has 3
    });

    it('closeTabsToRight does nothing when contextTabIndex is null', () => {
      component.contextTabIndex = null;
      component.closeTabsToRight();
      expect(projectStateService.closeTab).not.toHaveBeenCalled();
    });

    it('closeOtherTabs does nothing when contextTabIndex is null', () => {
      component.contextTabIndex = null;
      component.closeOtherTabs();
      expect(projectStateService.closeTab).not.toHaveBeenCalled();
    });
  });

  describe('closeAllTabs', () => {
    it('should close all non-home tabs and navigate to home', () => {
      const tabs: AppTab[] = [
        { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
        {
          id: 'doc1',
          name: 'Doc 1',
          type: 'document',
          element: mockDocuments[0],
        },
        {
          id: 'doc2',
          name: 'Doc 2',
          type: 'document',
          element: mockDocuments[1],
        },
      ];
      (projectStateService.openTabs as any).set(tabs);
      const onTabChangeSpy = vi.spyOn(component, 'onTabChange');

      component.closeAllTabs();

      expect(projectStateService.closeTab).toHaveBeenCalledTimes(2);
      expect(onTabChangeSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('isProjectRoute', () => {
    it('should return false for reserved paths', () => {
      expect((component as any).isProjectRoute('/admin/dashboard')).toBe(false);
      expect((component as any).isProjectRoute('/setup')).toBe(false);
      expect((component as any).isProjectRoute('/api/something')).toBe(false);
    });

    it('should return true for project routes', () => {
      expect((component as any).isProjectRoute('/username/project')).toBe(true);
    });
  });
});
