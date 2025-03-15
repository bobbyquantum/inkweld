import { CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
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
import { ActivatedRoute, Router } from '@angular/router';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { ProjectTreeComponent } from '@components/project-tree/project-tree.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { ProjectDto, ProjectElementDto } from '@inkweld/index';
import { DocumentService } from '@services/document.service';
import { ProjectImportExportService } from '@services/project-import-export.service';
import { ProjectStateService } from '@services/project-state.service';
import { Subject, Subscription, takeUntil } from 'rxjs';

import { FolderElementEditorComponent } from '../../components/folder-element-editor/folder-element-editor.component';
import { ImageElementEditorComponent } from '../../components/image-element-editor/image-element-editor.component';
import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { RecentFilesService } from '../../services/recent-files.service';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  imports: [
    MatButtonModule,
    MatSidenavModule,
    MatTabsModule,
    MatIconModule,
    DragDropModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    ProjectTreeComponent,
    DocumentElementEditorComponent,
    CommonModule,
    UserMenuComponent,
    ImageElementEditorComponent,
    FolderElementEditorComponent,
  ],
  standalone: true,
})
export class ProjectComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  public readonly isMobile = signal(false);
  protected readonly projectState = inject(ProjectStateService);
  protected readonly DocumentSyncState = DocumentSyncState;
  protected readonly documentService = inject(DocumentService);
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly route = inject(ActivatedRoute);
  protected readonly title = inject(Title);
  protected readonly router = inject(Router);
  protected readonly importExportService = inject(ProjectImportExportService);

  protected destroy$ = new Subject<void>();
  private readonly dialogGateway = inject(DialogGatewayService);
  private paramsSubscription?: Subscription;
  private syncSubscription?: Subscription;
  private hasUnsavedChanges = false;
  private startWidth = 0;

  private readonly errorEffect = effect(() => {
    const error = this.projectState.error();
    if (error) {
      this.snackBar.open(error, 'Close', { duration: 5000 });
    }
  });

  constructor() {
    effect(() => {
      const project = this.projectState.project() as ProjectDto | null;
      if (project) {
        this.title.setTitle(`${project.title}`);
      }
    });

    effect(() => {
      const openFiles = this.projectState.openFiles();
      const currentFile = openFiles[0];

      // Clean up previous subscription
      this.syncSubscription?.unsubscribe();

      if (currentFile?.id) {
        this.syncSubscription = this.documentService
          .getSyncStatus(currentFile.id)
          .subscribe(state => {
            this.hasUnsavedChanges = state === DocumentSyncState.Offline;
          });
      } else {
        this.hasUnsavedChanges = false;
      }
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
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Are you sure you want to leave?',
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
      }
    });
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
          const storedWidth = localStorage.getItem('sidenavWidth');
          if (storedWidth) {
            const width = parseInt(storedWidth, 10);
            this.updateSidenavWidth(width);
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
  }

  isLoading = () => this.projectState.isLoading();

  async toggleSidenav() {
    await this.sidenav.toggle();
  }

  onDragStart() {
    if (this.isMobile()) return;
    this.startWidth = this.getSidenavWidth();
  }

  onDragEnd(event: CdkDragEnd) {
    if (this.isMobile()) return;

    const delta = event.distance.x;
    const newWidth = Math.max(150, Math.min(600, this.startWidth + delta));
    this.updateSidenavWidth(newWidth);
    localStorage.setItem('sidenavWidth', newWidth.toString());

    event.source._dragRef.reset();
  }

  onFileOpened = (element: ProjectElementDto) => {
    this.projectState.openFile(element);
    if (this.isMobile()) {
      void this.sidenav.close();
    }
  };

  closeTab = (index: number) => {
    this.projectState.closeFile(index);
  };

  exitProject() {
    void this.router.navigate(['/']);
  }

  onRecentFileClick(fileId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === fileId);
    if (element) {
      this.projectState.openFile(element);
    }
  }

  onRecentFileKeydown(event: KeyboardEvent, fileId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.onRecentFileClick(fileId);
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

  private getSidenavWidth = (): number => {
    const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');
    return sidenavEl?.offsetWidth ?? 200;
  };

  private updateSidenavWidth = (width: number): void => {
    const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');
    if (sidenavEl) {
      sidenavEl.style.width = `${width}px`;
      document.documentElement.style.setProperty(
        '--sidenav-width',
        `${width}px`
      );
    }
  };
}
