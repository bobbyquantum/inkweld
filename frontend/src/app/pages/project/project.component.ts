import { NgIf } from '@angular/common';
import {
  Component,
  effect,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProjectElementDto } from 'worm-api-angular-client';

import { ElementEditorComponent } from '../../components/element-editor/element-editor.component';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';
import { ProjectStateService } from '../../services/project-state.service';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  standalone: true,
  imports: [
    NgIf,
    MatSidenavModule,
    MatTabsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ProjectMainMenuComponent,
    ProjectTreeComponent,
    ElementEditorComponent,
  ],
})
export class ProjectComponent implements OnInit, OnDestroy {
  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  protected readonly projectState = inject(ProjectStateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);

  private startX = 0;
  private startWidth = 0;
  private paramsSubscription?: Subscription;
  private errorEffect = effect(() => {
    const error = this.projectState.error();
    if (error) {
      this.snackBar.open(error, 'Close', { duration: 5000 });
    }
  });

  ngOnInit() {
    this.paramsSubscription = this.route.params.subscribe(params => {
      const username = params['username'] as string;
      const slug = params['slug'] as string;
      if (username && slug) {
        void this.projectState.loadProject(username, slug);
      }
    });
  }

  ngOnDestroy() {
    this.paramsSubscription?.unsubscribe();
    this.errorEffect.destroy();
  }

  isLoading = () => this.projectState.isLoading();

  onResizeStart(e: MouseEvent) {
    e.preventDefault();
    this.startX = e.clientX;
    this.startWidth = this.getSidenavWidth();

    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  }

  onFileOpened(element: ProjectElementDto) {
    this.projectState.openFile(element);
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
  };
}
