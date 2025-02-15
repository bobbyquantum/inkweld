import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  effect,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ElementEditorComponent } from '@components/element-editor/element-editor.component';
import { ProjectTreeComponent } from '@components/project-tree/project-tree.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { ProjectDto, ProjectElementDto } from '@worm/index';
import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs';

import { ConfirmationDialogComponent } from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import { DocumentSyncState } from '../../models/document-sync-state';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatSidenavModule,
    MatTabsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    ProjectTreeComponent,
    ElementEditorComponent,
    CommonModule,
    UserMenuComponent,
  ],
  standalone: true,
})
export class ProjectComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  public readonly isMobile = signal(false);
  protected readonly projectState = inject(ProjectStateService);
  protected readonly DocumentSyncState = DocumentSyncState;
  protected readonly documentService = inject(DocumentService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly route = inject(ActivatedRoute);
  protected readonly dialog = inject(MatDialog);
  protected readonly title = inject(Title);

  protected destroy$ = new Subject<void>();
  private startX = 0;
  private startWidth = 0;
  private paramsSubscription?: Subscription;
  private syncSubscription?: Subscription;
  private hasUnsavedChanges = false;

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

    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      void,
      boolean
    >(ConfirmationDialogComponent, {
      disableClose: true,
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? false;
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
      .observe([Breakpoints.XSmall, Breakpoints.Small])
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

  onResizeStart = (e: MouseEvent) => {
    if (this.isMobile()) return;

    e.preventDefault();
    this.startX = e.clientX;
    this.startWidth = this.getSidenavWidth();

    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  };

  onFileOpened = (element: ProjectElementDto) => {
    this.projectState.openFile(element);
    if (this.isMobile()) {
      void this.sidenav.close();
    }
  };

  closeTab = (index: number) => {
    this.projectState.closeFile(index);
  };

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

  private onResizeMove = (e: MouseEvent) => {
    const diff = e.clientX - this.startX;
    const newWidth = Math.max(150, Math.min(600, this.startWidth + diff));
    this.updateSidenavWidth(newWidth);
  };

  private onResizeEnd = () => {
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    localStorage.setItem('sidenavWidth', this.getSidenavWidth().toString());
  };
}
