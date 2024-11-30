import { Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { Project, ProjectAPIService } from 'worm-api-client';

import { ElementEditorComponent } from '../../components/element-editor/element-editor.component';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';
import { ProjectTreeService } from '../../services/project-tree.service';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  standalone: true,
  imports: [
    MatSidenavModule,
    MatTabsModule,
    ProjectMainMenuComponent,
    ProjectTreeComponent,
    ElementEditorComponent,
  ],
})
export class ProjectComponent implements OnInit, OnDestroy {
  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  project: Project | null = null;

  private startX = 0;
  private startWidth = 0;
  private paramsSubscription?: Subscription;
  private readonly projectService = inject(ProjectAPIService);
  private readonly treeService = inject(ProjectTreeService);
  private readonly route = inject(ActivatedRoute);

  ngOnInit() {
    this.paramsSubscription = this.route.params.subscribe(params => {
      const username = params['username'] as string;
      const slug = params['slug'] as string;
      if (username && slug) {
        this.loadProject(username, slug);
      }
    });
  }

  ngOnDestroy() {
    this.paramsSubscription?.unsubscribe();
  }

  isLoading = () => this.treeService.isLoading();

  onResizeStart(e: MouseEvent) {
    e.preventDefault();
    const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');
    if (!sidenavEl) return;

    this.startX = e.clientX;
    this.startWidth = sidenavEl.offsetWidth;

    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  }

  private loadProject(username: string, slug: string) {
    void this.projectService
      .getProjectByUsernameAndSlug(username, slug)
      .subscribe(project => {
        this.project = project;
        if (project) {
          void this.treeService.loadProjectElements(username, slug);
        }
      });
  }

  private onResizeMove = (e: MouseEvent) => {
    const diff = e.clientX - this.startX;
    const newWidth = Math.max(150, Math.min(600, this.startWidth + diff));
    const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');

    if (sidenavEl) {
      sidenavEl.style.width = `${newWidth}px`;
      document.documentElement.style.setProperty(
        '--sidenav-width',
        `${newWidth}px`
      );
    }
  };

  private onResizeEnd = () => {
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
  };
}
