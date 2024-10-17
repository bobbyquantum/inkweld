import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { ActivatedRoute } from '@angular/router';
import { ProjectElement } from '@components/project-tree/ProjectElement';
import { TREE_DATA } from '@components/project-tree/TREE_DATA';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { Editor, NgxEditorModule } from 'ngx-editor';
import { Project, ProjectAPIService, User } from 'worm-api-client';
import { ProjectMainMenuComponent } from '../../components/project-main-menu/project-main-menu.component';
import { ProjectTreeComponent } from '../../components/project-tree/project-tree.component';

interface FileNode {
  name: string;
  type: string;
  children?: FileNode[];
  expanded?: boolean;
}

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
    UserMenuComponent,
    NgxEditorModule,
    MatSnackBarModule,
    ProjectTreeComponent,
    ProjectMainMenuComponent,
  ],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss',
})
export class ProjectComponent implements OnInit, OnDestroy {
  editor!: Editor;
  project: Project | null = null;
  user: User | undefined;
  zoomLevel = 100;

  dataSource = new MatTreeNestedDataSource<FileNode>();

  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectAPIService);
  private snackBar = inject(MatSnackBar);

  treeData: ProjectElement[] = TREE_DATA;

  hasChild = (_: number, node: FileNode) =>
    !!node.children && node.children.length > 0;

  childrenAccessor = (node: FileNode) => node.children ?? [];

  ngOnInit(): void {
    this.editor = new Editor({
      plugins: [],
    });

    this.route.params.subscribe(params => {
      const username = params['username'];
      const slug = params['slug'];
      this.loadProject(username, slug);
    });
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }
  increaseZoom() {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 10;
      this.updateZoom();
    }
  }

  decreaseZoom() {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
      this.updateZoom();
    }
  }
  updateZoom() {
    document.documentElement.style.setProperty(
      '--editor-zoom',
      (this.zoomLevel / 100).toString()
    );
  }

  private loadProject(username: string, slug: string): void {
    this.projectService.getProjectByUsernameAndSlug(username, slug).subscribe({
      next: (project: Project) => {
        this.project = project;
      },
      error: error => {
        console.error('Error loading project:', error);
        this.snackBar.open('Failed to load project.', 'Close', {
          duration: 3000,
        });
      },
    });
  }
}
