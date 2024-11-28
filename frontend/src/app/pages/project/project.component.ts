import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTreeModule } from '@angular/material/tree';
import { ActivatedRoute } from '@angular/router';
import { ProjectTreeService } from '@services/project-tree.service';
import { Subscription } from 'rxjs';
import { Project, ProjectAPIService } from 'worm-api-client';

import { ElementEditorComponent } from '../../components/element-editor/element-editor.component';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatTabsModule,
    MatButtonModule,
    MatTreeModule,
    MatSnackBarModule,
    MatProgressBarModule,
    ProjectTreeComponent,
    ProjectMainMenuComponent,
    ElementEditorComponent,
  ],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss',
})
export class ProjectComponent implements OnInit, OnDestroy {
  // Service injections
  readonly route = inject(ActivatedRoute);
  readonly projectService = inject(ProjectAPIService);
  readonly treeService = inject(ProjectTreeService);
  readonly snackBar = inject(MatSnackBar);

  // Public state
  project: Project | null = null;

  // Tree service signals
  readonly treeElements = this.treeService.elements;
  readonly isLoadingTree = this.treeService.isLoading;
  readonly isSavingTree = this.treeService.isSaving;
  readonly treeError = this.treeService.error;

  // Computed signals
  readonly isLoading = computed(() => {
    return !this.project || this.isLoadingTree();
  });

  // Subscriptions
  private routeParamsSub?: Subscription;

  ngOnInit(): void {
    this.routeParamsSub = this.route.params.subscribe(params => {
      const username = params['username'] as string;
      const slug = params['slug'] as string;
      void this.loadProject(username, slug);
    });
  }

  ngOnDestroy(): void {
    this.routeParamsSub?.unsubscribe();
  }

  private async loadProject(username: string, slug: string): Promise<void> {
    try {
      // Load project details
      const project = await this.projectService
        .getProjectByUsernameAndSlug(username, slug)
        .toPromise();

      this.project = project ?? null;

      // Load project elements
      await this.treeService.loadProjectElements(username, slug);
    } catch (err) {
      console.error('Failed to load project:', err);
      this.snackBar.open('Failed to load project.', 'Close', {
        duration: 3000,
      });
    }
  }
}
