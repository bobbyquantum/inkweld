import { CommonModule } from '@angular/common';
import {
  Component,
  effect,
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
import { ActivatedRoute } from '@angular/router';
import { ElementEditorComponent } from '@components/element-editor/element-editor.component';
import { ProjectTreeComponent } from '@components/project-tree/project-tree.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { ProjectDto, ProjectElementDto } from '@worm/index';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import { DocumentSyncState } from '../../models/document-sync-state';

const MOBILE_BREAKPOINT = 768;

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
    ElementEditorComponent,
    CommonModule,
    UserMenuComponent,
  ],
})
export class ProjectComponent implements OnInit, OnDestroy {
  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  protected readonly projectState = inject(ProjectStateService);
  protected readonly DocumentSyncState = DocumentSyncState;
  protected readonly documentService = inject(DocumentService);
  protected readonly isMobile = signal(window.innerWidth < MOBILE_BREAKPOINT);

  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private startX = 0;
  private startWidth = 0;
  private paramsSubscription?: Subscription;
  private resizeSubscription?: Subscription;

  private errorEffect = effect(() => {
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

    // Handle responsive behavior
    this.resizeSubscription = fromEvent(window, 'resize')
      .pipe(
        debounceTime(100),
        map(() => window.innerWidth < MOBILE_BREAKPOINT),
        distinctUntilChanged()
      )
      .subscribe(isMobile => {
        this.isMobile.set(isMobile);
        if (!isMobile) {
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

    // Initialize sidenav width for desktop
    if (!this.isMobile()) {
      const storedWidth = localStorage.getItem('sidenavWidth');
      if (storedWidth) {
        const width = parseInt(storedWidth, 10);
        this.updateSidenavWidth(width);
      }
    }
  }

  ngOnDestroy() {
    this.paramsSubscription?.unsubscribe();
    this.resizeSubscription?.unsubscribe();
    this.errorEffect.destroy();
  }

  isLoading = () => this.projectState.isLoading();

  async toggleSidenav() {
    await this.sidenav.toggle();
  }

  onResizeStart(e: MouseEvent) {
    if (this.isMobile()) return;

    e.preventDefault();
    this.startX = e.clientX;
    this.startWidth = this.getSidenavWidth();

    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  }

  onFileOpened(element: ProjectElementDto) {
    this.projectState.openFile(element);
    if (this.isMobile()) {
      void this.sidenav.close();
    }
  }

  closeTab(index: number) {
    this.projectState.closeFile(index);
  }

  private getSidenavWidth(): number {
    const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');
    return sidenavEl?.offsetWidth ?? 200;
  }

  private updateSidenavWidth(width: number): void {
    const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');
    if (sidenavEl) {
      sidenavEl.style.width = `${width}px`;
      document.documentElement.style.setProperty(
        '--sidenav-width',
        `${width}px`
      );
    }
  }

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
