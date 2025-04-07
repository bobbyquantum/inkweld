import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { CommonModule } from '@angular/common';
import { signal } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  convertToParamMap,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router';
import { ProjectDto, ProjectElementDto } from '@inkweld/index';
import { of, Subject } from 'rxjs';

import { DocumentSyncState } from '../../../models/document-sync-state';
import { DialogGatewayService } from '../../../services/dialog-gateway.service';
import { DocumentService } from '../../../services/document.service';
import { ProjectStateService } from '../../../services/project-state.service';
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
  } as ProjectDto;

  const mockDocuments: ProjectElementDto[] = [
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
  ];

  const setupMockServices = () => {
    // Initialize signals
    const projectSignal = signal(mockProject);
    const openDocumentsSignal = signal<ProjectElementDto[]>([...mockDocuments]);
    const selectedTabIndexSignal = signal<number>(0);
    const isLoadingSignal = signal<boolean>(false);

    // Mock project state service
    projectStateService = {
      project: projectSignal,
      openDocuments: openDocumentsSignal,
      selectedTabIndex: selectedTabIndexSignal,
      isLoading: isLoadingSignal,
      openDocument: jest.fn(),
      closeDocument: jest.fn(),
      renameNode: jest.fn(),
    };

    // Mock document service
    documentService = {
      initializeSyncStatus: jest.fn(),
      getSyncStatus: jest.fn().mockReturnValue(of(DocumentSyncState.Synced)),
    };

    // Mock dialog gateway service
    dialogGatewayService = {
      openRenameDialog: jest.fn().mockResolvedValue('New Name'),
    };

    // Mock router
    routerEvents = new Subject<NavigationEnd>();
    router = {
      navigate: jest.fn().mockResolvedValue(true),
      events: routerEvents.asObservable(),
    };

    // Mock activated route with childRoutes for tab ID extraction
    activatedRoute = {
      root: {
        firstChild: {
          firstChild: {
            outlet: 'primary',
            snapshot: {
              paramMap: convertToParamMap({ tabId: null }),
            } as unknown as ActivatedRouteSnapshot,
          } as unknown as ActivatedRoute,
        },
      },
      paramMap: of(convertToParamMap({})),
    } as unknown as ActivatedRoute;

    // Mock dialog
    dialog = {
      open: jest.fn().mockReturnValue({
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
        NoopAnimationsModule,
      ],
      providers: [
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
    const selectedTabIndexSpy = jest.spyOn(
      projectStateService.selectedTabIndex as any,
      'set'
    );
    component.onTabChange(1);
    expect(selectedTabIndexSpy).toHaveBeenCalledWith(1);
  });

  it('should close a tab when closeTab is called', () => {
    component.closeTab(1);
    expect(projectStateService.closeDocument).toHaveBeenCalledWith(0); // Index 1 - 1 (home tab offset)
  });

  it('should navigate to previous tab when current tab is closed', () => {
    // Set current tab to 1 (first document)
    (projectStateService.selectedTabIndex as any).set(1);
    fixture.detectChanges();

    // Mock tab change method
    jest.spyOn(component, 'onTabChange');

    // Close the current tab
    component.closeTab(1);

    // Should navigate to tab 0 (home)
    expect(component.onTabChange).toHaveBeenCalledWith(0);
    expect(projectStateService.closeDocument).toHaveBeenCalledWith(0); // Index 1 - 1 (home tab offset)
  });

  it('should not close home tab', () => {
    component.closeTab(0);
    expect(projectStateService.closeDocument).not.toHaveBeenCalled();
  });

  it('should handle click event when closing a tab', () => {
    const mockEvent = new MouseEvent('click');
    jest.spyOn(mockEvent, 'preventDefault');
    jest.spyOn(mockEvent, 'stopPropagation');

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
    const document = mockDocuments[0];

    component.onTabContextMenu(tabIndex, document);

    expect(component.contextTabIndex).toBe(tabIndex);
    expect(component.contextDocument).toBe(document);
  });

  it('should close the tab context menu', () => {
    component.contextTabIndex = 1;
    component.contextDocument = mockDocuments[0];

    component.onContextMenuClose();

    expect(component.contextTabIndex).toBeNull();
    expect(component.contextDocument).toBeNull();
  });

  it('should rename a tab element', async () => {
    const document = mockDocuments[0];
    const newName = 'New Document Name';
    (dialogGatewayService.openRenameDialog as jest.Mock).mockResolvedValue(
      newName
    );

    await component.onRenameTabElement(document);

    expect(dialogGatewayService.openRenameDialog).toHaveBeenCalledWith({
      currentName: document.name,
      title: 'Rename Document',
    });
    expect(projectStateService.renameNode).toHaveBeenCalledWith(
      document,
      newName
    );
  });

  it('should get the correct sync status color for documents', () => {
    (documentService.getSyncStatus as jest.Mock).mockImplementation(
      (docId: string) => {
        if (docId === 'testuser:test-project:doc1') {
          return of(DocumentSyncState.Synced);
        } else if (docId === 'testuser:test-project:doc2') {
          return of(DocumentSyncState.Offline);
        }
        return of(DocumentSyncState.Unavailable);
      }
    );

    // Synced document
    const syncedColor = component.getSyncStatusColor(
      'testuser',
      'test-project',
      'doc1'
    );
    expect(syncedColor).toBe('#4caf50');

    // Offline document
    const offlineColor = component.getSyncStatusColor(
      'testuser',
      'test-project',
      'doc2'
    );
    expect(offlineColor).toBe('var(--mat-sys-outline)');

    // Invalid document should return default
    const defaultColor = component.getSyncStatusColor(
      undefined,
      undefined,
      undefined
    );
    expect(defaultColor).toBe('var(--mat-primary-color)');
  });

  it('should emit importRequested when onImportRequested is called', () => {
    jest.spyOn(component.importRequested, 'emit');
    component.onImportRequested();
    expect(component.importRequested.emit).toHaveBeenCalled();
  });

  it('should update selected tab from URL', fakeAsync(() => {
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

    // Add documents to open documents list
    (projectStateService.openDocuments as any).set([...mockDocuments]);

    // Mock selectedTabIndex.set method
    const selectedTabIndexSpy = jest.spyOn(
      projectStateService.selectedTabIndex as any,
      'set'
    );

    component.updateSelectedTabFromUrl();
    tick();

    // Should set tab index to document index + 1 (for home tab)
    expect(selectedTabIndexSpy).toHaveBeenCalledWith(2);
  }));

  it('should set selectedTabIndex to 0 when URL has no tabId', fakeAsync(() => {
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

    // Mock selectedTabIndex.set method
    const selectedTabIndexSpy = jest.spyOn(
      projectStateService.selectedTabIndex as any,
      'set'
    );

    component.updateSelectedTabFromUrl();
    tick();

    // Should set tab index to 0 (home tab)
    expect(selectedTabIndexSpy).toHaveBeenCalledWith(0);
  }));

  it('should handle router navigation events', fakeAsync(() => {
    jest.spyOn(component, 'updateSelectedTabFromUrl');

    // Set initialSyncDone to true to allow the navigation event handler to run
    component['initialSyncDone'] = true;

    // Create a navigation end event
    const navigationEndEvent = new NavigationEnd(1, 'test', 'test');
    routerEvents.next(navigationEndEvent);
    tick();

    expect(component.updateSelectedTabFromUrl).toHaveBeenCalled();
  }));

  it('should clean up subscriptions on destroy', () => {
    const mockSubscription = {
      unsubscribe: jest.fn(),
    };
    component['routerSubscription'] = mockSubscription as any;

    const destroyNextSpy = jest.spyOn(component['destroy$'] as any, 'next');
    const destroyCompleteSpy = jest.spyOn(
      component['destroy$'] as any,
      'complete'
    );

    component.ngOnDestroy();

    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(destroyNextSpy).toHaveBeenCalled();
    expect(destroyCompleteSpy).toHaveBeenCalled();
  });
});
