import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  Router,
  RouterModule,
  RouterOutlet,
} from '@angular/router';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { ProjectTreeComponent } from '@components/project-tree/project-tree.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { ProjectDto, ProjectElementDto } from '@inkweld/index';
import { DocumentService } from '@services/document.service';
import { ProjectImportExportService } from '@services/project-import-export.service';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { AngularSplitModule, SplitGutterInteractionEvent } from 'angular-split';
import { Subject, Subscription, takeUntil } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { RecentFilesService } from '../../services/recent-files.service';
import { TabInterfaceComponent } from './tabs/tab-interface.component';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  imports: [
    MatButtonModule,
    MatSidenavModule,
    MatTabsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    ProjectTreeComponent,
    DocumentElementEditorComponent,
    CommonModule,
    RouterModule,
    UserMenuComponent,
    RouterOutlet,
    TabInterfaceComponent,
    AngularSplitModule,
  ],
  standalone: true,
})
export class ProjectComponent implements OnInit, OnDestroy, AfterViewInit {
  protected readonly projectState = inject(ProjectStateService);

  protected readonly documentService = inject(DocumentService);
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly route = inject(ActivatedRoute);
  protected readonly title = inject(Title);
  protected readonly router = inject(Router);
  protected readonly importExportService = inject(ProjectImportExportService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly settingsService = inject(SettingsService);

  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  public readonly isMobile = signal(false);
  public readonly isZenMode = signal(false);

  protected destroy$ = new Subject<void>();
  protected readonly errorEffect = effect(() => {
    const error = this.projectState.error();
    if (error) {
      this.snackBar.open(error, 'Close', { duration: 5000 });
    }
  });
  protected readonly DocumentSyncState = DocumentSyncState;
  private paramsSubscription?: Subscription;
  private syncSubscription?: Subscription;
  private hasUnsavedChanges = false;
  private fullscreenListener?: () => void;

  // Split size for desktop layout
  protected splitSize = 25; // Default split size as percentage

  constructor() {
    effect(() => {
      const project = this.projectState.project() as ProjectDto | null;
      if (project) {
        this.title.setTitle(`${project.title}`);
      }
    });

    effect(() => {
      const openDocuments = this.projectState.openDocuments();
      const currentDocument = openDocuments[0];
      // Clean up previous subscription
      this.syncSubscription?.unsubscribe();
      if (currentDocument?.id) {
        this.syncSubscription = this.documentService
          .getSyncStatus(currentDocument.id)
          .subscribe(state => {
            // Only consider changes as "unsynced" when user is working offline AND has pending changes
            this.hasUnsavedChanges =
              state === DocumentSyncState.Offline &&
              this.documentService.hasUnsyncedChanges(currentDocument.id);
          });
      } else {
        this.hasUnsavedChanges = false;
      }
    });

    // Disable zen mode when switching tabs or closing documents
    effect(() => {
      // Check if current tab can support zen mode
      if (this.isZenMode() && !this.canEnableZenMode()) {
        this.isZenMode.set(false);
      }

      // Trigger on tab changes - access to watch for changes
      this.projectState.selectedTabIndex();
      // Trigger on document count changes - access to watch for changes
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this.projectState.openDocuments().length;
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
    return true;
  }

  async canDeactivate(): Promise<boolean> {
    console.log('Checking project de-activation guard');
    if (!this.hasUnsavedChanges) {
      return true;
    }

    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Unsynced Changes',
      message:
        "You have changes that haven't been synced to the server yet. Are you sure you want to leave?",
      confirmText: 'Leave',
      cancelText: 'Stay',
    });

    return confirmed;
  }

  ngOnInit() {
    console.log('ProjectComponent init');
    this.paramsSubscription = this.route.params.subscribe(params => {
      const username = params['username'] as string;
      const slug = params['slug'] as string;
      if (username && slug) {
        console.log(`Loading project ${username}/${slug}`);
        void this.projectState.loadProject(username, slug);

        // Ensure we're starting with tab index 0 (home tab)
        this.projectState.selectedTabIndex.set(0);

        // Check if we have a tabId parameter, which would indicate we should open a document/folder
        const tabId = this.route.snapshot.paramMap.get('tabId');
        if (tabId) {
          const tabType = this.route.snapshot.url.find(
            segment => segment.path === 'document' || segment.path === 'folder'
          )?.path;

          console.log(`Opening tab: ${tabType}/${tabId}`);

          // Find the element in the project elements
          setTimeout(() => {
            const elements = this.projectState.elements();
            const element = elements.find(e => e.id === tabId);
            if (element) {
              this.projectState.openDocument(element);
            }
          }, 500); // Short delay to ensure project is loaded
        }
      }
    });

    // Add fullscreenchange event listener to handle when user presses Escape to exit fullscreen
    this.fullscreenListener = () => {
      // If fullscreen was exited and we're in zen mode, also exit zen mode
      if (!document.fullscreenElement && this.isZenMode()) {
        this.isZenMode.set(false);
      }
    };
    document.addEventListener('fullscreenchange', this.fullscreenListener);
  }

  ngAfterViewInit() {
    this.setupBreakpointObserver();
  }

  setupBreakpointObserver() {
    this.breakpointObserver
      .observe('(max-width: 759px)')
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile.set(result.matches);
        if (!result.matches) {
          this.sidenav.mode = 'side';
          void this.sidenav.open();
          // Load saved split size
          const storedSplitSize = localStorage.getItem('splitSize');
          if (storedSplitSize) {
            this.splitSize = parseInt(storedSplitSize, 10);
          }
        } else {
          this.sidenav.mode = 'over';
          void this.sidenav.close();
        }
      });
  }

  ngOnDestroy() {
    this.paramsSubscription?.unsubscribe();
    this.syncSubscription?.unsubscribe();
    this.errorEffect.destroy();
    this.destroy$.next();
    this.destroy$.complete();

    // Remove fullscreenchange event listener
    if (this.fullscreenListener) {
      document.removeEventListener('fullscreenchange', this.fullscreenListener);
    }
  }

  isLoading = () => this.projectState.isLoading();

  async toggleSidenav() {
    await this.sidenav.toggle();
  }

  // Handle split drag end event
  onSplitDragEnd(event: SplitGutterInteractionEvent) {
    if (this.isMobile()) return;

    // Extract the first size which should be the sidebar and ensure it's a number
    const sizeValue = event.sizes[0];
    // Convert to number regardless of whether it's a string or number
    this.splitSize =
      typeof sizeValue === 'string' ? parseFloat(sizeValue) : Number(sizeValue);
    localStorage.setItem('splitSize', this.splitSize.toString());
  }

  onDocumentOpened = (element: ProjectElementDto) => {
    this.projectState.openDocument(element);
    if (this.isMobile()) {
      void this.sidenav.close();
    }
  };

  closeTab = (index: number) => {
    this.projectState.closeDocument(index);
  };

  onImportClicked = (): void => {
    this.fileInput?.nativeElement.click();
  };

  exitProject() {
    void this.router.navigate(['/']);
  }

  onRecentDocumentClick(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.projectState.openDocument(element);
    }
  }

  onRecentDocumentKeydown(event: KeyboardEvent, documentId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.onRecentDocumentClick(documentId);
    }
  }

  public onExportClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.importExportService.exportProjectZip();
    }
  }

  public onImportClick(): void {
    this.fileInput?.nativeElement.click();
  }

  public onPublishClick(): void {
    const project = this.projectState.project();
    console.log('Publishing project:', project);
    if (project) {
      void this.projectState.publishProject(project);
    }
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const project = this.projectState.project();
      if (project) {
        void this.importExportService.importProjectZip(input.files[0]);
      }
    }
  }

  openEditDialog() {
    const project = this.projectState.project();
    void this.dialogGateway.openEditProjectDialog(project!);
  }

  toggleZenMode(): void {
    // Only allow toggling zen mode if we can enable it
    if (!this.canEnableZenMode() && !this.isZenMode()) {
      return;
    }

    this.isZenMode.update(current => {
      const newValue = !current;

      // Check if fullscreen is enabled in settings
      const fullscreenEnabled = this.settingsService.getSetting<boolean>(
        'zenModeFullscreen',
        true
      );

      // Handle fullscreen based on zen mode state and user settings
      if (newValue && fullscreenEnabled) {
        // Entering zen mode - request fullscreen if enabled in settings
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Error attempting to enable fullscreen:', err);
        });
      } else if (!newValue && document.fullscreenElement) {
        // Exiting zen mode - exit fullscreen if we're in it
        document.exitFullscreen().catch(err => {
          console.warn('Error attempting to exit fullscreen:', err);
        });
      }

      return newValue;
    });
  }

  canEnableZenMode(): boolean {
    // Zen mode should only be enabled when:
    // 1. A document element is open for editing
    // 2. It's the current selected tab
    const currentTabIndex = this.projectState.selectedTabIndex();
    const openDocuments = this.projectState.openDocuments();

    // If the home tab is selected (index 0), or no documents are open, zen mode cannot be enabled
    if (currentTabIndex === 0 || openDocuments.length === 0) {
      return false;
    }

    // Get the current document
    const currentDocument = openDocuments[currentTabIndex - 1]; // Adjust for home tab

    // Zen mode should only be available for document elements, not folders
    return currentDocument && currentDocument.type !== 'FOLDER';
  }

  getZenModeIcon(): string {
    return 'self_improvement';
  }

  getCurrentDocumentId(): string | null {
    // Check if we're on a document route
    const url = this.router.url;
    if (!url.includes('/document/')) {
      return null;
    }

    const currentTabIndex = this.projectState.selectedTabIndex();
    const openDocuments = this.projectState.openDocuments();

    // If the home tab is selected (index 0), or no documents are open, return null
    if (currentTabIndex === 0 || openDocuments.length === 0) {
      return null;
    }

    // Get the current document
    const currentDocument = openDocuments[currentTabIndex - 1]; // Adjust for home tab

    // Return document ID for non-folder documents only
    if (currentDocument && currentDocument.type !== 'FOLDER') {
      return `${this.projectState.project()!.username}:${this.projectState.project()!.slug}:${currentDocument.id}`;
    }

    return null;
  }

  // Method to determine gutterSize based on mobile state
  getGutterSize(): number {
    return this.isMobile() ? 0 : 8;
  }
}
